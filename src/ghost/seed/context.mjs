// The object a theme's `seed()` receives, also used for the base content.
//
// Everything that creates content goes through here so tags and authors are
// resolved the same way and every URL the browser checks should visit ends
// up in one registry.

import { isAbsolute, resolve } from 'node:path';
import { cards, lexical } from './lexical.mjs';
import { uploadFile } from './media.mjs';

/**
 * Fixed dates keep "3 days ago" labels and post order stable between runs.
 * Base content lives in the first half of 2025; theme content defaults to
 * dates after it, so it shows up first on the homepage.
 */
export const BASE_DATE = Date.UTC(2025, 4, 1, 9, 0, 0);
export const THEME_DATE = Date.UTC(2025, 5, 1, 9, 0, 0);
const HOUR = 3_600_000;

/** Turns a path into a stable manifest id: `/tag/news/` -> `tag-news`. */
export function idFromPath(path) {
  const id = path
    .replace(/[?#].*$/, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return id || 'home';
}

/** @returns {{ id: string, path: string, status: number, screenshot: boolean, lighthouse: boolean }} */
export function pageEntry(path, { id, status = 200, screenshot = true, lighthouse = false } = {}) {
  if (typeof path !== 'string' || !path.startsWith('/')) {
    throw new Error(`URL paths must start with "/", got ${JSON.stringify(path)}.`);
  }
  return { id: id ?? idFromPath(path), path, status, screenshot, lighthouse };
}

/** Admin API settings take strings; navigation and friends are JSON. */
export function settingsPayload(values, knownKeys) {
  const unknown = Object.keys(values).filter((key) => !knownKeys.has(key));
  if (unknown.length) {
    throw new Error(
      `Unknown Ghost setting(s): ${unknown.join(', ')}. Known settings: ${[...knownKeys].sort().join(', ')}`,
    );
  }
  return Object.entries(values).map(([key, value]) => ({
    key,
    value: value !== null && typeof value === 'object' ? JSON.stringify(value) : value,
  }));
}

/**
 * Runs at most `size` tasks at once. Ghost on SQLite writes one row at a
 * time anyway; capping in-flight requests keeps it from timing out queued
 * ones while still overlapping network and rendering work.
 * @param {number} size
 */
export function limiter(size) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= size || !queue.length) return;
    active += 1;
    const { task, resolve, reject } = queue.shift();
    task()
      .then(resolve, reject)
      .finally(() => {
        active -= 1;
        next();
      });
  };
  return (task) =>
    new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject });
      next();
    });
}

/** @typedef {ReturnType<typeof createSeedContext>} SeedContext */

/**
 * @param {ReturnType<import('../admin-api.mjs').createAdminApi>} api
 * @param {{ ghostVersion: string, themeDir: string, settingKeys: Set<string> }} options
 */
