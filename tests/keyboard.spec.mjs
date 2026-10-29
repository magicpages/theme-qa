// Keyboard basics: a skip link first, a visible focus style on every stop,
// and a mobile menu that opens with Enter and closes with Escape.

import { test, expect } from './fixtures.mjs';
import { runtime, noteIgnored } from './lib/runtime.mjs';
import { GHOST_ROOTS, isHtml } from './lib/ghost.mjs';

const FOCUS_STOPS = 15;
const GHOST_SELECTOR = GHOST_ROOTS.join(', ');

// Properties a focus indicator can change. The position and clipping ones
// catch skip links that become visible on focus.
const FOCUS_PROPERTIES = [
  'outline-style',
  'outline-width',
  'outline-color',
  'box-shadow',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'background-color',
  'background-image',
  'text-decoration-line',
  'text-decoration-color',
  'text-decoration-thickness',
  'opacity',
  'visibility',
  'clip',
  'clip-path',
  'transform',
  'top',
  'left',
];

const narrowest = Object.values(runtime.screenshots.viewports).sort((a, b) => a.width - b.width)[0];
const PHONE = narrowest ?? { width: 375, height: 812 };

/** Describes the focused element, or why it doesn't count as a theme focus stop. */
function activeElement(page) {
  return page.evaluate((ghostSelector) => {
    const el = document.activeElement;
    if (!el || el === document.body || el === document.documentElement) return { kind: 'none' };
    // Tab wraps around eventually; stop when an element comes back.
    window.__themeQaSeen ??= new WeakSet();
    const repeat = window.__themeQaSeen.has(el);
    window.__themeQaSeen.add(el);
    const text = (el.getAttribute('aria-label') || el.textContent || '')
      .trim()
      .replace(/\s+/g, ' ');
    const label =
      `<${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}` +
      `${el.classList.length ? `.${[...el.classList].slice(0, 3).join('.')}` : ''}>` +
      (text ? ` "${text.slice(0, 40)}"` : '');
    if (el.closest(ghostSelector)) return { kind: 'ghost', label, repeat };
    if (el.tagName === 'IFRAME') return { kind: 'iframe', label, repeat };
    return { kind: 'element', label, repeat };
  }, GHOST_SELECTOR);
}

async function open(page, path) {
  const response = await page.goto(path);
  test.skip(!isHtml(response), 'not an HTML page');
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
}

for (const entry of runtime.manifest.pages) {
  test(`keyboard skip link: ${entry.id} ${entry.path}`, async ({ page }, testInfo) => {
    await open(page, entry.path);

    // Ghost may put its own UI (the announcement bar) before the theme's markup.
    let focused;
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      focused = await activeElement(page);
      if (focused.kind !== 'ghost') break;
      noteIgnored(
        testInfo,
        `keyboard: Ghost-owned focus stop ${focused.label} before the skip link`,
      );
    }

    const problem = await page.evaluate(({ kind, label }) => {
      if (kind !== 'element') return 'The first Tab focuses nothing in the theme.';
      const el = document.activeElement;
      if (el.tagName !== 'A' || !el.hash) {
        return `The first Tab focuses ${label}, not a link to a spot on the page.`;
      }
      const target = new URL(el.href);
      if (target.origin + target.pathname !== location.origin + location.pathname) {
        return `The first Tab focuses ${label}, which links to another page.`;
      }
      const id = decodeURIComponent(target.hash.slice(1));
      if (!document.getElementById(id) && document.getElementsByName(id).length === 0) {
        return `Skip link ${label} points to #${id}, which doesn't exist on this page.`;
      }
      return null;
    }, focused);
    expect(problem).toBeNull();
  });

  test(`keyboard visible focus: ${entry.id} ${entry.path}`, async ({ page }, testInfo) => {
    await open(page, entry.path);
    // Transitions would make the focused style depend on timing.
    await page.addStyleTag({
      content: '*, *::before, *::after { transition: none !important; }',
    });

    const invisible = [];
    for (let stop = 0; stop < FOCUS_STOPS; stop++) {
      await page.keyboard.press('Tab');
      const focused = await activeElement(page);
      if (focused.kind === 'none' || focused.repeat) break;
      if (focused.kind === 'ghost') {
        noteIgnored(testInfo, `keyboard: Ghost-owned focus stop ${focused.label}`);
        continue;
      }
      // Focus inside an embed stays in the frame; the theme's part ends here.
      if (focused.kind === 'iframe') break;

      // Compare the element, its pseudo-elements, children and parent with and
      // without focus: indicators often live on a ::after or a :focus-within parent.
      const visible = await page.evaluate((properties) => {
        const el = document.activeElement;
        const parts = [
          [el, null],
          [el, '::before'],
          [el, '::after'],
          ...[...el.children].map((child) => [child, null]),
          ...(el.parentElement ? [[el.parentElement, null]] : []),
        ];
        const snapshot = () =>
          parts
            .map(([node, pseudo]) => {
              const style = getComputedStyle(node, pseudo);
              return properties.map((p) => style.getPropertyValue(p)).join('|');
            })
            .join('\n');
        const focusedStyle = snapshot();
        el.blur();
        const unfocusedStyle = snapshot();
        // Tab continues from here: blur keeps the sequential focus starting point.
        return focusedStyle !== unfocusedStyle;
      }, FOCUS_PROPERTIES);
      if (!visible) invisible.push(focused.label);
    }

    expect(invisible, `${invisible.length} focus stop(s) without a visible focus style`).toEqual(
      [],
    );
  });

  test(`keyboard menu: ${entry.id} ${entry.path}`, async ({ page }) => {
    await page.setViewportSize(PHONE);
    await open(page, entry.path);

    const header = page.locator('header, [role="banner"]');
    const withControls = header.locator('button[aria-expanded][aria-controls]').filter({
      visible: true,
    });
    const toggles = (await withControls.count())
      ? withControls
      : header.locator('button[aria-expanded]').filter({ visible: true });
    test.skip(
      (await toggles.count()) === 0,
      `No visible header button with aria-expanded at ${PHONE.width}px`,
    );

    const toggle = toggles.first();
    const name = (await toggle.getAttribute('aria-label')) ?? (await toggle.innerText()).trim();
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle, `"${name}" opens with Enter`).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(toggle, `"${name}" closes with Escape`).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle, `Focus returns to "${name}" after Escape`).toBeFocused();
  });
}
