// Playwright config for one profile. runBrowserChecks starts Playwright twice:
// `checks` (shared specs plus the theme's own) and then `lighthouse`, so the
// performance scores aren't measured while other workers load the CPU.
// captureScreenshots starts it with `screenshots` for a visual comparison.

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import { runtime } from './lib/runtime.mjs';

const here = dirname(fileURLToPath(import.meta.url));

const SMOKE_SPECS = ['status', 'console'];
const SHARED_SPECS = [...SMOKE_SPECS, 'layout', 'a11y', 'keyboard'];
const specs = (names) => new RegExp(`/(${names.join('|')})\\.spec\\.mjs$`);

const projects = {
  lighthouse: () => [
    { name: 'lighthouse', testDir: here, testMatch: specs(['lighthouse']), timeout: 180_000 },
  ],
  screenshots: () => [{ name: 'screenshots', testDir: here, testMatch: specs(['screenshots']) }],
  checks: () => [
    {
      name: 'shared',
      testDir: here,
      testMatch: specs(runtime.smoke ? SMOKE_SPECS : SHARED_SPECS),
    },
    ...(runtime.themeTests
      ? [{ name: 'theme', testDir: runtime.themeTests, testMatch: '**/*.spec.mjs' }]
      : []),
  ],
}[runtime.run]();

export default defineConfig({
  projects,
  outputDir: join(runtime.resultsDir, `${runtime.run}-output`),
  reporter: [
    ['list'],
    ['html', { outputFolder: join(runtime.resultsDir, `${runtime.run}-report`), open: 'never' }],
    ['json', { outputFile: join(runtime.resultsDir, `${runtime.run}.json`) }],
    ...(process.env.GITHUB_ACTIONS ? [['github']] : []),
  ],
  forbidOnly: Boolean(process.env.CI),
  // Each test visits one page and shares no state, so tests within a file can
  // spread over workers too. Without this the largest spec file alone sets the
  // wall time.
  fullyParallel: true,
  workers: runtime.run === 'lighthouse' ? 1 : undefined,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    browserName: 'chromium',
    baseURL: runtime.manifest.url,
    colorScheme: runtime.profile.colorScheme,
    trace: 'retain-on-failure',
  },
});
