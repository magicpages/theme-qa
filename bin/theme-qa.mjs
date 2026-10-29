#!/usr/bin/env node
// theme-qa CLI. Thin on purpose: parse flags, load config, call the module
// that owns each step. Every step is also usable on its own, so a failing CI
// step can be reproduced locally with the same command.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import semver from 'semver';
import { loadConfig, EMPTY_PROFILE } from '../src/config.mjs';
import { buildTheme, packageTheme, installDependencies } from '../src/theme.mjs';
import { runStaticChecks, printStaticResults } from '../src/checks/index.mjs';
import {
  startGhost,
  stopGhost,
  provision,
  applyProfile,
  readManifest,
  switchTheme,
} from '../src/ghost/index.mjs';
import { runBrowserChecks, captureScreenshots, colorSchemes } from '../src/browser/index.mjs';
import { checkoutBase } from '../src/visual/base.mjs';
import { screenshotPlan } from '../src/visual/plan.mjs';
import { compareScreenshots } from '../src/visual/diff.mjs';
import { writeReport } from '../src/visual/report.mjs';

const HELP = `Usage: theme-qa <command> [options]

Commands:
  check     Build and zip the theme, then run the static checks
  up        Start Ghost in Docker, install the theme and add test content
  test      Run the browser checks against the running Ghost, once per profile
  down      Stop and remove the Ghost container
  run       check + up + test + down, on an empty site and a seeded one (what CI runs)
  visual    Screenshot the theme as it is at --base and as it is now, on one seeded
            Ghost, and write the differences to .theme-qa/visual/report.html

Options:
  --dir <path>             Theme folder (default: current folder)
  --ghost <tag>            Ghost Docker image tag (default: config, then 6-alpine)
  --minimum-ghost          Use the oldest Ghost version allowed by engines.ghost
  --smoke                  Only check that pages load without errors, first profile only
  --profile <name>         Only test this profile (repeatable); visual: the one to use
  --base <ref>             visual: the branch, tag or commit to compare with
  --local                  Run the browser on this machine instead of in Docker
  --empty                  up: leave out all test content, to check empty states
  --keep                   run, visual: leave the seeded Ghost running afterwards
  -h, --help               Show this help
`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    dir: { type: 'string', default: process.cwd() },
    ghost: { type: 'string' },
    'minimum-ghost': { type: 'boolean', default: false },
    smoke: { type: 'boolean', default: false },
    profile: { type: 'string', multiple: true },
    base: { type: 'string' },
    local: { type: 'boolean', default: false },
    empty: { type: 'boolean', default: false },
    keep: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

const command = positionals[0];
if (values.help || !command) {
  process.stdout.write(HELP);
  process.exit(values.help ? 0 : 1);
}

const config = await loadConfig(values.dir);
if (values.ghost) config.ghost.version = values.ghost;
if (values['minimum-ghost']) {
  const range = config.pkg.engines?.ghost;
  const minimum = range && semver.minVersion(range);
  if (!minimum) {
    console.error('\n✖ --minimum-ghost needs a valid engines.ghost in package.json.');
    process.exit(1);
  }
  config.ghost.version = `${minimum.version}-alpine`;
}

async function check() {
  await buildTheme(config);
  const zipPath = await packageTheme(config);
  // A smoke run is about whether the theme works on another Ghost version;
  // the static checks don't depend on that and already ran in the full job.
  if (values.smoke) return { ok: true, zipPath };
  const report = await runStaticChecks(config, { zipPath });
  printStaticResults(report);
  return { ok: report.ok, zipPath };
}

async function up(zipPath, { empty = false } = {}) {
  const ghost = await startGhost(config);
  const manifest = await provision(config, { url: ghost.url, zipPath, empty });
  console.log(`\nGhost is running at ${manifest.url}`);
  console.log(
    `Admin: ${manifest.url}/ghost/  ${manifest.admin.email} / ${manifest.admin.password}`,
  );
  return manifest;
}

