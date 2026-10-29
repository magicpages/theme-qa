// Console errors from theme code, theme assets that fail to load, and
// libraries the theme pulls from third-party hosts. Anything Ghost or the post
// content loads is filtered out and listed as ignored.

import { test, expect } from './fixtures.mjs';
import { runtime, noteIgnored } from './lib/runtime.mjs';
import { isGhostOwned, isThirdParty, withoutQuery } from './lib/ghost.mjs';

const site = runtime.manifest.url;

// Code and data a theme loads. Images, media and frames come from post
// content (editor cards), which the theme doesn't control.
const CHECKED_TYPES = new Set(['Script', 'Stylesheet', 'Font', 'XHR', 'Fetch', 'EventSource']);

/** The script or stylesheet that caused a request, from the DevTools initiator. */
function initiatorUrl(initiator) {
  for (let stack = initiator.stack; stack; stack = stack.parent) {
    const frame = stack.callFrames.find((f) => f.url);
    if (frame) return frame.url;
  }
  return initiator.url || null;
}

/** The script an uncaught error was thrown in: the first URL in its stack. */
function errorUrl(error) {
  return error.stack?.match(/(https?:\/\/[^\s)]+?):\d+:\d+/)?.[1] ?? null;
}

for (const entry of runtime.manifest.pages) {
  test(`console and network: ${entry.id} ${entry.path}`, async ({ page }, testInfo) => {
    const consoleErrors = [];
    const problems = [];

    page.on('pageerror', (error) => {
      consoleErrors.push({
        text: `Uncaught ${error.name}: ${error.message}`,
        url: errorUrl(error),
      });
    });
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push({ text: message.text(), url: message.location().url || null });
      }
    });
    page.on('response', (response) => {
      if (response.status() >= 400 && response.url().startsWith(`${site}/assets/`)) {
        problems.push(`Theme asset answered ${response.status()}: ${response.url()}`);
      }
    });

    // Playwright doesn't expose who started a request; DevTools does. Only the
    // top document counts: iframes on the page are embeds from post content.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    const { frameTree } = await cdp.send('Page.getFrameTree');
    const requests = [];
    cdp.on('Network.requestWillBeSent', (event) => {
      if (
        event.frameId === frameTree.frame.id &&
        CHECKED_TYPES.has(event.type) &&
        isThirdParty(event.request.url, site)
      ) {
        requests.push({ url: event.request.url, initiator: initiatorUrl(event.initiator) });
      }
    });

    await page.emulateMedia({ colorScheme: runtime.colorSchemes[0] });
    await page.goto(entry.path);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const cardUrls = new Set(
      await page.evaluate(() =>
        [...document.querySelectorAll('.kg-card script[src], .kg-card link[href]')].map(
          (el) => el.src || el.href,
        ),
      ),
    );

    // Owner per third-party URL: 'ghost', 'content', 'ignored' or 'theme'.
    // Requests inherit the owner of the script or stylesheet that made them.
    const owners = new Map();
    for (const { url, initiator } of requests) {
      const key = withoutQuery(url);
      const parent = initiator && (isGhostOwned(initiator, site) ? 'ghost' : owners.get(initiator));
      if (isGhostOwned(url, site)) {
        owners.set(url, 'ghost');
        noteIgnored(testInfo, `network: ${key} (Ghost-owned origin)`);
      } else if (parent === 'ghost' || parent === 'content' || parent === 'ignored') {
        owners.set(url, parent);
        noteIgnored(testInfo, `network: ${key} (requested by ${withoutQuery(initiator)})`);
      } else if (parent === 'theme') {
        // Already reported through the request that started it.
        owners.set(url, 'theme');
      } else if (cardUrls.has(url)) {
        owners.set(url, 'content');
        noteIgnored(testInfo, `network: ${key} (loaded by an editor card in post content)`);
      } else {
        const pattern = runtime.ignore.requests.find((re) => re.test(url));
        if (pattern) {
          owners.set(url, 'ignored');
          noteIgnored(testInfo, `network: ${key} (matches ignore.requests ${pattern})`);
        } else {
          owners.set(url, 'theme');
          problems.push(`Third-party request: ${url}${initiator ? ` (from ${initiator})` : ''}`);
        }
      }
    }

    for (const { text, url } of consoleErrors) {
      const where = url ? withoutQuery(url) : 'the page';
      if (text.startsWith('Failed to load resource')) {
        noteIgnored(testInfo, `console: "${text}" at ${where} (left to the network check)`);
        continue;
      }
      if (url && (isGhostOwned(url, site) || ['ghost', 'content'].includes(owners.get(url)))) {
        noteIgnored(testInfo, `console: "${text}" (from ${where}, not theme code)`);
        continue;
      }
      const pattern = runtime.ignore.console.find((re) => re.test(text));
      if (pattern) {
        noteIgnored(testInfo, `console: "${text}" (matches ignore.console ${pattern})`);
        continue;
      }
      problems.push(`Console error: ${text} (${where})`);
    }

    expect(problems, `${problems.length} console/network problem(s) on ${entry.path}`).toEqual([]);
  });
}
