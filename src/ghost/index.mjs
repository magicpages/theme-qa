// Ghost lifecycle for the CLI: start a throwaway Ghost, install the theme,
// fill it with test content and describe the result in the manifest the
// browser checks read.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createAdminApi, GhostApiError, OWNER } from './admin-api.mjs';
import { containerName, removeContainer, startContainer } from './docker.mjs';
import { seedBase, siteSettings } from './seed/base.mjs';
import { findCardMarkers } from './seed/cards.mjs';
import {
  createSeedContext,
  pageEntry,
  putCustomSettings,
  settingsPayload,
} from './seed/context.mjs';
import { uploadFixtures } from './seed/media.mjs';
import { postsPerPage } from './seed/pagination.mjs';

const log = (message) => console.log(`  ${message}`);
const seconds = (since) => `${((Date.now() - since) / 1000).toFixed(1)}s`;

export function manifestPath(config) {
  return join(config.dir, '.theme-qa', 'manifest.json');
}

export async function startGhost(config) {
  const started = Date.now();
  const image = `${config.ghost.image}:${config.ghost.version}`;
  console.log(`Starting ${image} as ${containerName(config)}…`);
  const { url } = await startContainer(config);
  log(`Ghost answered at ${url} after ${seconds(started)}`);
  return { url };
}

export async function stopGhost(config) {
  await removeContainer(containerName(config));
  console.log(`Removed ${containerName(config)}.`);
}

