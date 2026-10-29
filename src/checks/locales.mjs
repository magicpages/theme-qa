// Translation parity against `locales/en.json`. A key missing from a locale
// makes Ghost fall back to the raw key string on the page.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const CHECK = 'locales';
const MAX_LISTED = 10;

export async function checkLocales(config) {
  const dir = join(config.dir, 'locales');
  if (!existsSync(dir)) {
    return [{ check: CHECK, level: 'info', message: 'No locales/ folder; nothing to compare.' }];
  }
  if (!existsSync(join(dir, 'en.json'))) {
    return [
      {
        check: CHECK,
        level: 'info',
        message: 'No locales/en.json to compare against; skipped.',
      },
    ];
  }

  const base = readLocale(dir, 'en.json');
  if (base.error) return [base.error];
  const baseKeys = new Set(base.keys);

  const results = [];
  const others = readdirSync(dir)
    .filter((file) => file.endsWith('.json') && file !== 'en.json')
    .sort();
  for (const file of others) {
    const locale = readLocale(dir, file);
    if (locale.error) {
      results.push(locale.error);
      continue;
    }
    const keys = new Set(locale.keys);
    const missing = base.keys.filter((key) => !keys.has(key));
    const extra = locale.keys.filter((key) => !baseKeys.has(key));
    if (missing.length > 0) {
      results.push({
        check: CHECK,
        level: 'error',
        message: `${file} is missing ${missing.length} key(s) from en.json: ${list(missing)}`,
        file: `locales/${file}`,
      });
    }
    if (extra.length > 0) {
      results.push({
        check: CHECK,
        level: 'warning',
        message: `${file} has ${extra.length} key(s) that en.json doesn't: ${list(extra)}`,
        file: `locales/${file}`,
      });
    }
  }
  results.push({
    check: CHECK,
    level: 'info',
    message: `Compared ${others.length} locale(s) against en.json (${base.keys.length} keys).`,
  });
  return results;
}

function readLocale(dir, file) {
  let data;
  try {
    data = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  } catch (error) {
    return {
      error: {
        check: CHECK,
        level: 'error',
        message: `${file} isn't valid JSON: ${error.message}`,
        file: `locales/${file}`,
      },
    };
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return {
      error: {
        check: CHECK,
        level: 'error',
        message: `${file} must be a JSON object of translation keys.`,
        file: `locales/${file}`,
      },
    };
  }
  return { keys: Object.keys(data) };
}

function list(keys) {
  const shown = keys.slice(0, MAX_LISTED).map((key) => JSON.stringify(key));
  const more = keys.length > MAX_LISTED ? ` and ${keys.length - MAX_LISTED} more` : '';
  return shown.join(', ') + more;
}
