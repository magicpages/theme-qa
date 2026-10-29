// Full-page screenshots of every page marked `screenshot: true`, per viewport
// and color scheme, compared against the approved ones in the theme repo.
// Missing baselines are written instead of failing.

import { test, expect } from './fixtures.mjs';
import { runtime, noteIgnored } from './lib/runtime.mjs';
import { GHOST_ROOTS } from './lib/ghost.mjs';

const MASKED = [...runtime.screenshots.mask, ...GHOST_ROOTS];

/** Loads lazy images and web fonts so the full-page capture is complete and stable. */
async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.evaluate(async () => {
    for (const img of document.querySelectorAll('img[loading="lazy"]')) img.loading = 'eager';
    const pending = [...document.images]
      .filter((img) => !img.complete)
      .map(
        (img) =>
          new Promise((done) => {
            img.addEventListener('load', done, { once: true });
            img.addEventListener('error', done, { once: true });
          }),
      );
    const timeout = new Promise((done) => setTimeout(done, 10_000));
    await Promise.race([Promise.all([...pending, document.fonts.ready]), timeout]);
  });
}

for (const entry of runtime.manifest.pages.filter((p) => p.screenshot)) {
  for (const [viewport, size] of Object.entries(runtime.screenshots.viewports)) {
    for (const scheme of runtime.colorSchemes) {
      const name = `${entry.id}-${viewport}-${scheme}.png`;
      test(`screenshot: ${name}`, async ({ page }, testInfo) => {
        // Host browsers render fonts differently from the pinned image, so
        // comparing against (or writing) Docker baselines would only mislead.
        test.skip(runtime.local, 'Screenshots only compare inside the pinned Docker image');

        await page.setViewportSize(size);
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto(entry.path);
        await settle(page);
        noteIgnored(testInfo, `screenshot: masked ${MASKED.join(', ')}`);

        await expect(page).toHaveScreenshot(name, {
          fullPage: true,
          animations: 'disabled',
          mask: MASKED.map((selector) => page.locator(selector)),
        });
      });
    }
  }
}
