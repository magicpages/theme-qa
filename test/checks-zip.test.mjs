import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkZip } from '../src/checks/zip.mjs';
import { createZip } from '../src/theme.mjs';

const THEME = [
  { name: 'index.hbs', data: Buffer.from('{{!< default}}') },
  { name: 'package.json', data: Buffer.from('{}') },
];

function zipOf(entries) {
  const path = join(mkdtempSync(join(tmpdir(), 'theme-qa-zip-')), 'theme.zip');
  writeFileSync(path, createZip(entries));
  return path;
}

async function errorsFor(entries) {
  const results = await checkZip({}, { zipPath: zipOf(entries) });
  return results.filter((r) => r.level === 'error').map((r) => r.message);
}

test('theme files at the zip root pass', async () => {
  assert.deepEqual(await errorsFor(THEME), []);
});

test('theme files in one top-level folder pass', async () => {
  const entries = THEME.map((entry) => ({ ...entry, name: `my-theme/${entry.name}` }));
  const results = await checkZip({}, { zipPath: zipOf(entries) });
  assert.deepEqual(
    results.filter((r) => r.level === 'error'),
    [],
  );
  assert.ok(results.some((r) => r.message.includes('in the folder "my-theme/"')));
});

test('a zip without index.hbs fails', async () => {
  const [error] = await errorsFor([{ name: 'package.json', data: Buffer.from('{}') }]);
  assert.match(error, /No index\.hbs/);
});

test('package.json must sit next to the shallowest index.hbs', async () => {
  const [error] = await errorsFor([
    { name: 'theme/index.hbs', data: Buffer.from('') },
    { name: 'package.json', data: Buffer.from('{}') },
  ]);
  assert.match(error, /No package\.json next to theme\/index\.hbs/);
});

test('node_modules entries fail', async () => {
  const [error] = await errorsFor([
    ...THEME,
    { name: 'node_modules/lodash/index.js', data: Buffer.from('x') },
  ]);
  assert.match(error, /node_modules\/ in the zip \(1\): node_modules\/lodash\/index\.js/);
});

test('symlinks fail', async () => {
  const [error] = await errorsFor([
    ...THEME,
    { name: 'partials/link.hbs', data: Buffer.from('../index.hbs'), mode: 0o120777 },
  ]);
  assert.match(error, /Symlinks in the zip \(1\).*: partials\/link\.hbs/);
});

test('dev files and source maps fail, one error per kind', async () => {
  const errors = await errorsFor([
    ...THEME,
    { name: '.git/HEAD', data: Buffer.from('x') },
    { name: '.github/workflows/ci.yml', data: Buffer.from('x') },
    { name: '.env.local', data: Buffer.from('x') },
    { name: 'assets/.DS_Store', data: Buffer.from('x') },
    { name: 'assets/built/main.js.map', data: Buffer.from('x') },
    { name: 'assets/built/other.css.map', data: Buffer.from('x') },
    { name: '.theme-qa/manifest.json', data: Buffer.from('x') },
  ]);
  assert.equal(errors.length, 6);
  assert.match(errors.join('\n'), /source maps \(\*\.map\) in the zip \(2\)/);
});

test('a file named like a forbidden folder is fine', async () => {
  // `.github` as a file isn't the CI folder; only folders are forbidden.
  assert.deepEqual(await errorsFor([...THEME, { name: '.github', data: Buffer.from('x') }]), []);
});
