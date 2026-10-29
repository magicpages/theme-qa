// Checks out the commit a visual comparison compares against, in a temporary
// git worktree outside the theme folder, so the theme's own zip script never
// picks it up.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/**
 * @param {string} themeDir the theme folder of the pull request checkout
 * @param {string} ref branch, tag or commit to compare against
 * @returns {{ dir: string, sha: string, remove: () => void }} `dir` is the
 *   theme folder inside the worktree
 */
export function checkoutBase(themeDir, ref) {
  let top;
  let sha;
  try {
    top = git(['rev-parse', '--show-toplevel'], themeDir);
    sha = git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], themeDir);
  } catch {
    throw new Error(
      `Can't find "${ref}" in the git history of ${themeDir}. ` +
        'In CI, check out with fetch-depth: 0 so the base branch is there.',
    );
  }
  const root = mkdtempSync(join(tmpdir(), 'theme-qa-base-'));
  git(['worktree', 'add', '--detach', root, sha], themeDir);
  return {
    dir: join(root, relative(top, themeDir)),
    sha,
    remove() {
      try {
        git(['worktree', 'remove', '--force', root], themeDir);
      } catch {
        rmSync(root, { recursive: true, force: true });
        git(['worktree', 'prune'], themeDir);
      }
    },
  };
}
