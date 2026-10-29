// Full-page screenshots for a visual comparison: every page marked
// `screenshot: true`, per viewport and color scheme, saved into
// `runtime.screenshots.dir`. Nothing is compared here; the CLI takes one set
// per build on the same site and compares them afterwards.

import { join } from 'node:path';
import { test } from './fixtures.mjs';
import { runtime, noteIgnored } from './lib/runtime.mjs';
import { GHOST_ROOTS } from './lib/ghost.mjs';
import { screenshotPlan } from '../src/visual/plan.mjs';

const MASKED = runtime.screenshots.mask;
// Ghost's apps load late and resize themselves (the comments iframe grows as
// it renders), so they are hidden rather than masked.
const HIDE_GHOST_APPS = `${GHOST_ROOTS.join(', ')} { display: none !important; }`;

/**
 * Loads lazy images and web fonts so the full-page capture is complete, hides
 * Ghost's apps, then pins the page height: a fractional document height rounds
 * differently from one capture to the next.
 */
async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.addStyleTag({ content: HIDE_GHOST_APPS });
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
    const root = document.documentElement;
    root.style.minHeight = `${Math.ceil(root.getBoundingClientRect().height)}px`;
  });
}

const plan = screenshotPlan(
  runtime.manifest.pages,
  runtime.screenshots.viewports,
  runtime.colorSchemes,
);

for (const shot of plan) {
  test(`screenshot: ${shot.file}`, async ({ page }, testInfo) => {
    await page.setViewportSize(shot.size);
    await page.emulateMedia({ colorScheme: shot.scheme });
    await page.goto(shot.path);
    await settle(page);
    noteIgnored(testInfo, `screenshot: hidden ${GHOST_ROOTS.join(', ')}`);
    if (MASKED.length) noteIgnored(testInfo, `screenshot: masked ${MASKED.join(', ')}`);

    await page.screenshot({
      path: join(runtime.screenshots.dir, shot.file),
      fullPage: true,
      animations: 'disabled',
      caret: 'hide',
      mask: MASKED.map((selector) => page.locator(selector)),
    });
  });
}