async function test() {
  const manifest = readManifest(config);
  // An empty site has exactly one run: theme defaults, no profiles.
  if (manifest.empty) {
    console.log(`\n── Empty site`);
    return runBrowserChecks(config, {
      manifest,
      profile: EMPTY_PROFILE,
      local: values.local,
    });
  }
  const profiles =
    values.profile ??
    (values.smoke ? [Object.keys(config.profiles)[0]] : Object.keys(config.profiles));
  for (const name of profiles) {
    if (!config.profiles[name]) throw new Error(`No profile named "${name}" in the config.`);
  }
  let ok = true;
  for (const profile of profiles) {
    console.log(`\n── Profile: ${profile}`);
    await applyProfile(config, manifest, profile);
    const result = await runBrowserChecks(config, {
      manifest,
      profile,
      local: values.local,
      smoke: values.smoke,
    });
    ok &&= result.ok;
  }
  return { ok };
}

/**
 * Screenshots both builds on the same site, so only the theme differs:
 * seeding with this build, then switching to the base build. Writes the
 * report whether or not anything changed; CI decides what to do with it.
 */
async function visual() {
  if (!values.base) throw new Error('visual needs --base <ref>, the version to compare with.');
  const profile = values.profile?.[0] ?? Object.keys(config.profiles)[0];
  if (!config.profiles[profile]) throw new Error(`No profile named "${profile}" in the config.`);
  const outDir = join(config.dir, '.theme-qa', 'visual');

  await buildTheme(config);
  const zipPath = await packageTheme(config);

  console.log(`\n── Base: ${values.base}`);
  const base = checkoutBase(config.dir, values.base);
  let manifest;
  try {
    if (!existsSync(join(base.dir, 'package.json'))) {
      throw new Error(
        `The theme doesn't exist at ${values.base} yet; there is nothing to compare.`,
      );
    }
    const baseConfig = await loadConfig(base.dir);
    await installDependencies(base.dir);
    await buildTheme(baseConfig);
    const baseZip = await packageTheme(baseConfig);

    manifest = await up(zipPath);
    try {
      await applyProfile(config, manifest, profile);
      console.log(`\n── Screenshots: this build, profile "${profile}"`);
      await captureScreenshots(config, {
        manifest,
        profile,
        outDir: join(outDir, 'pr'),
        local: values.local,
      });
      console.log(`\n── Screenshots: ${values.base}`);
      await switchTheme(manifest, baseZip);
      await captureScreenshots(config, {
        manifest,
        profile,
        outDir: join(outDir, 'base'),
        local: values.local,
      });
    } finally {
      if (!values.keep) await stopGhost(config);
    }
  } finally {
    base.remove();
  }

  const plan = screenshotPlan(
    manifest.pages,
    config.screenshots.viewports,
    colorSchemes(config, profile),
  );
  const results = compareScreenshots(plan, {
    baseDir: join(outDir, 'base'),
    prDir: join(outDir, 'pr'),
  });
  const { changed, total, report } = writeReport(outDir, results, {
    theme: config.pkg.name,
    profile,
    ghostVersion: manifest.ghostVersion,
    base: { ref: values.base, sha: base.sha },
  });
  console.log(
    changed
      ? `\n${changed} of ${total} screenshots changed. Report: ${report}`
      : `\nNo visual changes in ${total} screenshots.`,
  );
  return { ok: true };
}

let ok = true;
try {
  switch (command) {
    case 'check':
      ok = (await check()).ok;
      break;
    case 'up':
      await buildTheme(config);
      await up(await packageTheme(config), { empty: values.empty });
      break;
    case 'test':
      ok = (await test()).ok;
      break;
    case 'down':
      await stopGhost(config);
      break;
    case 'run': {
      const checked = await check();
      ok = checked.ok;
      try {
        // Empty states get their own fresh site: deleting content from the
        // seeded one would leave Ghost's caches and settings behind. It runs
        // first so --keep leaves the seeded site up for debugging.
        if (!values.smoke) {
          await up(checked.zipPath, { empty: true });
          ok = (await test()).ok && ok;
        }
        await up(checked.zipPath);
        ok = (await test()).ok && ok;
      } finally {
        if (!values.keep) await stopGhost(config);
      }
      break;
    }
    case 'visual':
      ok = (await visual()).ok;
      break;
    default:
      process.stderr.write(`Unknown command "${command}".\n\n${HELP}`);
      process.exit(1);
  }
} catch (error) {
  console.error(`\n✖ ${error.message}`);
  if (process.env.DEBUG) console.error(error.stack);
  process.exit(1);
}

process.exit(ok ? 0 : 1);
