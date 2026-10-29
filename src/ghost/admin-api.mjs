// Minimal Ghost Admin API client using session auth.
//
// Session auth (not an integration key) because a fresh site has no
// integrations yet, and the owner session can do everything seeding needs,
// including user import and theme uploads.

import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';

/**
 * Credentials for the throwaway owner account. The site only ever listens on
 * the loopback interface and is deleted after the run.
 */
export const OWNER = Object.freeze({
  name: 'Theme QA',
  email: 'owner@example.com',
  // Ghost rejects passwords containing words like "password" or the email.
  password: 'qa-7fK3-throwaway-owner',
});

const MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.zip': 'application/zip',
  '.yaml': 'application/x-yaml',
  '.yml': 'application/x-yaml',
  '.json': 'application/json',
};

export function mimeType(filePath) {
  return MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

export class GhostApiError extends Error {
  constructor(method, path, status, body) {
    const errors = body?.errors ?? [];
    const detail = errors.length
      ? errors
          .map((e) => [e.message, e.context, e.details && JSON.stringify(e.details)])
          .map((parts) => parts.filter(Boolean).join(' '))
          .join('; ')
      : typeof body === 'string'
        ? body.slice(0, 500)
        : JSON.stringify(body)?.slice(0, 500);
    super(`${method} ${path} -> HTTP ${status}: ${detail}`);
    this.status = status;
    this.body = body;
  }
}

/** @param {string} url site URL, e.g. http://localhost:2399 */
export function createAdminApi(url) {
  let cookie = null;

  async function request(method, path, { body, query, form } = {}) {
    const target = new URL(`${url}/ghost/api/admin${path}`);
    for (const [key, value] of Object.entries(query ?? {})) target.searchParams.set(key, value);

    // Ghost rejects session-authenticated requests without a matching Origin.
    const headers = { Origin: url, Accept: 'application/json' };
    if (cookie) headers.Cookie = cookie;
    let payload;
    if (form) {
      payload = form;
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }

    const response = await fetch(target, { method, headers, body: payload });
    const setCookie = response.headers.getSetCookie?.() ?? [];
    for (const header of setCookie) {
      if (header.startsWith('ghost-admin-api-session=')) cookie = header.split(';')[0];
    }

    const text = await response.text();
    let data = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // Non-JSON error pages (proxy errors, HTML) are reported as text.
    }
    if (!response.ok) throw new GhostApiError(method, path, response.status, data);
    return data;
  }

  /**
   * Multipart upload of a file on disk.
   * @param {string} path API path, e.g. /images/upload/
   * @param {string} filePath
   * @param {{ field?: string, fields?: Record<string, string> }} [options]
   */
  async function upload(path, filePath, { field = 'file', fields = {} } = {}) {
    const form = new FormData();
    const blob = new Blob([await readFile(filePath)], { type: mimeType(filePath) });
    form.append(field, blob, basename(filePath));
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    return request('POST', path, { form });
  }

  return {
    url,
    request,
    upload,
    get: (path, query) => request('GET', path, { query }),
    post: (path, body, query) => request('POST', path, { body, query }),
    put: (path, body, query) => request('PUT', path, { body, query }),
    del: (path) => request('DELETE', path),

    /** Creates the owner on a fresh site. A site that is already set up is fine. */
    async setup({ title }) {
      const status = await request('GET', '/authentication/setup/');
      if (status.setup?.[0]?.status) return false;
      await request('POST', '/authentication/setup/', {
        body: {
          setup: [
            { name: OWNER.name, email: OWNER.email, password: OWNER.password, blogTitle: title },
          ],
        },
      });
      return true;
    },

    async login() {
      await request('POST', '/session/', {
        body: { username: OWNER.email, password: OWNER.password },
      });
    },
  };
}
