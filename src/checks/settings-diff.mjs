// Compares custom settings with the last release. Ghost stores a site's
// custom setting values by key, so renaming or removing a key silently drops
// what the customer chose, and changing its type resets it.

import { execFileSync } from 'node:child_process';

const CHECK = 'settings-diff';
const FILE = 'package.json';

export async function checkSettingsDiff(config) {
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: config.dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  const skip = (message) => [{ check: CHECK, level: 'info', message }];

  try {
    git('rev-parse', '--git-dir');
  } catch {
    return skip('Not a git repository; no release to compare custom settings with.');
  }

  let tag;
  try {
    tag = git('describe', '--tags', '--abbrev=0');
  } catch {
    return skip('No git tag reachable from HEAD; no release to compare custom settings with.');
  }

  let previous;
  try {
    // `./` makes the path relative to the theme folder, which may sit below
    // the repo root.
    previous = JSON.parse(git('show', `${tag}:./package.json`));
  } catch {
    return skip(`No readable package.json at ${tag}; nothing to compare.`);
  }

  const before = previous.config?.custom ?? {};
  const now = config.pkg.config?.custom ?? {};
  const results = [];
  for (const [key, setting] of Object.entries(before)) {
    if (!(key in now)) {
      results.push({
        check: CHECK,
        level: 'error',
        message: `config.custom.${key} (in ${tag}) is gone: renamed or removed custom setting: customers lose their saved value.`,
        file: FILE,
      });
    } else if (setting?.type !== now[key]?.type) {
      results.push({
        check: CHECK,
        level: 'error',
        message: `config.custom.${key} changed type from "${setting?.type}" (in ${tag}) to "${now[key]?.type}": customers lose their saved value.`,
        file: FILE,
      });
    }
  }
  results.push({
    check: CHECK,
    level: 'info',
    message: `Compared ${Object.keys(now).length} custom setting(s) with ${tag}.`,
  });
  return results;
}
