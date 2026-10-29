import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yauzl from 'yauzl';
import { packageTheme } from '../src/theme.mjs';

function config(dir, zip = {}) {
  return { dir, name: 'my-theme', pkg: {}, zip: { command: null, path: null, ...zip } };
}

async function zipNames(path) {
  const zipfile = await yauzl.openPromise(path);
  const names = [];
  for await (const entry of zipfile.eachEntry()) names.push(entry.fileName);
  return names.sort();
}

test('without zip.command, zips tracked files minus dotfiles and deleted files', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'theme-qa-theme-'));
  mkdirSync(join(dir, '.github'));
  for (const file of ['index.hbs', 'package.json', 'gone.hbs', '.gitignore', '.github/ci.yml']) {
    writeFileSync(join(dir, file), 'x');
  }
  writeFileSync(join(dir, 'untracked.hbs'), 'x');
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['add', 'index.hbs', 'package.json', 'gone.hbs', '.gitignore', '.github'], {
    cwd: dir,
  });
  rmSync(join(dir, 'gone.hbs'));

  const path = await packageTheme(config(dir));
  assert.equal(path, join(dir, '.theme-qa', 'my-theme.zip'));
  assert.deepEqual(await zipNames(path), ['my-theme/index.hbs', 'my-theme/package.json']);
});

test('with zip.command, a stale zip at the default path is not picked up', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'theme-qa-theme-'));
  writeFileSync(join(dir, 'my-theme.zip'), 'old');
  const old = new Date(Date.now() - 60_000);
  utimesSync(join(dir, 'my-theme.zip'), old, old);
  mkdirSync(join(dir, 'dist'));

  const path = await packageTheme(config(dir, { command: 'touch dist/release.zip' }));
  assert.equal(path, join(dir, 'dist', 'release.zip'));
});

test('with zip.command, no new zip is a clear error', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'theme-qa-theme-'));
  await assert.rejects(packageTheme(config(dir, { command: 'true' })), /no new zip turned up/);
});

test('a failing command reports its exit code', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'theme-qa-theme-'));
  await assert.rejects(packageTheme(config(dir, { command: 'exit 3' })), /exit code 3/);
});
