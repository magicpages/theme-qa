// Inspects the zip customers upload. Ghost (through GScan's zip reader)
// treats the folder holding the shallowest `index.hbs` as the theme root, so
// both "files at the zip root" and "one folder with the theme in it" install
// fine. What it can't do is install a zip without `index.hbs` and
// `package.json` side by side.

import { statSync } from 'node:fs';
import { posix } from 'node:path';
import yauzl from 'yauzl';

const CHECK = 'zip';
const MAX_LISTED = 5;

/** Each rule matches a single zip entry path; `symlink` is decided by mode. */
const FORBIDDEN = [
  { label: 'node_modules/', test: (segments) => segments.includes('node_modules') },
  { label: '.git/', test: (segments) => segments.slice(0, -1).includes('.git') },
  { label: '.github/', test: (segments) => segments.slice(0, -1).includes('.github') },
  { label: '.theme-qa/', test: (segments) => segments.slice(0, -1).includes('.theme-qa') },
  { label: '.env files', test: (segments) => segments.at(-1).startsWith('.env') },
  { label: '.DS_Store', test: (segments) => segments.at(-1) === '.DS_Store' },
  { label: 'source maps (*.map)', test: (segments) => segments.at(-1).endsWith('.map') },
];

export async function checkZip(config, { zipPath }) {
  if (!zipPath) {
    return [{ check: CHECK, level: 'info', message: 'No zip to inspect; skipped.' }];
  }

  const entries = await readEntries(zipPath);
  const files = entries.filter((entry) => !entry.isDirectory);
  const results = [];

  const indexFiles = files
    .filter((entry) => posix.basename(entry.name) === 'index.hbs')
    .sort((a, b) => depth(a.name) - depth(b.name) || a.name.localeCompare(b.name));
  if (indexFiles.length === 0) {
    results.push({
      check: CHECK,
      level: 'error',
      message: 'No index.hbs in the zip; Ghost refuses to install it.',
    });
  } else {
    const root = posix.dirname(indexFiles[0].name);
    const prefix = root === '.' ? '' : `${root}/`;
    if (!files.some((entry) => entry.name === `${prefix}package.json`)) {
      results.push({
        check: CHECK,
        level: 'error',
        message: `No package.json next to ${prefix}index.hbs; Ghost refuses to install it.`,
      });
    }
    const outside = files.filter((entry) => !entry.name.startsWith(prefix));
    if (outside.length > 0) {
      results.push({
        check: CHECK,
        level: 'warning',
        message: `${outside.length} file(s) outside the theme folder "${prefix || '/'}", which Ghost ignores: ${list(outside)}`,
      });
    }
    results.push({
      check: CHECK,
      level: 'info',
      message: prefix
        ? `Theme files are in the folder "${prefix}".`
        : 'Theme files are at the zip root.',
    });
  }

  for (const rule of FORBIDDEN) {
    const hits = entries.filter((entry) => rule.test(entry.name.replace(/\/$/, '').split('/')));
    if (hits.length > 0) {
      results.push({
        check: CHECK,
        level: 'error',
        message: `${rule.label} in the zip (${hits.length}): ${list(hits)}`,
      });
    }
  }

  const symlinks = entries.filter((entry) => entry.isSymlink);
  if (symlinks.length > 0) {
    results.push({
      check: CHECK,
      level: 'error',
      message: `Symlinks in the zip (${symlinks.length}); Ghost won't follow them: ${list(symlinks)}`,
    });
  }

  const unpacked = files.reduce((sum, entry) => sum + entry.size, 0);
  results.push({
    check: CHECK,
    level: 'info',
    message: `${posix.basename(zipPath)}: ${formatBytes(statSync(zipPath).size)}, ${files.length} files, ${formatBytes(unpacked)} unpacked.`,
  });
  return results;
}

async function readEntries(zipPath) {
  const zipfile = await yauzl.openPromise(zipPath);
  const entries = [];
  try {
    for await (const entry of zipfile.eachEntry()) {
      // Unix tools store the file type in the top 16 bits of the external
      // attributes; that's the only place a zip records a symlink.
      const fileType = (entry.externalFileAttributes >>> 16) & 0o170000;
      entries.push({
        name: entry.fileName,
        size: entry.uncompressedSize,
        isDirectory: entry.fileName.endsWith('/'),
        isSymlink: fileType === 0o120000,
      });
    }
  } finally {
    zipfile.close();
  }
  return entries;
}

function depth(name) {
  return name.split('/').length;
}

function list(entries) {
  const shown = entries.slice(0, MAX_LISTED).map((entry) => entry.name);
  const more = entries.length > MAX_LISTED ? `, and ${entries.length - MAX_LISTED} more` : '';
  return shown.join(', ') + more;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
