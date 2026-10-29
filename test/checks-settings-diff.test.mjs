import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkSettingsDiff } from '../src/checks/settings-diff.mjs';

const RELEASED = {
  name: 'my-theme',
  config: {
    custom: {
      show_share: { type: 'boolean', default: true },
      accent: { type: 'select', options: ['a', 'b'], default: 'a' },
    },
  },
};

// The theme sits in a subfolder to cover repos where it isn't the git root.
function repoWithTag(pkg) {
  const repo = mkdtempSync(join(tmpdir(), 'theme-qa-settings-'));
  const dir = join(repo, 'theme');
  mkdirSync(dir);
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: repo,
      stdio: 'ignore',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Test',
        GIT_AUTHOR_EMAIL: 'test@example.com',
        GIT_COMMITTER_NAME: 'Test',
        GIT_COMMITTER_EMAIL: 'test@example.com',
      },
    });
  git('init', '-q');
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));
  git('add', '.');
  git('commit', '-q', '--no-gpg-sign', '-m', 'release');
  git('tag', 'v1.0.0');
  return dir;
}

async function errorsFor(current) {
  const dir = repoWithTag(RELEASED);
  const results = await checkSettingsDiff({ dir, pkg: current, name: current.name });
  return results.filter((r) => r.level === 'error').map((r) => r.message);
}

test('a removed custom setting is an error', async () => {
  const current = structuredClone(RELEASED);
  delete current.config.custom.show_share;
  const [error] = await errorsFor(current);
  assert.match(error, /show_share \(in v1\.0\.0\).*customers lose their saved value/);
});

test('a type change of a kept setting is an error', async () => {
  const current = structuredClone(RELEASED);
  current.config.custom.accent = { type: 'color', default: '#000000' };
  const [error] = await errorsFor(current);
  assert.match(error, /accent changed type from "select" .* to "color"/);
});

test('unchanged and added settings pass', async () => {
  const current = structuredClone(RELEASED);
  current.config.custom.new_one = { type: 'text' };
  assert.deepEqual(await errorsFor(current), []);
});

test('no tags is info and skipped', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'theme-qa-settings-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  const results = await checkSettingsDiff({ dir, pkg: RELEASED, name: 'my-theme' });
  assert.deepEqual(
    results.map((r) => r.level),
    ['info'],
  );
  assert.match(results[0].message, /No git tag/);
});
