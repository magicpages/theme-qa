// Ghost container lifecycle through the `docker` CLI.
//
// No host bind mounts on purpose: every run starts from an empty SQLite
// database inside the container, so test content never leaks between runs.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export const CONTAINER_PORT = 2368;
const READY_TIMEOUT_MS = 180_000;

/** @param {{ name: string }} config */
export function containerName(config) {
  return `theme-qa-${config.name}`;
}

/** @param {{ ghost: { port: number } }} config */
export function ghostUrl(config) {
  return `http://localhost:${config.ghost.port}`;
}

async function docker(args) {
  try {
    const { stdout } = await exec('docker', args, { maxBuffer: 16 * 1024 * 1024 });
    return stdout.trim();
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error('Docker not found. Install Docker and make sure `docker` is on your PATH.');
    }
    const detail = (error.stderr || error.message).trim();
    throw new Error(`docker ${args[0]} failed: ${detail}`);
  }
}

/** Removes the container and its anonymous volumes. Missing container is fine. */
export async function removeContainer(name) {
  try {
    await exec('docker', ['rm', '--force', '--volumes', name]);
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('Docker not found.');
    if (!/No such container/i.test(error.stderr ?? '')) {
      throw new Error(`docker rm failed: ${(error.stderr || error.message).trim()}`);
    }
  }
}

export async function containerLogs(name, lines = 60) {
  try {
    const { stdout, stderr } = await exec('docker', ['logs', '--tail', String(lines), name], {
      maxBuffer: 16 * 1024 * 1024,
    });
    return `${stdout}${stderr}`.trim();
  } catch (error) {
    return `(no logs: ${(error.stderr || error.message).trim()})`;
  }
}

async function containerState(name) {
  try {
    return await docker(['inspect', '--format', '{{.State.Status}}', name]);
  } catch {
    return 'missing';
  }
}

/**
 * @param {{ name: string, ghost: { image: string, version: string, port: number } }} config
 * @returns {string[]} arguments for `docker run`
 */
export function runArgs(config) {
  const url = ghostUrl(config);
  const env = {
    // Production caches compiled templates like a live site does. Development
    // re-reads every partial on each request, and concurrent requests then
    // sometimes render Ghost's built-in partial (e.g. navigation) instead of
    // the theme's override.
    NODE_ENV: 'production',
    database__client: 'sqlite3',
    database__connection__filename: '/var/lib/ghost/content/data/ghost.db',
    url,
    mail__transport: 'Direct',
    security__staffDeviceVerification: 'false',
  };
  return [
    'run',
    '--detach',
    '--name',
    containerName(config),
    '--label',
    'theme-qa=1',
    // Loopback only: the owner password is a published constant.
    '--publish',
    `127.0.0.1:${config.ghost.port}:${CONTAINER_PORT}`,
    ...Object.entries(env).flatMap(([key, value]) => ['--env', `${key}=${value}`]),
    `${config.ghost.image}:${config.ghost.version}`,
  ];
}

/**
 * Polls the Admin API site endpoint until Ghost has finished booting.
 * @param {string} url
 * @param {string} name container name, for state checks and logs
 */
export async function waitForGhost(url, name, timeoutMs = READY_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'no response yet';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/ghost/api/admin/site/`, {
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error.cause?.code ?? error.message;
    }
    const state = await containerState(name);
    if (state !== 'running') {
      throw new Error(
        `Ghost container ${name} is ${state}. Last log lines:\n${await containerLogs(name)}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(
    `Ghost did not answer at ${url} within ${timeoutMs / 1000}s (${lastError}). ` +
      `Last log lines:\n${await containerLogs(name)}`,
  );
}

export async function startContainer(config) {
  const name = containerName(config);
  await removeContainer(name);
  await docker(runArgs(config));
  const url = ghostUrl(config);
  await waitForGhost(url, name);
  return { url, name };
}
