// Playwright config for one profile. runBrowserChecks starts Playwright twice:
// `checks` (shared specs plus the theme's own) and then `lighthouse`, so the
// performance scores aren't measured while other workers load the CPU.

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import { runtime } from './lib/runtime.mjs';

const here = dirname(fileURLToPath(import.meta.url));

const SMOKE_SPECS = ['status', 'console'];
const SHARED_SPECS = [...SMOKE_SPECS, 'layout', 'a11y', 'keyboard', 'screenshots'];
const specs = (names) => new RegExp(`/(${names.join('|')})\\.spec\\.mjs$`);

const projects =
  runtime.run === 'lighthouse'
    ? [{ name: 'lighthouse', testDir: here, testMatch: specs(['lighthouse']), timeout: 180_000 }]
    : [
        {
          name: 'shared',
          testDir: here,
          testMatch: specs(runtime.smoke ? SMOKE_SPECS : SHARED_SPECS),
          snapshotPathTemplate: join(runtime.screenshots.dir, '{arg}{ext}'),
        },
        ...(runtime.themeTests
          ? [
              {
                name: 'theme',
                testDir: runtime.themeTests,
                testMatch: '**/*.spec.mjs',
                snapshotPathTemplate: join(runtime.screenshots.dir, '{testFilePath}', '{arg}{ext}'),
              },
            ]
          : []),
      ];

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
  // spread over workers too. Without this the screenshot file alone sets the
  // wall time, since it holds most of the tests.
  fullyParallel: true,
  workers: runtime.run === 'lighthouse' ? 1 : undefined,
  timeout: 60_000,
  updateSnapshots: runtime.screenshots.updateAll ? 'all' : 'missing',
  expect: {
    timeout: 15_000,
    toHaveScreenshot: { animations: 'disabled' },
  },
  use: {
    browserName: 'chromium',
    baseURL: runtime.manifest.url,
    colorScheme: runtime.profile.colorScheme,
    trace: 'retain-on-failure',
  },
});
