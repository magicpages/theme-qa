// The list of screenshots a visual comparison takes. Shared by the capture spec,
// which runs inside the Playwright container, and the CLI, which compares the
// files afterwards, so both agree on the names.

/**
 * @param {{ id: string, path: string, screenshot?: boolean }[]} pages manifest pages
 * @param {Record<string, { width: number, height: number }>} viewports
 * @param {('light' | 'dark')[]} schemes
 */
export function screenshotPlan(pages, viewports, schemes) {
  return pages
    .filter((page) => page.screenshot)
    .flatMap((page) =>
      Object.entries(viewports).flatMap(([viewport, size]) =>
        schemes.map((scheme) => ({
          file: `${page.id}-${viewport}-${scheme}.png`,
          page: page.id,
          path: page.path,
          viewport,
          size,
          scheme,
        })),
      ),
    );
}
