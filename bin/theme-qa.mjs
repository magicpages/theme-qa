#!/usr/bin/env node
// theme-qa CLI. Thin on purpose: parse flags, load config, call the module
// that owns each step. Every step is also usable on its own, so a failing CI
// step can be reproduced locally with the same command.

import { parseArgs } from 'node:util';
import semver from 'semver';
import { loadConfig, EMPTY_PROFILE } from '../src/config.mjs';
import { buildTheme, packageTheme } from '../src/theme.mjs';
import { runStaticChecks, printStaticResults } from '../src/checks/index.mjs';
import {
  startGhost,
  stopGhost,
  provision,
  applyProfile,
  readManifest,
} from '../src/ghost/index.mjs';
import { runBrowserChecks } from '../src/browser/index.mjs';

const HELP = `Usage: theme-qa <command> [options]

Commands:
  check     Build and zip the theme, then run the static checks
  up        Start Ghost in Docker, install the theme and add test content
  test      Run the browser checks against the running Ghost, once per profile
  down      Stop and remove the Ghost container
  run       check + up + test + down, on an empty site and a seeded one (what CI runs)

Options:
  --dir <path>             Theme folder (default: current folder)
  --ghost <tag>            Ghost Docker image tag (default: config, then 6-alpine)
  --minimum-ghost          Use the oldest Ghost version allowed by engines.ghost
  --smoke                  Only check that pages load without errors, first profile only
  --profile <name>         Only test this profile (repeatable)
  --update-screenshots     Replace the approved screenshots with new ones
  --local                  Run the browser on this machine instead of in Docker
  --empty                  up: leave out all test content, to check empty states
  --keep                   run: leave the seeded Ghost running afterwards
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
    'update-screenshots': { type: 'boolean', default: false },
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
      updateScreenshots: values['update-screenshots'],
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
      updateScreenshots: values['update-screenshots'],
      local: values.local,
      smoke: values.smoke,
    });
    ok &&= result.ok;
  }
  return { ok };
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
