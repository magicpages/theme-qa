// Lighthouse (mobile preset) for pages marked `lighthouse: true`, first profile
// only. Runs on its own, in one worker, after the other checks so scores aren't
// skewed by parallel load. Scores are attached and printed by the runner as a table.

import { createServer } from 'node:net';
import { chromium } from '@playwright/test';
import lighthouse from 'lighthouse';
import { test, expect } from './fixtures.mjs';
import { runtime, LIGHTHOUSE } from './lib/runtime.mjs';

/** Lighthouse drives Chromium over a debugging port; ask the OS for a free one. */
function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer().listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

for (const entry of runtime.manifest.pages.filter((p) => p.lighthouse)) {
  test(`lighthouse: ${entry.id} ${entry.path}`, async ({ manifest }, testInfo) => {
    const port = await freePort();
    // The full Chromium build in new headless mode: Lighthouse doesn't support
    // the stripped-down headless shell Playwright uses by default.
    const browser = await chromium.launch({
      channel: 'chromium',
      args: [`--remote-debugging-port=${port}`],
    });
    try {
      const result = await lighthouse(new URL(entry.path, manifest.url).href, {
        port,
        output: 'html',
        logLevel: 'error',
        onlyCategories: Object.keys(runtime.budgets),
      });
      const scores = Object.fromEntries(
        Object.entries(result.lhr.categories).map(([id, category]) => [id, category.score]),
      );

      await testInfo.attach(`lighthouse-${entry.id}.json`, {
        body: JSON.stringify({ page: entry.path, scores, budgets: runtime.budgets }, null, 2),
        contentType: 'application/json',
      });
      await testInfo.attach(`lighthouse-${entry.id}.html`, {
        body: result.report,
        contentType: 'text/html',
      });
      testInfo.annotations.push({
        type: LIGHTHOUSE,
        description: JSON.stringify({ id: entry.id, scores }),
      });

      const misses = Object.entries(runtime.budgets)
        .filter(([id, min]) => !(scores[id] >= min))
        .map(([id, min]) => `${id}: ${scores[id] ?? 'no score'} (budget ${min})`);
      expect(misses, `Lighthouse scores below budget on ${entry.path}`).toEqual([]);
    } finally {
      await browser.close();
    }
  });
}
