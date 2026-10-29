// Builds the theme and produces the zip that the static checks inspect and
// Ghost installs. The zip is the artefact customers upload, so we test the
// zip the theme's own release command makes whenever there is one.

import { spawn, execFileSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';

// Some filesystems store mtimes with 1–2 s granularity; without slack a zip
// written right after the command starts could look older than the run.
const MTIME_SLACK_MS = 2000;

/** Runs `config.build` in the theme folder, if the theme has one. */
export async function buildTheme(config) {
  if (typeof config.build !== 'string') return;
  console.log(`\n── Build: ${config.build}`);
  await runShell(config.build, config.dir);
}

/**
 * Installs the theme's npm dependencies: `npm ci` with a lockfile, else
 * `npm install`. The CLI only needs this for the base checkout of a visual
 * comparison; the theme's own checkout is installed by whoever runs us.
 */
export async function installDependencies(dir) {
  if (!existsSync(join(dir, 'package.json'))) return;
  const command = existsSync(join(dir, 'package-lock.json'))
    ? 'npm ci --no-audit --no-fund'
    : 'npm install --no-audit --no-fund';
  console.log(`\n── Install: ${command}`);
  await runShell(command, dir);
}

/**
 * Returns the absolute path of the theme zip.
 *
 * With `zip.command`, runs it and picks up the zip it wrote. Without one,
 * zips the files git tracks. That fallback can't see gitignored build output,
 * so themes that don't commit their built assets must set `zip.command`.
 */
export async function packageTheme(config) {
  if (config.zip.command) {
    const startedAt = Date.now() - MTIME_SLACK_MS;
    console.log(`\n── Zip: ${config.zip.command}`);
    await runShell(config.zip.command, config.dir);
    return locateZip(config, startedAt);
  }
  return zipTrackedFiles(config);
}

function runShell(command, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, { cwd, shell: true, stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (code === 0) resolvePromise();
      else
        reject(
          new Error(
            `"${command}" failed in ${cwd} with ${signal ? `signal ${signal}` : `exit code ${code}`}.`,
          ),
        );
    });
  });
}

// A zip that exists but wasn't written by this run is a leftover from an
// earlier release; checking it would test the wrong code.
function locateZip(config, startedAt) {
  const isFresh = (path) => statSync(path).mtimeMs >= startedAt;

  if (config.zip.path) {
    const path = resolve(config.dir, config.zip.path);
    if (!existsSync(path)) {
      throw new Error(`zip.path is ${path}, but "${config.zip.command}" didn't create it.`);
    }
    if (!isFresh(path)) {
      throw new Error(`${path} wasn't updated by "${config.zip.command}"; it's a stale zip.`);
    }
    return path;
  }

  for (const path of [
    join(config.dir, `${config.name}.zip`),
    join(config.dir, 'dist', `${config.name}.zip`),
  ]) {
    if (existsSync(path) && isFresh(path)) return path;
  }

  const fresh = [config.dir, join(config.dir, 'dist')]
    .filter((dir) => existsSync(dir))
    .flatMap((dir) =>
      readdirSync(dir)
        .filter((file) => file.endsWith('.zip'))
        .map((file) => join(dir, file)),
    )
    .map((path) => ({ path, mtimeMs: statSync(path).mtimeMs }))
    .filter(({ mtimeMs }) => mtimeMs >= startedAt)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (fresh.length > 0) return fresh[0].path;

  throw new Error(
    `"${config.zip.command}" ran, but no new zip turned up at ${config.name}.zip, ` +
      `dist/${config.name}.zip or any *.zip in the theme folder or dist/. ` +
      'Set zip.path in theme-qa.config.mjs to where the command writes it.',
  );
}

// Dotfiles (.github, .editorconfig, .gitignore, …) are repo plumbing, not
// theme files; release scripts conventionally drop them, so we do too.
function isRepoPlumbing(file) {
  return file.split('/').some((segment) => segment.startsWith('.'));
}

function zipTrackedFiles(config) {
  let listing;
  try {
    listing = execFileSync('git', ['ls-files', '-z'], { cwd: config.dir, encoding: 'utf8' });
  } catch {
    throw new Error(
      `${config.dir} isn't a git repository, so there's no list of files to zip. ` +
        'Set zip.command in theme-qa.config.mjs.',
    );
  }

  const entries = [];
  for (const file of listing.split('\0')) {
    if (!file || isRepoPlumbing(file)) continue;
    const abs = join(config.dir, file);
    // Tracked but deleted in the working tree: nothing to ship.
    if (!existsSync(abs) && !isSymlink(abs)) continue;
    const name = `${config.name}/${file}`;
    const stat = lstatSync(abs);
    if (stat.isSymbolicLink()) {
      entries.push({ name, data: Buffer.from(readlinkSync(abs)), mode: 0o120777 });
    } else if (stat.isFile()) {
      entries.push({ name, data: readFileSync(abs), mode: stat.mode & 0o777 });
    }
  }
  if (entries.length === 0) throw new Error(`git tracks no files in ${config.dir}.`);

  const outDir = join(config.dir, '.theme-qa');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `${config.name}.zip`);
  writeFileSync(outPath, createZip(entries));
  console.log(`\n── Zip: ${entries.length} tracked files -> ${outPath}`);
  return outPath;
}

function isSymlink(path) {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Builds a zip archive in memory. Timestamps are fixed so the same files
 * always give the same bytes.
 *
 * Exported for tests, which need zips with symlinks and other entries that are
 * awkward to produce with a zip binary.
 *
 * @param {{ name: string, data: Buffer, mode?: number }[]} entries `mode` is a
 *   Unix mode; pass `0o120777` for a symlink whose `data` is the link target.
 */
export function createZip(entries) {
  const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01, the zip epoch
  const UNIX_VERSION_MADE_BY = (3 << 8) | 20;
  const UTF8_FLAG = 0x0800;
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const { name, data, mode = 0o644 } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const isSymlinkEntry = (mode & 0o170000) === 0o120000;
    const fullMode = mode & 0o170000 ? mode : 0o100000 | mode;
    // Symlink targets must stay stored, matching what Info-ZIP writes.
    const method = isSymlinkEntry || data.length === 0 ? 0 : 8;
    const body = method === 8 ? deflateRawSync(data) : data;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(UTF8_FLAG, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(UNIX_VERSION_MADE_BY, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(UTF8_FLAG, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE((fullMode << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }

  const centralSize = centrals.reduce((sum, buf) => sum + buf.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, ...centrals, end]);
}
