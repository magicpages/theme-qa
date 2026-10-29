// Loads and normalises a theme's `theme-qa.config.mjs`.
//
// Every key is optional; a theme with no config file still gets the full
// base content, one `default` profile and the standard URL list. The
// normalised shape below is the contract every other module reads, so add
// new keys here (with a default) rather than reading raw config elsewhere.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const CONFIG_FILE = 'theme-qa.config.mjs';

/**
 * The run against a site with no posts, for empty states. It is not a
 * profile a theme defines: same custom settings as the theme defaults, on its
 * own Ghost site.
 */
export const EMPTY_PROFILE = 'empty';

/** Base content groups a theme can switch off with `base.exclude`. */
export const BASE_GROUPS = [
  'cards',
  'typography',
  'titles',
  'images',
  'i18n',
  'authors',
  'tags',
  'visibility',
  'pagination',
];

const DEFAULT_BUDGETS = {
  performance: 0.9,
  accessibility: 1,
  'best-practices': 0.95,
  seo: 1,
};

const DEFAULT_VIEWPORTS = {
  phone: { width: 375, height: 812 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1440, height: 900 },
};

/**
 * @param {string} themeDir absolute path to the theme repo
 * @returns {Promise<ReturnType<typeof normalise>>}
 */
export async function loadConfig(themeDir) {
  const dir = resolve(themeDir);
  const pkgPath = resolve(dir, 'package.json');
  if (!existsSync(pkgPath)) {
    throw new Error(`No package.json in ${dir}. Run theme-qa from a theme's root folder.`);
  }
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

  const configPath = resolve(dir, CONFIG_FILE);
  const raw = existsSync(configPath)
    ? ((await import(pathToFileURL(configPath).href)).default ?? {})
    : {};

  return normalise(raw, { dir, pkg, configPath: existsSync(configPath) ? configPath : null });
}

/**
 * Exported for tests: turns a raw config object into the normalised shape.
 * @param {Record<string, any>} raw
 * @param {{ dir: string, pkg: Record<string, any>, configPath: string | null }} ctx
 */
export function normalise(raw, { dir, pkg, configPath }) {
  const known = new Set([
    'name',
    'build',
    'zip',
    'routes',
    'ghost',
    'base',
    'seed',
    'profiles',
    'urls',
    'ignore',
    'budgets',
    'screenshots',
    'tests',
  ]);
  for (const key of Object.keys(raw)) {
    if (!known.has(key)) {
      throw new Error(
        `Unknown key "${key}" in ${CONFIG_FILE}. Known keys: ${[...known].join(', ')}`,
      );
    }
  }

  const name = raw.name ?? pkg.name;
  if (!name)
    throw new Error('Theme name missing: set "name" in package.json or theme-qa.config.mjs.');

  const exclude = raw.base?.exclude ?? [];
  for (const group of exclude) {
    if (!BASE_GROUPS.includes(group)) {
      throw new Error(`Unknown base group "${group}". Known groups: ${BASE_GROUPS.join(', ')}`);
    }
  }

  if (raw.seed !== undefined && typeof raw.seed !== 'function') {
    throw new Error(
      '"seed" must be an async function: seed: async ({ post, page, tag }) => { ... }',
    );
  }

  const profiles = raw.profiles ?? { default: {} };
  if (Object.keys(profiles).length === 0) throw new Error('"profiles" needs at least one profile.');
  for (const [profileName, profile] of Object.entries(profiles)) {
    if (profileName === EMPTY_PROFILE) {
      throw new Error(
        `"${EMPTY_PROFILE}" is reserved for the run against a site with no posts. Rename that profile.`,
      );
    }
    for (const key of Object.keys(profile)) {
      if (!['custom', 'settings', 'colorScheme'].includes(key)) {
        throw new Error(
          `Unknown key "${key}" in profile "${profileName}". Known keys: custom, settings, colorScheme`,
        );
      }
    }
    if (profile.colorScheme && !['light', 'dark'].includes(profile.colorScheme)) {
      throw new Error(`Profile "${profileName}": colorScheme must be "light" or "dark".`);
    }
  }

  const urls = (raw.urls ?? []).map((entry) =>
    typeof entry === 'string' ? { path: entry, status: 200 } : { status: 200, ...entry },
  );

  return {
    dir,
    configPath,
    pkg,
    name,
    build: raw.build === undefined ? (pkg.scripts?.build ? 'npm run build' : null) : raw.build,
    zip: {
      command: raw.zip?.command ?? (pkg.scripts?.zip ? 'npm run zip' : null),
      path: raw.zip?.path ?? null,
    },
    routes: raw.routes ? resolve(dir, raw.routes) : null,
    ghost: {
      image: raw.ghost?.image ?? 'ghost',
      version: raw.ghost?.version ?? '6-alpine',
      port: raw.ghost?.port ?? 2399,
    },
    base: { exclude },
    seed: raw.seed ?? null,
    profiles,
    urls,
    ignore: {
      console: raw.ignore?.console ?? [],
      requests: raw.ignore?.requests ?? [],
      axe: raw.ignore?.axe ?? [],
    },
    budgets: { ...DEFAULT_BUDGETS, ...raw.budgets },
    screenshots: {
      viewports: raw.screenshots?.viewports ?? DEFAULT_VIEWPORTS,
      mask: raw.screenshots?.mask ?? [],
    },
    tests: resolve(dir, raw.tests ?? 'qa'),
  };
}
