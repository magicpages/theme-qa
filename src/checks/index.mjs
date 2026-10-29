// Static checks: everything that needs the theme files and the zip, but no
// running Ghost.

import { execFileSync } from 'node:child_process';
import { relative, resolve } from 'node:path';
import { checkGscan } from './gscan.mjs';
import { checkLocales } from './locales.mjs';
import { checkPackageJson } from './package-json.mjs';
import { checkSettingsDiff } from './settings-diff.mjs';
import { checkZip } from './zip.mjs';

const CHECKS = [
  ['package-json', checkPackageJson],
  ['locales', checkLocales],
  ['settings-diff', checkSettingsDiff],
  ['gscan', checkGscan],
  ['zip', checkZip],
];

const SYMBOLS = { error: '✖', warning: '⚠', info: '·' };

/**
 * @returns {Promise<{ ok: boolean, results: { check: string, level: 'error' | 'warning' | 'info', message: string, file?: string }[], dir: string }>}
 *   `file` is relative to the theme folder; `dir` is that folder.
 */
export async function runStaticChecks(config, { zipPath } = {}) {
  const results = [];
  for (const [name, run] of CHECKS) {
    try {
      results.push(...(await run(config, { zipPath })));
    } catch (error) {
      // One broken check shouldn't hide the others' findings.
      results.push({ check: name, level: 'error', message: `Check crashed: ${error.message}` });
    }
  }
  return { ok: !results.some((result) => result.level === 'error'), results, dir: config.dir };
}

export function printStaticResults(report) {
  console.log('\n── Static checks');
  const byCheck = Map.groupBy(report.results, (result) => result.check);
  for (const [check, results] of byCheck) {
    const errors = results.filter((result) => result.level === 'error').length;
    const warnings = results.filter((result) => result.level === 'warning').length;
    const counts = [plural(errors, 'error'), plural(warnings, 'warning')].filter(Boolean);
    console.log(
      `\n${errors ? '✖' : '✔'} ${check}${counts.length ? ` (${counts.join(', ')})` : ''}`,
    );
    for (const result of results) {
      const where = result.file ? ` [${result.file}]` : '';
      console.log(`  ${SYMBOLS[result.level]} ${result.message}${where}`);
    }
  }

  const errors = report.results.filter((result) => result.level === 'error').length;
  const warnings = report.results.filter((result) => result.level === 'warning').length;
  console.log(
    `\n${report.ok ? '✔ Static checks passed' : '✖ Static checks failed'}: ` +
      `${errors} error(s), ${warnings} warning(s).`,
  );

  if (process.env.GITHUB_ACTIONS === 'true') printAnnotations(report);
}

// GitHub matches annotation paths against the repository root, which can be
// above the theme folder (monorepos, themes in a subfolder).
function printAnnotations(report) {
  const root = repoRoot(report.dir);
  const command = { error: 'error', warning: 'warning', info: 'notice' };
  for (const result of report.results) {
    // Info without a file has nothing to point at; it's in the log already.
    if (result.level === 'info' && !result.file) continue;
    const props = [`title=${escapeProperty(`theme-qa ${result.check}`)}`];
    if (result.file) {
      props.unshift(`file=${escapeProperty(relative(root, resolve(report.dir, result.file)))}`);
    }
    console.log(`::${command[result.level]} ${props.join(',')}::${escapeData(result.message)}`);
  }
}

function repoRoot(dir) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return dir;
  }
}

function plural(count, word) {
  if (count === 0) return '';
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function escapeData(value) {
  return value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function escapeProperty(value) {
  return escapeData(value).replace(/:/g, '%3A').replace(/,/g, '%2C');
}
