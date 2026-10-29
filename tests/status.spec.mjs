// Every page in the manifest answers with the status seeding expects.

import { test, expect } from './fixtures.mjs';
import { runtime } from './lib/runtime.mjs';

for (const entry of runtime.manifest.pages) {
  test(`status: ${entry.id} ${entry.path}`, async ({ page }) => {
    const response = await page.goto(entry.path);
    expect(response, `No response for ${entry.path}`).not.toBeNull();
    expect(response.status(), `${entry.path} answered ${response.status()}`).toBe(entry.status);
  });
}
