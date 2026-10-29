import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalise } from '../src/config.mjs';

const ctx = (pkg = {}) => ({
  dir: '/themes/demo',
  pkg: { name: 'demo', ...pkg },
  configPath: null,
});

test('a theme without a config file gets one default profile and the theme scripts', () => {
  const config = normalise({}, ctx({ scripts: { build: 'vite build', zip: 'node zip.mjs' } }));
  assert.deepEqual(Object.keys(config.profiles), ['default']);
  assert.equal(config.build, 'npm run build');
  assert.equal(config.zip.command, 'npm run zip');
  assert.equal(config.tests, '/themes/demo/qa');
});

test('build: null switches the build off even when package.json has a build script', () => {
  const config = normalise({ build: null }, ctx({ scripts: { build: 'vite build' } }));
  assert.equal(config.build, null);
});

test('a typo in a top-level key fails instead of being ignored', () => {
  assert.throws(() => normalise({ profile: {} }, ctx()), /Unknown key "profile"/);
});

test('excluding a base group that does not exist fails', () => {
  assert.throws(() => normalise({ base: { exclude: ['card'] } }, ctx()), /Unknown base group/);
});

test('profiles reject unknown keys and colour schemes', () => {
  assert.throws(() => normalise({ profiles: { dark: { color: 'dark' } } }, ctx()), /Unknown key/);
  assert.throws(
    () => normalise({ profiles: { dark: { colorScheme: 'auto' } } }, ctx()),
    /colorScheme/,
  );
  assert.throws(() => normalise({ profiles: {} }, ctx()), /at least one profile/);
});

test('a theme cannot define a profile named "empty"', () => {
  assert.throws(() => normalise({ profiles: { empty: {} } }, ctx()), /reserved/);
});

test('string urls expect 200, objects keep their own status', () => {
  const config = normalise({ urls: ['/podcast/rss/', { path: '/gone/', status: 404 }] }, ctx());
  assert.deepEqual(config.urls, [
    { path: '/podcast/rss/', status: 200 },
    { path: '/gone/', status: 404 },
  ]);
});

test('budgets override per category and keep the other defaults', () => {
  const config = normalise({ budgets: { performance: 0.8 } }, ctx());
  assert.equal(config.budgets.performance, 0.8);
  assert.equal(config.budgets.accessibility, 1);
});
