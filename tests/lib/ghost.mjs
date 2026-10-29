// What Ghost renders and loads itself. Problems inside these are Ghost's, not
// the theme's, so the checks filter them out and say so in their output.

/** Root elements Ghost's own apps (Portal, search, comments, announcement bar) render into. */
export const GHOST_ROOTS = [
  '#ghost-portal-root',
  '#sodo-search-root',
  '#ghost-comments-root',
  '#announcement-bar-root',
];

/**
 * Editor cards: Ghost renders their HTML, the theme only styles them. Markup
 * problems inside a card (a slider without a label, a product image without
 * alt) are Ghost's. Colour contrast stays the theme's: it sets the colours.
 */
export const GHOST_CARD = '.kg-card';
export const THEME_STYLED_RULES = new Set(['color-contrast', 'color-contrast-enhanced']);

/**
 * Feeds, sitemaps and other non-HTML routes get the status and console checks
 * only: accessibility, keyboard and screenshot checks are about pages.
 * @param {import('@playwright/test').Response | null} response
 */
export function isHtml(response) {
  return (response?.headers()['content-type'] ?? '').includes('text/html');
}

/** Same-origin paths served by Ghost itself rather than the theme. */
const GHOST_PATHS = ['/public/', '/ghost/', '/members/'];

/**
 * Third-party origins Ghost loads on its own: its apps from jsDelivr, fonts
 * from Bunny Fonts when a site picks a custom font, avatars from Gravatar.
 * @param {URL} url
 */
function isGhostThirdParty(url) {
  if (url.hostname === 'cdn.jsdelivr.net') return url.pathname.startsWith('/ghost/');
  return (
    url.hostname === 'fonts.bunny.net' ||
    url.hostname === 'gravatar.com' ||
    url.hostname.endsWith('.gravatar.com')
  );
}

/**
 * True when `url` is a script, style or endpoint Ghost owns.
 * @param {string} url
 * @param {string} siteUrl
 */
export function isGhostOwned(url, siteUrl) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.origin === new URL(siteUrl).origin) {
    return GHOST_PATHS.some((path) => parsed.pathname.startsWith(path));
  }
  return isGhostThirdParty(parsed);
}

/**
 * @param {string} url
 * @param {string} siteUrl
 */
export function isThirdParty(url, siteUrl) {
  return /^(https?|wss?):/.test(url) && new URL(url).origin !== new URL(siteUrl).origin;
}

/** Drops the query string so cache-busting versions don't defeat de-duplication. */
export function withoutQuery(url) {
  return url.split(/[?#]/)[0];
}
