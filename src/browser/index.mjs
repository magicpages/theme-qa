// Runs the Playwright suite for one profile. By default Playwright runs in the
// pinned Playwright Docker image, so screenshots match between machines and
// CI. `local` uses this machine's Node and browsers instead.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EMPTY_PROFILE } from '../config.mjs';

const require = createRequire(import.meta.url);

const PKG_ROOT = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '../..'));
const PLAYWRIGHT_PKG = realpathSync(require.resolve('@playwright/test/package.json'));
const PLAYWRIGHT_CLI = join(dirname(PLAYWRIGHT_PKG), 'cli.js');
// The image tag follows the installed @playwright/test, so bumping the
// dependency is the only change needed to move both.
const PLAYWRIGHT_VERSION = JSON.parse(readFileSync(PLAYWRIGHT_PKG, 'utf8')).version;
export const PLAYWRIGHT_IMAGE = `mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble`;
// Where our dependencies live: our own node_modules in a checkout, the
// theme's or npx's node_modules when installed as a package.
const DEPS_DIR = dirname(dirname(dirname(PLAYWRIGHT_PKG)));
const CONFIG_FILE = join('tests', 'playwright.config.mjs');
const FIXTURES = join(PKG_ROOT, 'tests', 'fixtures.mjs');

const IGNORED = 'theme-qa:ignored';
const LIGHTHOUSE = 'theme-qa:lighthouse';

/**
 * @param {Awaited<ReturnType<typeof import('../config.mjs').loadConfig>>} config
 * @param {{ manifest: object, profile: string, updateScreenshots?: boolean, local?: boolean, smoke?: boolean }} options
 * @returns {Promise<{ ok: boolean }>}
 */
export async function runBrowserChecks(
  config,
  { manifest, profile, updateScreenshots = false, local = false, smoke = false },
) {
  const resultsDir = join(config.dir, '.theme-qa', 'results', profile);
  const screenshotsDir = join(config.screenshots.dir, profile);
  // Stale reports from an earlier run would be mistaken for this one's.
  rmSync(resultsDir, { recursive: true, force: true });
  mkdirSync(resultsDir, { recursive: true });
  mkdirSync(screenshotsDir, { recursive: true });

  // Theme specs assume the theme's seed content, which the empty site lacks.
  const empty = profile === EMPTY_PROFILE;
  let themeTests = !smoke && !empty && existsSync(config.tests) ? config.tests : null;
  if (themeTests && local && !resolvesToThisPackage(themeTests)) {
    console.warn(
      `⚠ Skipping the theme's own specs in ${relative(config.dir, themeTests) || '.'}: ` +
        `outside Docker they can only import "@magicpages/theme-qa/test" when the theme ` +
        `has @magicpages/theme-qa installed. Run without --local to include them.`,
    );
    themeTests = null;
  }

  const lighthouse =
    !smoke &&
    profile === Object.keys(config.profiles)[0] &&
    manifest.pages.some((page) => page.lighthouse);
  const runs = lighthouse ? ['checks', 'lighthouse'] : ['checks'];

  const plan = local
    ? null
    : dockerMounts({
        theme: config.dir,
        qa: PKG_ROOT,
        deps: DEPS_DIR,
        extra: [resultsDir, screenshotsDir, themeTests].filter(Boolean),
      });
  const map = plan ? plan.map : (path) => path;
  const profileConfig = empty ? {} : config.profiles[profile];

  let ok = true;
  for (const run of runs) {
    const runtime = {
      run,
      manifest,
      profile: { name: profile, ...profileConfig },
      colorSchemes: profileConfig.colorScheme ? [profileConfig.colorScheme] : ['light', 'dark'],
      smoke,
      local,
      ignore: {
        console: config.ignore.console.map(toPattern),
        requests: config.ignore.requests.map(toPattern),
        axe: config.ignore.axe,
      },
      budgets: config.budgets,
      screenshots: {
        viewports: config.screenshots.viewports,
        mask: config.screenshots.mask,
        dir: map(screenshotsDir),
        updateAll: updateScreenshots,
      },
      themeTests: themeTests && map(themeTests),
      resultsDir: map(resultsDir),
    };
    const env = { ...process.env, THEME_QA: JSON.stringify(runtime) };
    const code = plan ? await runInDocker(config, plan, env) : await runOnHost(config, env);
    ok &&= code === 0;
  }

  printSummary(resultsDir, runs, config.budgets);
  return { ok };
}

/** RegExps don't survive JSON; strings in `ignore` match literally. */
function toPattern(pattern) {
  return pattern instanceof RegExp
    ? { source: pattern.source, flags: pattern.flags }
    : { source: String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags: '' };
}

