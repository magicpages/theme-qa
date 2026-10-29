// Public entry for theme specs: `import { test, expect } from '@magicpages/theme-qa/test'`.
// The shared specs use the same `test`, so both get the same fixtures.
// Playwright requires the `{}` object pattern even when a fixture uses no others.

import { test as base, expect } from '@playwright/test';
import { runtime } from './lib/runtime.mjs';

export const test = base.extend({
  /** The manifest seeding wrote: site `url` and every `pages` entry. */
  manifest: [
    async ({}, use) => {
      await use(runtime.manifest);
    },
    { scope: 'worker' },
  ],
  /** The profile under test: `{ name, custom?, settings?, colorScheme? }`. */
  profile: [
    async ({}, use) => {
      await use(runtime.profile);
    },
    { scope: 'worker' },
  ],
});

export { expect };
