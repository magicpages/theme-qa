// No sideways scrolling at any viewport. A long unbroken word or a full-width
// card that is a few pixels too wide makes the whole page pan sideways on a
// phone, and makes full-page screenshots unstable.

import { test, expect } from './fixtures.mjs';
import { runtime } from './lib/runtime.mjs';
import { isHtml } from './lib/ghost.mjs';

/** The outermost elements sticking out past the right edge, as readable selectors. */
function overflowingElements() {
  const width = document.documentElement.clientWidth;
  const describe = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const classes = [...el.classList]
      .slice(0, 3)
      .map((c) => `.${CSS.escape(c)}`)
      .join('');
    const text = el.textContent.trim().replace(/\s+/g, ' ').slice(0, 40);
    return `<${el.localName}${id}${classes}> ${Math.round(el.getBoundingClientRect().right)}px${text ? ` "${text}"` : ''}`;
  };
  const sticksOut = (el) => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.right > width + 1;
  };
  const found = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (!sticksOut(el)) continue;
    // A clipping ancestor hides the overflow; it doesn't widen the page.
    let clipped = false;
    for (
      let parent = el.parentElement;
      parent && parent !== document.body;
      parent = parent.parentElement
    ) {
      if (getComputedStyle(parent).overflowX !== 'visible') {
        clipped = true;
        break;
      }
    }
    if (clipped) continue;
    // Report the element that starts the problem, not every child inside it.
    if (found.some((outer) => outer.contains(el))) continue;
    found.push(el);
  }
  return found.slice(0, 5).map(describe);
}

for (const entry of runtime.manifest.pages) {
  for (const [viewport, size] of Object.entries(runtime.screenshots.viewports)) {
    test(`layout: no sideways scroll on ${entry.id} ${entry.path} (${viewport})`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await page.emulateMedia({ colorScheme: runtime.colorSchemes[0] });
      const response = await page.goto(entry.path);
      test.skip(!isHtml(response), 'not an HTML page');
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      if (scrollWidth <= clientWidth) return;

      const culprits = await page.evaluate(overflowingElements);
      expect(
        scrollWidth,
        `${entry.path} is ${scrollWidth}px wide in a ${clientWidth}px ${viewport} viewport. ` +
          `Sticking out: ${culprits.join('; ') || 'no single element found'}`,
      ).toBeLessThanOrEqual(clientWidth);
    });
  }
}
