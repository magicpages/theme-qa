// Writes the result of a visual comparison: one self-contained HTML page with
// the changed screenshots (GitHub can show it straight from the run page),
// a Markdown summary for the job summary, and the same data as JSON.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const escape = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const png = (buffer) => `data:image/png;base64,${buffer.toString('base64')}`;
const number = (n) => n.toLocaleString('en');
const label = (shot) => `${shot.page} · ${shot.viewport} · ${shot.scheme}`;
/** `main (1a2b3c4)`, or just the short commit when the ref is one. */
const baseLabel = ({ ref, sha }) =>
  sha.startsWith(ref) ? sha.slice(0, 7) : `${ref} (${sha.slice(0, 7)})`;

function describe(change) {
  const parts = [`${number(change.pixels)} pixels changed`];
  const { before, after, rows } = change;
  if (before.height !== after.height) {
    parts.push(`page height ${number(before.height)} → ${number(after.height)} px`);
  }
  if (before.width !== after.width) {
    parts.push(`page width ${number(before.width)} → ${number(after.width)} px`);
  }
  parts.push(`rows ${number(rows.first)}–${number(rows.last)}`);
  return parts.join(', ');
}

function section(shot) {
  const { change } = shot;
  const cut = change.rows.cut
    ? `<p class="note">Showing the first ${number(change.rows.shown)} rows of the change.</p>`
    : '';
  return `
<section id="${escape(shot.file)}">
  <h2>${escape(label(shot))}</h2>
  <p><code>${escape(shot.path)}</code> at ${shot.size.width}px wide: ${escape(describe(change))}.</p>
  ${cut}
  <div class="row" style="--width: ${shot.size.width}px">
    <figure><figcaption>Before</figcaption><img src="${png(change.images.before)}" alt="Before"></figure>
    <figure><figcaption>After</figcaption><img src="${png(change.images.after)}" alt="After"></figure>
    <figure><figcaption>Changed pixels</figcaption><img src="${png(change.images.diff)}" alt="Changed pixels"></figure>
  </div>
</section>`;
}

function html(results, meta) {
  const changed = results.filter((r) => r.change);
  const same = results.filter((r) => !r.change);
  const list = changed
    .map((r) => `<li><a href="#${escape(r.file)}">${escape(label(r))}</a></li>`)
    .join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Visual changes: ${escape(meta.theme)}</title>
<style>
  :root { color-scheme: light dark; font: 15px/1.5 system-ui, sans-serif; }
  body { margin: 0 auto; max-width: 1800px; padding: 24px; }
  h1 { margin: 0 0 4px; }
  h2 { margin: 48px 0 4px; font-size: 18px; }
  p { margin: 4px 0; }
  .note { color: #b45309; }
  .row { display: grid; grid-template-columns: repeat(3, minmax(0, var(--width))); gap: 16px; margin-top: 12px; }
  figure { margin: 0; }
  figcaption { font-weight: 600; margin-bottom: 4px; }
  img { display: block; width: 100%; border: 1px solid #8884; }
</style>
</head>
<body>
<h1>Visual changes: ${escape(meta.theme)}</h1>
<p>The theme at <code>${escape(baseLabel(meta.base))}</code> compared with this change, on the same Ghost ${escape(meta.ghostVersion)} site with the same content, profile <code>${escape(meta.profile)}</code>.</p>
<p>${changed.length} of ${results.length} screenshots look different.</p>
${changed.length ? `<ul>${list}</ul>` : ''}
${changed.map(section).join('\n')}
${same.length ? `<details><summary>${same.length} unchanged</summary><ul>${same.map((r) => `<li>${escape(label(r))}</li>`).join('')}</ul></details>` : ''}
</body>
</html>
`;
}

function markdown(results, meta) {
  const changed = results.filter((r) => r.change);
  const head = `Compared with \`${baseLabel(meta.base)}\`, profile \`${meta.profile}\`.`;
  if (!changed.length)
    return `### No visual changes\n\n${head} All ${results.length} screenshots look the same.\n`;
  const rows = changed.map((r) => `| ${label(r)} | \`${r.path}\` | ${describe(r.change)} |`);
  return [
    `### ${changed.length} of ${results.length} screenshots changed`,
    '',
    head,
    '',
    '| Screenshot | Path | Change |',
    '| --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
}

/**
 * @param {string} outDir
 * @param {ReturnType<typeof import('./diff.mjs').compareScreenshots>} results
 * @param {{ theme: string, profile: string, ghostVersion: string, base: { ref: string, sha: string } }} meta
 * @returns {{ changed: number, total: number, report: string, summary: string }}
 */
export function writeReport(outDir, results, meta) {
  const report = join(outDir, 'report.html');
  const summary = join(outDir, 'summary.md');
  writeFileSync(report, html(results, meta));
  writeFileSync(summary, markdown(results, meta));
  const changed = results.filter((r) => r.change);
  writeFileSync(
    join(outDir, 'changes.json'),
    `${JSON.stringify(
      {
        ...meta,
        total: results.length,
        changed: changed.map(({ change, ...shot }) => ({
          ...shot,
          pixels: change.pixels,
          before: change.before,
          after: change.after,
          rows: { first: change.rows.first, last: change.rows.last },
        })),
      },
      null,
      2,
    )}\n`,
  );
  return { changed: changed.length, total: results.length, report, summary };
}
