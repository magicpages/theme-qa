// axe-core against WCAG 2.2 AA, in every color scheme. Only critical and
// serious violations fail; the full results are attached to each test.

import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.mjs';
import { runtime, noteIgnored } from './lib/runtime.mjs';
import {
  GHOST_ROOTS,
  GHOST_CARD,
  GHOST_PAYWALL,
  THEME_STYLED_RULES,
  isHtml,
} from './lib/ghost.mjs';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const BLOCKING = new Set(['critical', 'serious']);
// Ghost's apps, plus embeds in post content: third-party documents the theme
// doesn't render.
const EXCLUDED = [...GHOST_ROOTS, '.kg-card iframe'];

/** One readable line per violation, with the first few offending elements. */
function describe(violation) {
  const targets = violation.nodes.slice(0, 3).map((node) => node.target.join(' '));
  const more = violation.nodes.length > 3 ? ` and ${violation.nodes.length - 3} more` : '';
  return `[${violation.impact}] ${violation.id}: ${violation.help} -> ${targets.join(', ')}${more}`;
}

/** Which of the nodes sit inside an element matching `selector`. */
function nodesInside(page, nodes, selector) {
  return page.evaluate(
    ({ targets, selector }) =>
      targets.map((target) => {
        // Nested arrays point into iframes or shadow roots; keep those.
        if (target.length !== 1 || typeof target[0] !== 'string') return false;
        return Boolean(document.querySelector(target[0])?.closest(selector));
      }),
    { targets: nodes.map((node) => node.target), selector },
  );
}

/**
 * True when the colour pair comes from the accent the publisher picked in
 * Ghost Admin: white text on the accent (Ghost's buttons and cards do this),
 * or accent anywhere in the paywall, whose colours Ghost sets inline.
 */
function publisherColours(node, accent, inPaywall) {
  const data = node.any.find((check) => check.data?.bgColor)?.data;
  if (!accent || !data) return false;
  const fg = data.fgColor?.toLowerCase();
  const bg = data.bgColor?.toLowerCase();
  if (bg === accent && fg === '#ffffff') return true;
  return inPaywall && (fg === accent || bg === accent);
}

/**
 * Drops what the theme can't change: nodes inside editor cards for markup
 * rules, and contrast that depends only on the publisher's accent colour. A
 * violation left with no nodes is reported as ignored instead.
 */
async function withoutGhostOwned(page, violations, testInfo) {
  const accent = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue('--ghost-accent-color')
      .trim()
      .toLowerCase(),
  );
  const kept = [];
  for (const violation of violations) {
    let nodes;
    if (THEME_STYLED_RULES.has(violation.id)) {
      const inPaywall = await nodesInside(page, violation.nodes, GHOST_PAYWALL);
      nodes = violation.nodes.filter((node, i) => !publisherColours(node, accent, inPaywall[i]));
      if (nodes.length < violation.nodes.length) {
        noteIgnored(
          testInfo,
          `accessibility: ${violation.id} on the publication's accent colour ${accent} (Ghost Admin setting)`,
        );
      }
    } else {
      const inCard = await nodesInside(page, violation.nodes, GHOST_CARD);
      nodes = violation.nodes.filter((_, i) => !inCard[i]);
      if (nodes.length < violation.nodes.length) {
        noteIgnored(
          testInfo,
          `accessibility: ${violation.id} inside editor cards (Ghost's markup)`,
        );
      }
    }
    if (nodes.length) kept.push({ ...violation, nodes });
  }
  return kept;
}

for (const entry of runtime.manifest.pages) {
  for (const scheme of runtime.colorSchemes) {
    test(`accessibility: ${entry.id} ${entry.path} (${scheme})`, async ({ page }, testInfo) => {
      await page.emulateMedia({ colorScheme: scheme });
      const response = await page.goto(entry.path);
      test.skip(!isHtml(response), 'not an HTML page');
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

      let axe = new AxeBuilder({ page }).withTags(TAGS);
      for (const selector of EXCLUDED) axe = axe.exclude(selector);
      if (runtime.ignore.axe.length) axe = axe.disableRules(runtime.ignore.axe);
      const results = await axe.analyze();

      await testInfo.attach(`axe-${entry.id}-${scheme}.json`, {
        body: JSON.stringify(results, null, 2),
        contentType: 'application/json',
      });
      noteIgnored(
        testInfo,
        `accessibility: not scanned (Ghost-owned or embedded): ${EXCLUDED.join(', ')}`,
      );
      for (const rule of runtime.ignore.axe) {
        noteIgnored(testInfo, `accessibility: rule ${rule} (ignore.axe)`);
      }

      const violations = await withoutGhostOwned(page, results.violations, testInfo);
      const blocking = violations.filter((v) => BLOCKING.has(v.impact)).map(describe);
      expect(blocking, `${blocking.length} serious accessibility violation(s)`).toEqual([]);
    });
  }
}