export function readManifest(config) {
  const file = manifestPath(config);
  if (!existsSync(file)) {
    throw new Error(`No manifest at ${file}. Run \`theme-qa up\` first.`);
  }
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** Gscan output arrives as HTML fragments; plain text reads better in a terminal. */
function describeThemeProblems(problems) {
  const strip = (value) =>
    String(value ?? '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  return problems
    .map((p) => {
      const files = (p.failures ?? []).map((f) => f.ref).filter(Boolean);
      return `  - ${strip(p.rule)}${files.length ? ` (${files.join(', ')})` : ''}`;
    })
    .join('\n');
}

async function installTheme(api, zipPath) {
  let uploaded;
  try {
    uploaded = (await api.upload('/themes/upload/', zipPath, { field: 'file' })).themes[0];
  } catch (error) {
    const details = error instanceof GhostApiError ? error.body?.errors?.[0]?.details : null;
    const problems = [...(details?.errors ?? []), ...(details?.fatalErrors ?? [])];
    if (problems.length) {
      throw new Error(`Ghost refused the theme zip:\n${describeThemeProblems(problems)}`);
    }
    throw error;
  }
  const activated = (await api.put(`/themes/${encodeURIComponent(uploaded.name)}/activate/`))
    .themes[0];
  if (activated.errors?.length) {
    throw new Error(
      `Ghost activated "${activated.name}" but reports errors:\n${describeThemeProblems(activated.errors)}`,
    );
  }
  const warnings = activated.warnings?.length ?? 0;
  log(
    `Theme "${activated.name}" active${warnings ? ` (${warnings} Ghost warning(s); see the static checks)` : ''}`,
  );
  return activated;
}

/** A fresh Ghost ships a sample post, page and tag; they would change with every release. */
async function clearDefaultContent(api) {
  const [{ posts }, { pages }, { tags }] = await Promise.all([
    api.get('/posts/', { limit: 'all', fields: 'id' }),
    api.get('/pages/', { limit: 'all', fields: 'id' }),
    api.get('/tags/', { limit: 'all', fields: 'id' }),
  ]);
  for (const post of posts) await api.del(`/posts/${post.id}/`);
  for (const page of pages) await api.del(`/pages/${page.id}/`);
  for (const tag of tags) await api.del(`/tags/${tag.id}/`);
}

async function ghostVersion(api) {
  // `/site/` reports only major.minor; `/config/` has the full version.
  const [{ site }, config] = await Promise.all([
    api.get('/site/'),
    api.get('/config/').catch(() => null),
  ]);
  return config?.config?.version ?? site.version;
}

async function applySiteSettings(api, values, knownKeys) {
  const supported = Object.fromEntries(
    Object.entries(values).filter(([key]) => knownKeys.has(key)),
  );
  const skipped = Object.keys(values).filter((key) => !knownKeys.has(key));
  if (skipped.length) log(`This Ghost version has no ${skipped.join(', ')} setting(s); skipped`);
  await api.put('/settings/', { settings: settingsPayload(supported, knownKeys) });
}

/** Logs which cards Ghost rendered; a miss means Ghost changed, not the theme. */
async function reportCardCoverage(api, post, cards) {
  const { posts } = await api.get(`/posts/${post.id}/`, { formats: 'html' });
  const { found, missing } = findCardMarkers(posts[0].html ?? '', cards);
  log(`Cards rendered: ${found.length}/${cards.length}`);
  if (missing.length) {
    log(`Warning: Ghost rendered no output for: ${missing.join(', ')}. Check the card builders.`);
  }
  return { found, missing };
}

/**
 * Values the profiles change, as they were after seeding. Restoring these
 * before each profile keeps one profile's settings from leaking into the next.
 */
async function captureBaseline(api, config) {
  const keys = new Set(
    Object.values(config.profiles).flatMap((profile) => Object.keys(profile.settings ?? {})),
  );
  const [{ settings }, { custom_theme_settings: custom }] = await Promise.all([
    api.get('/settings/'),
    api.get('/custom_theme_settings/'),
  ]);
  return {
    custom: Object.fromEntries(custom.map((s) => [s.key, s.value])),
    settings: Object.fromEntries(
      settings.filter((s) => keys.has(s.key)).map((s) => [s.key, s.value]),
    ),
  };
}

function mergeConfigUrls(pages, urls) {
  const byId = new Map(pages.map((page) => [page.id, page]));
  for (const { path, ...options } of urls) {
    const entry = pageEntry(path, options);
    const existing = byId.get(entry.id);
    if (existing && existing.path !== entry.path) {
      throw new Error(
        `urls: id "${entry.id}" is already used for ${existing.path}. Give ${entry.path} its own id.`,
      );
    }
    byId.set(entry.id, { ...existing, ...entry });
  }
  return [...byId.values()];
}

/**
 * Ghost resizes an image the first time a size is requested, and concurrent
 * first requests for the same size can get an empty response. Requesting every
 * resized image once, one at a time, keeps the parallel browser checks from
 * seeing broken images.
 */
async function warmImageSizes(url, pages) {
  const started = Date.now();
  const images = new Set();
  for (const page of pages) {
    const response = await fetch(new URL(page.path, url));
    const html = await response.text();
    if (!response.headers.get('content-type')?.includes('text/html')) continue;
    for (const [match] of html.matchAll(/[^\s"',]*\/content\/images\/size\/[^\s"',]+/g)) {
      images.add(new URL(match, url).href);
    }
  }
  for (const image of images) await (await fetch(image)).arrayBuffer();
  log(`Resized ${images.size} images in ${seconds(started)}`);
}

/**
 * @param {{ url: string, zipPath: string, empty?: boolean }} options `empty`
 *   leaves out all posts, pages and tags (base and theme) to test empty states.
 *   Site settings, fixtures and routes still go in: a new site has those too.
 */
export async function provision(config, { url, zipPath, empty = false }) {
  const started = Date.now();
  const api = createAdminApi(url);
  await api.setup({ title: 'Theme QA' });
  await api.login();
  const version = await ghostVersion(api);
  console.log(`Provisioning Ghost ${version}…`);

  const theme = await installTheme(api, zipPath);
  if (config.routes) {
    await api.upload('/settings/routes/yaml/', config.routes, { field: 'routes' });
    log(`Uploaded ${config.routes}`);
  }

  const seedStarted = Date.now();
  const [media, { settings }, { users }] = await Promise.all([
    uploadFixtures(api),
    api.get('/settings/'),
    api.get('/users/me/'),
    clearDefaultContent(api),
  ]);
  const settingKeys = new Set(settings.map((s) => s.key));
  await applySiteSettings(api, siteSettings(media, config.base), settingKeys);

  const ctx = createSeedContext(api, { ghostVersion: version, themeDir: config.dir, settingKeys });
  if (empty) {
    log('Empty site: no base or theme content');
  } else {
    const { results } = await seedBase(ctx, { config, media, owner: users[0], log });
    log(`Base content: ${ctx.created.posts.length} posts, ${ctx.created.pages.length} pages`);

    if (config.seed) {
      const before = ctx.created.posts.length + ctx.created.pages.length;
      // The shared fixtures are already uploaded; themes reuse them instead of
      // shipping their own copies (ctx.media.audio, ctx.media.images.square, …).
      await config.seed({ ...ctx, media });
      log(`Theme content: ${ctx.created.posts.length + ctx.created.pages.length - before} items`);
    }
    if (results.cards)
      await reportCardCoverage(api, results.cards.kitchenSink, results.cards.cards);

    // Counted after the theme's own content, which may add to the home collection.
    const perPage = postsPerPage(config.pkg);
    const published = ctx.created.posts.filter((p) => p.status === 'published').length;
    if (published > perPage) ctx.url('/page/2/', { id: 'page-2' });
    else log(`No /page/2/: ${published} posts at ${perPage} per page`);
  }
  log(`Seeding took ${seconds(seedStarted)}`);

  const standard = empty ? [pageEntry('/', { id: 'home' })] : ctx.pages();
  const pages = mergeConfigUrls(
    [...standard, pageEntry('/theme-qa-missing/', { id: 'not-found', status: 404 })],
    // A URL that only exists once there is content opts out with `empty: false`.
    empty ? config.urls.filter((entry) => entry.empty !== false) : config.urls,
  );
  await warmImageSizes(url, pages);

  const manifest = {
    url,
    ghostVersion: version,
    empty,
    theme: theme.name,
    admin: { email: OWNER.email, password: OWNER.password },
    pages,
    baseline: await captureBaseline(api, config),
  };
  const file = manifestPath(config);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  log(`Wrote ${file} (${pages.length} pages) in ${seconds(started)}`);
  return manifest;
}

export async function applyProfile(config, manifest, profileName) {
  const profile = config.profiles[profileName];
  if (!profile) {
    throw new Error(
      `No profile named "${profileName}". Profiles: ${Object.keys(config.profiles).join(', ')}`,
    );
  }
  const api = createAdminApi(manifest.url);
  await api.login();

  // Restoring the post-seed values first means nothing carries over from the
  // previous profile. They equal the theme defaults unless seed() changed them.
  const custom = profile.custom ?? {};
  await putCustomSettings(api, { ...manifest.baseline.custom, ...custom });

  const values = profile.settings ?? {};
  const { settings } = await api.get('/settings/');
  const knownKeys = new Set(settings.map((s) => s.key));
  settingsPayload(values, knownKeys);
  const missing = Object.keys(values).filter((key) => !(key in manifest.baseline.settings));
  if (missing.length) {
    throw new Error(
      `Profile "${profileName}" sets ${missing.join(', ')}, which the running site has no baseline for. ` +
        'The config changed since `theme-qa up`; run it again.',
    );
  }
  const merged = { ...manifest.baseline.settings, ...values };
  if (Object.keys(merged).length) {
    await api.put('/settings/', { settings: settingsPayload(merged, knownKeys) });
  }
  log(
    `Profile "${profileName}": ${Object.keys(custom).length} custom, ${Object.keys(values).length} site setting(s)`,
  );
}

/**
 * Replaces the active theme with another build of the same theme (the base
 * branch of a visual comparison) and keeps the custom setting values, so both
 * builds are seen with the same settings. Settings the other build doesn't
 * have are left out and listed.
 */
export async function switchTheme(manifest, zipPath) {
  const api = createAdminApi(manifest.url);
  await api.login();
  const { custom_theme_settings: before } = await api.get('/custom_theme_settings/');
  const theme = await installTheme(api, zipPath);
  const { custom_theme_settings: after } = await api.get('/custom_theme_settings/');
  const known = new Set(after.map((s) => s.key));
  const kept = before.filter((s) => known.has(s.key)).map(({ key, value }) => ({ key, value }));
  const dropped = before.filter((s) => !known.has(s.key)).map((s) => s.key);
  if (kept.length) await api.put('/custom_theme_settings/', { custom_theme_settings: kept });
  if (dropped.length) log(`Not in this build, left out: ${dropped.join(', ')}`);
  await warmImageSizes(manifest.url, manifest.pages);
  return theme;
}