export function createSeedContext(api, { ghostVersion, themeDir, settingKeys }) {
  const pages = new Map();
  const tagCache = new Map();
  let users = null;
  let clock = THEME_DATE;
  const created = { posts: [], pages: [] };
  const write = limiter(4);

  async function loadUsers() {
    users ??= api.get('/users/', { limit: 'all' }).then((r) => r.users);
    return users;
  }

  async function resolveAuthor(ref) {
    const all = await loadUsers();
    const user = all.find((u) => [u.email, u.slug, u.name, u.id].includes(ref));
    if (!user) {
      throw new Error(
        `Unknown author "${ref}". Staff users: ${all.map((u) => `${u.name} <${u.email}>`).join(', ')}`,
      );
    }
    return { id: user.id };
  }

  /** Concurrent posts sharing a new tag must not race to create it twice. */
  function ensureTag(ref) {
    const opts = typeof ref === 'string' ? { name: ref } : ref;
    const key = opts.slug ?? opts.name;
    if (!tagCache.has(key)) {
      tagCache.set(
        key,
        api
          .get('/tags/', { filter: `name:'${opts.name.replaceAll("'", "\\'")}'`, limit: '1' })
          .then((r) => r.tags[0] ?? createTag(opts)),
      );
    }
    return tagCache.get(key);
  }

  async function createTag({ name, slug, description, featureImage, accentColor, fields = {} }) {
    const result = await api.post('/tags/', {
      tags: [
        {
          name,
          slug,
          description,
          feature_image: featureImage,
          accent_color: accentColor,
          ...fields,
        },
      ],
    });
    return result.tags[0];
  }

  async function createContent(type, opts) {
    const {
      title,
      slug,
      tags = [],
      authors = [],
      cards: nodes,
      html,
      featureImage,
      excerpt,
      visibility = 'public',
      featured = false,
      status = 'published',
      publishedAt,
      fields = {},
    } = opts;
    if (!title) throw new Error(`${type} needs a title.`);
    if (nodes && html) throw new Error(`${type} "${title}": pass either cards or html, not both.`);

    let publishedDate = publishedAt;
    if (publishedDate === undefined) {
      publishedDate = new Date(clock).toISOString();
      clock += HOUR;
    }

    const image = typeof featureImage === 'string' ? { src: featureImage } : featureImage;
    const body = {
      title,
      slug,
      status,
      visibility,
      featured,
      custom_excerpt: excerpt,
      published_at: status === 'draft' ? undefined : new Date(publishedDate).toISOString(),
      feature_image: image?.src ?? null,
      feature_image_alt: image?.alt,
      feature_image_caption: image?.caption,
      tags: await Promise.all(tags.map(async (tag) => ({ id: (await ensureTag(tag)).id }))),
      ...(authors.length ? { authors: await Promise.all(authors.map(resolveAuthor)) } : {}),
      ...(html !== undefined ? { html } : { lexical: lexical(nodes ?? []) }),
      ...fields,
    };
    const endpoint = type === 'post' ? '/posts/' : '/pages/';
    const query = html !== undefined ? { source: 'html' } : undefined;
    const result = await write(() => api.post(endpoint, { [`${type}s`]: [body] }, query));
    const resource = result[`${type}s`][0];
    created[`${type}s`].push(resource);
    return resource;
  }

  const ctx = {
    api,
    cards,
    ghostVersion,
    created,

    /** Creates a post; see the README for the options. Returns the Admin API post. */
    post: (opts) => createContent('post', opts),
    page: (opts) => createContent('page', opts),
    tag: (opts) => ensureTag(opts),

    /** Uploads a file (relative to the theme folder) and returns its URL. */
    async upload(filePath) {
      return uploadFile(api, isAbsolute(filePath) ? filePath : resolve(themeDir, filePath));
    },

    async settings(values) {
      await api.put('/settings/', { settings: settingsPayload(values, settingKeys) });
    },

    async custom(values) {
      await putCustomSettings(api, values);
    },

    /** Adds a URL to the pages the browser checks visit. */
    url(path, options = {}) {
      const entry = pageEntry(path, options);
      const existing = pages.get(entry.id);
      if (existing && existing.path !== entry.path) {
        throw new Error(`Page id "${entry.id}" is used for ${existing.path} and ${entry.path}.`);
      }
      pages.set(entry.id, entry);
      return entry;
    },

    /** Registered pages in registration order. */
    pages: () => [...pages.values()],

    /** Forgets cached users, e.g. after importing staff. */
    resetUsers() {
      users = null;
    },
  };
  return ctx;
}

/**
 * Sets custom theme settings, checking keys against the active theme first so
 * a typo names the valid keys instead of failing deep inside Ghost.
 */
export async function putCustomSettings(api, values) {
  const { custom_theme_settings: current } = await api.get('/custom_theme_settings/');
  const known = new Set(current.map((s) => s.key));
  const unknown = Object.keys(values).filter((key) => !known.has(key));
  if (unknown.length) {
    throw new Error(
      `Unknown custom theme setting(s): ${unknown.join(', ')}. ` +
        `The active theme has: ${[...known].join(', ') || 'none'}`,
    );
  }
  if (!Object.keys(values).length) return current;
  const result = await api.put('/custom_theme_settings/', {
    custom_theme_settings: Object.entries(values).map(([key, value]) => ({ key, value })),
  });
  return result.custom_theme_settings;
}
