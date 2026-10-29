import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkLocales } from '../src/checks/locales.mjs';

function themeWithLocales(files) {
  const dir = mkdtempSync(join(tmpdir(), 'theme-qa-locales-'));
  mkdirSync(join(dir, 'locales'));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(
      join(dir, 'locales', name),
      typeof content === 'string' ? content : JSON.stringify(content),
    );
  }
  return { dir, pkg: {}, name: 'test' };
}

test('a locale missing en.json keys is an error naming the keys', async () => {
  const config = themeWithLocales({
    'en.json': { Home: 'Home', Back: 'Back', Next: 'Next' },
    'de.json': { Home: 'Start' },
  });
  const [missing] = (await checkLocales(config)).filter((r) => r.level === 'error');
  assert.equal(missing.file, 'locales/de.json');
  assert.match(missing.message, /missing 2 key/);
  assert.match(missing.message, /"Back", "Next"/);
});

test('missing keys are listed up to 10, then counted', async () => {
  const en = Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`key${i}`, 'x']));
  const config = themeWithLocales({ 'en.json': en, 'fr.json': {} });
  const [missing] = (await checkLocales(config)).filter((r) => r.level === 'error');
  assert.match(missing.message, /missing 13 key/);
  assert.match(missing.message, /"key9" and 3 more$/);
  assert.doesNotMatch(missing.message, /"key10"/);
});

test('extra keys are a warning, not an error', async () => {
  const config = themeWithLocales({
    'en.json': { Home: 'Home' },
    'nl.json': { Home: 'Thuis', Old: 'Oud' },
  });
  const results = await checkLocales(config);
  assert.equal(results.filter((r) => r.level === 'error').length, 0);
  const [extra] = results.filter((r) => r.level === 'warning');
  assert.match(extra.message, /"Old"/);
});

test('invalid JSON in a locale is an error', async () => {
  const config = themeWithLocales({ 'en.json': { Home: 'Home' }, 'es.json': '{ "Home": ' });
  const [invalid] = (await checkLocales(config)).filter((r) => r.level === 'error');
  assert.equal(invalid.file, 'locales/es.json');
  assert.match(invalid.message, /isn't valid JSON/);
});

test('matching locales pass', async () => {
  const config = themeWithLocales({ 'en.json': { Home: 'Home' }, 'de.json': { Home: 'Start' } });
  const results = await checkLocales(config);
  assert.deepEqual(
    results.map((r) => r.level),
    ['info'],
  );
});

test('no locales folder is info only', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'theme-qa-locales-'));
  const results = await checkLocales({ dir, pkg: {}, name: 'test' });
  assert.deepEqual(
    results.map((r) => r.level),
    ['info'],
  );
});
