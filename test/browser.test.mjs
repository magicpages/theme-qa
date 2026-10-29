import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dockerMounts } from '../src/browser/index.mjs';
import { isGhostOwned, isThirdParty } from '../tests/lib/ghost.mjs';

function tree(...paths) {
  const root = mkdtempSync(join(tmpdir(), 'theme-qa-'));
  for (const path of paths) mkdirSync(join(root, path), { recursive: true });
  return root;
}

test('checkout: dependencies inside theme-qa reuse its mount', () => {
  const root = tree('theme/qa', 'theme-qa/node_modules', 'elsewhere/shots');
  const { mounts, map } = dockerMounts({
    theme: join(root, 'theme'),
    qa: join(root, 'theme-qa'),
    deps: join(root, 'theme-qa/node_modules'),
    extra: [join(root, 'theme/qa'), join(root, 'elsewhere/shots')],
  });
  assert.deepEqual(mounts.map(([, target]) => target).sort(), [
    '/work/extra1',
    '/work/qa',
    '/work/theme',
  ]);
  assert.equal(map(join(root, 'theme-qa/node_modules')), '/work/qa/node_modules');
  assert.equal(map(join(root, 'theme/qa')), '/work/theme/qa');
  assert.equal(map(join(root, 'elsewhere/shots/default')), '/work/extra1/default');
});

test('installed in the theme: one mount, theme-qa under the theme', () => {
  const root = tree('theme/node_modules/@magicpages/theme-qa');
  const { mounts, map } = dockerMounts({
    theme: join(root, 'theme'),
    qa: join(root, 'theme/node_modules/@magicpages/theme-qa'),
    deps: join(root, 'theme/node_modules'),
    extra: [],
  });
  assert.equal(mounts.length, 1);
  assert.equal(
    map(join(root, 'theme/node_modules/@magicpages/theme-qa')),
    '/work/theme/node_modules/@magicpages/theme-qa',
  );
});

test('installed by npx: theme-qa reuses the dependencies mount', () => {
  const root = tree('theme', 'npx/node_modules/@magicpages/theme-qa');
  const { mounts, map } = dockerMounts({
    theme: join(root, 'theme'),
    qa: join(root, 'npx/node_modules/@magicpages/theme-qa'),
    deps: join(root, 'npx/node_modules'),
    extra: [],
  });
  assert.equal(mounts.length, 2);
  assert.equal(
    map(join(root, 'npx/node_modules/@magicpages/theme-qa')),
    '/work/deps/@magicpages/theme-qa',
  );
});

test('Ghost-owned scripts and endpoints are recognised by origin and path', () => {
  const site = 'http://localhost:2399';
  assert.ok(isGhostOwned('https://cdn.jsdelivr.net/ghost/portal@~2/umd/portal.min.js', site));
  assert.ok(isGhostOwned(`${site}/public/cards.min.js?v=1`, site));
  assert.ok(isGhostOwned(`${site}/members/api/member/`, site));
  assert.ok(isGhostOwned('https://secure.gravatar.com/avatar/x', site));
  assert.ok(!isGhostOwned('https://cdn.jsdelivr.net/npm/lodash/lodash.min.js', site));
  assert.ok(!isGhostOwned(`${site}/assets/built/main.js`, site));
  assert.ok(!isGhostOwned('https://evil.example/ghost/portal.js', site));
});

test('third party means another origin, not another path', () => {
  const site = 'http://localhost:2399';
  assert.ok(!isThirdParty(`${site}/assets/x.js`, site));
  assert.ok(isThirdParty('http://localhost:2400/x.js', site));
  assert.ok(!isThirdParty('data:font/woff2;base64,AAAA', site));
});
