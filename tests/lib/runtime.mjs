// Playwright may run in a Docker container, so runBrowserChecks hands the run
// over as one JSON environment variable, with every path already translated
// to where Playwright sees it. Specs read it at collection time to generate
// one test per manifest page.

export const RUNTIME_ENV = 'THEME_QA';

function load() {
  const raw = process.env[RUNTIME_ENV];
  if (!raw) {
    throw new Error(
      `${RUNTIME_ENV} is not set. Start the browser checks with "theme-qa test", not "playwright test".`,
    );
  }
  const data = JSON.parse(raw);
  // RegExps don't survive JSON, so the runner sends { source, flags } pairs.
  const revive = (patterns) => patterns.map(({ source, flags }) => new RegExp(source, flags));
  return {
    ...data,
    ignore: {
      console: revive(data.ignore.console),
      requests: revive(data.ignore.requests),
      axe: data.ignore.axe,
    },
  };
}

/**
 * @type {{
 *   run: 'checks' | 'lighthouse' | 'screenshots',
 *   manifest: { url: string, pages: { id: string, path: string, status: number, screenshot?: boolean, lighthouse?: boolean }[] },
 *   profile: { name: string, colorScheme?: 'light' | 'dark', custom?: object, settings?: object },
 *   colorSchemes: ('light' | 'dark')[],
 *   smoke: boolean,
 *   local: boolean,
 *   ignore: { console: RegExp[], requests: RegExp[], axe: string[] },
 *   budgets: Record<string, number>,
 *   screenshots: { viewports: Record<string, { width: number, height: number }>, mask: string[], dir: string | null },
 *   themeTests: string | null,
 *   resultsDir: string,
 * }}
 */
export const runtime = load();

/** Ignored findings become annotations; the runner prints each one once after the run. */
export const IGNORED = 'theme-qa:ignored';
export const LIGHTHOUSE = 'theme-qa:lighthouse';

/**
 * @param {import('@playwright/test').TestInfo} testInfo
 * @param {string} description
 */
export function noteIgnored(testInfo, description) {
  if (!testInfo.annotations.some((a) => a.type === IGNORED && a.description === description)) {
    testInfo.annotations.push({ type: IGNORED, description });
  }
}
