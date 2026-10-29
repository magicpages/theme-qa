import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPackageJson } from '../src/checks/package-json.mjs';

const VALID = {
  name: 'my-theme',
  version: '1.2.3',
  author: { name: 'A', email: 'a@example.com' },
  license: 'MIT',
  engines: { ghost: '>=5.0.0' },
};

function customSettings(count, description) {
  return Object.fromEntries(
    Array.from({ length: count }, (_, i) => [
      `setting_${i}`,
      { type: 'boolean', default: true, ...(description && { description }) },
    ]),
  );
}

async function errorsFor(pkg) {
  const results = await checkPackageJson({ dir: '/nowhere', pkg, name: pkg.name });
  return results.filter((r) => r.level === 'error').map((r) => r.message);
}

test('a valid package.json has no errors and reports the minimum Ghost version', async () => {
  const results = await checkPackageJson({ dir: '/nowhere', pkg: VALID, name: VALID.name });
  assert.deepEqual(
    results.filter((r) => r.level === 'error'),
    [],
  );
  assert.match(results.find((r) => r.level === 'info').message, /minimum Ghost 5\.0\.0/);
});

test('20 custom settings pass, 21 fail', async () => {
  assert.deepEqual(await errorsFor({ ...VALID, config: { custom: customSettings(20) } }), []);
  const [error] = await errorsFor({ ...VALID, config: { custom: customSettings(21) } });
  assert.match(error, /21 settings/);
});

test('a 100-character description passes, 101 fails', async () => {
  const ok = { ...VALID, config: { custom: customSettings(1, 'x'.repeat(100)) } };
  assert.deepEqual(await errorsFor(ok), []);
  const tooLong = { ...VALID, config: { custom: customSettings(1, 'x'.repeat(101)) } };
  const [error] = await errorsFor(tooLong);
  assert.match(error, /setting_0\.description is 101 characters, longer than 100 characters/);
});

test('missing author.email is an error', async () => {
  const [error] = await errorsFor({ ...VALID, author: { name: 'A' } });
  assert.match(error, /author\.email/);
});

test('name, version, license, engines.ghost and engines.ghost-api rules', async () => {
  const errors = await errorsFor({
    ...VALID,
    name: 'My_Theme',
    version: '1.0',
    license: undefined,
    engines: { ghost: 'not a range', 'ghost-api': 'v4' },
  });
  assert.equal(errors.length, 5);
  assert.match(errors.join('\n'), /"name"/);
  assert.match(errors.join('\n'), /"version"/);
  assert.match(errors.join('\n'), /"license"/);
  assert.match(errors.join('\n'), /not a valid semver range/);
  assert.match(errors.join('\n'), /ghost-api/);
});

test('missing engines.ghost is an error', async () => {
  const [error] = await errorsFor({ ...VALID, engines: {} });
  assert.match(error, /engines\.ghost" is missing/);
});