function isInside(path, dir) {
  const rel = relative(dir, path);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * Bind mounts for the container. Theme specs import "@magicpages/theme-qa/test"
 * and Playwright, so both must resolve from anywhere under /work. Every host
 * folder gets exactly one path in the container: if a file were reachable
 * twice, Node would load @playwright/test twice and Playwright refuses that.
 * Outermost folders are mounted first and nested ones reuse their parent.
 * Exported for tests.
 * @param {{ theme: string, qa: string, deps: string, extra: string[] }} dirs existing folders
 */
export function dockerMounts({ theme, qa, deps, extra }) {
  const roots = [
    [theme, '/work/theme'],
    [qa, '/work/qa'],
    [deps, '/work/deps'],
    ...extra.map((dir, i) => [dir, `/work/extra${i}`]),
  ]
    .map(([host, target]) => [realpathSync(host), target])
    .sort(([a], [b]) => a.length - b.length);

  const mounts = [];
  for (const [host, target] of roots) {
    if (!mounts.some(([mounted]) => isInside(host, mounted))) mounts.push([host, target]);
  }

  const map = (path) => {
    const real = existsSync(path) ? realpathSync(path) : resolve(path);
    const [host, target] = mounts.find(([mounted]) => isInside(real, mounted));
    const rel = relative(host, real).split(sep).join('/');
    return rel ? `${target}/${rel}` : target;
  };
  return { mounts, map };
}

// /work/node_modules is a scratch tmpfs: link every dependency into it, plus
// theme-qa itself as @magicpages/theme-qa, so bare imports from theme specs
// under /work/theme resolve. Symlinks keep one real path per file.
const LINK_AND_RUN = `
set -e
deps="$1"; qa="$2"
cd /work/node_modules
for entry in "$deps"/*; do
  [ "\${entry##*/}" = @magicpages ] || ln -s "$entry" .
done
mkdir -p @magicpages
for entry in "$deps"/@magicpages/*; do
  [ -e "$entry" ] && ln -s "$entry" @magicpages/
done
[ -e @magicpages/theme-qa ] || ln -s "$qa" @magicpages/theme-qa
cd "$3"
exec node "$deps/@playwright/test/cli.js" test --config "$qa/tests/playwright.config.mjs"
`;

function runInDocker(config, { mounts, map }, env) {
  const args = [
    'run',
    '--rm',
    '--init',
    '--network',
    'host',
    '--ipc',
    'host',
    // Reports and new baselines land in the theme folder owned by the user.
    ...(process.getuid ? ['--user', `${process.getuid()}:${process.getgid()}`] : []),
    '--env',
    'HOME=/tmp',
    '--env',
    'THEME_QA',
    '--env',
    'CI',
    '--env',
    'GITHUB_ACTIONS',
    ...(process.stdout.isTTY ? ['--env', 'FORCE_COLOR=1'] : []),
    '--tmpfs',
    '/work/node_modules:exec,mode=1777',
    ...mounts.flatMap(([host, target]) => ['--volume', `${host}:${target}`]),
    PLAYWRIGHT_IMAGE,
    'sh',
    '-c',
    LINK_AND_RUN,
    'sh',
    map(DEPS_DIR),
    map(PKG_ROOT),
    map(config.dir),
  ];
  return exitCode('docker', args, { env, stdio: 'inherit' }, () => {
    throw new Error(
      'Docker is not available. Install Docker, or run the browser on this machine with --local.',
    );
  });
}

function runOnHost(config, env) {
  const args = [PLAYWRIGHT_CLI, 'test', '--config', join(PKG_ROOT, CONFIG_FILE)];
  return exitCode(process.execPath, args, { env, stdio: 'inherit', cwd: config.dir });
}

function exitCode(command, args, options, onMissing) {
  return new Promise((done, fail) => {
    const child = spawn(command, args, options);
    child.on('error', (error) => {
      if (error.code === 'ENOENT' && onMissing) {
        try {
          onMissing();
        } catch (missing) {
          fail(missing);
        }
      } else fail(error);
    });
    child.on('close', (code) => done(code ?? 1));
  });
}

/** Outside Docker, a theme spec can only import us if the theme has us installed. */
function resolvesToThisPackage(testsDir) {
  try {
    const found = createRequire(join(testsDir, 'index.mjs')).resolve('@magicpages/theme-qa/test');
    return realpathSync(found) === FIXTURES;
  } catch {
    return false;
  }
}

/** Every annotation in a Playwright JSON report, de-duplicated. */
function annotations(report) {
  const found = new Map();
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    for (const { type, description } of Array.isArray(node.annotations) ? node.annotations : []) {
      found.set(`${type}\n${description}`, { type, description });
    }
    for (const value of Object.values(node)) if (typeof value === 'object') walk(value);
  };
  walk(report);
  return [...found.values()];
}

function printSummary(resultsDir, runs, budgets) {
  const all = runs.flatMap((run) => {
    const file = join(resultsDir, `${run}.json`);
    return existsSync(file) ? annotations(JSON.parse(readFileSync(file, 'utf8'))) : [];
  });

  const ignored = all.filter((a) => a.type === IGNORED).map((a) => a.description);
  if (ignored.length) {
    console.log('\nIgnored, not the theme’s responsibility (Ghost-owned, post content or config):');
    for (const line of ignored.sort()) console.log(`  · ${line}`);
  }

  const scores = all.filter((a) => a.type === LIGHTHOUSE).map((a) => JSON.parse(a.description));
  if (scores.length) {
    const categories = Object.keys(budgets);
    const width = Math.max(4, ...scores.map((s) => s.id.length)) + 2;
    const cell = (text, w) => String(text).padEnd(w);
    console.log('\nLighthouse, mobile (✖ = below budget):');
    const header = categories.map((c) => cell(`${c} (${Math.round(budgets[c] * 100)})`, 22));
    console.log(`  ${cell('page', width)}${header.join('')}`);
    for (const { id, scores: values } of scores) {
      const row = categories.map((c) => {
        const score = values[c];
        const text = score == null ? 'n/a' : Math.round(score * 100);
        return cell(`${text}${score >= budgets[c] ? '' : ' ✖'}`, 22);
      });
      console.log(`  ${cell(id, width)}${row.join('')}`);
    }
  }

  console.log(`\nReport: ${join(resultsDir, 'checks-report', 'index.html')}`);
}
