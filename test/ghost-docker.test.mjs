import { test } from 'node:test';
import assert from 'node:assert/strict';
import { containerName, runArgs } from '../src/ghost/docker.mjs';

const config = { name: 'pod', ghost: { image: 'ghost', version: '6-alpine', port: 2399 } };

test('Ghost listens on loopback only and starts from an empty database', () => {
  const args = runArgs(config);
  assert.equal(args[args.indexOf('--publish') + 1], '127.0.0.1:2399:2368');
  // No bind mounts: content from an earlier run must never leak in.
  assert.equal(args.includes('--volume') || args.includes('-v'), false);
  assert.equal(args.at(-1), 'ghost:6-alpine');
  assert.equal(args[args.indexOf('--name') + 1], containerName(config));
});

test('Ghost is told its public URL, matching the published port', () => {
  const env = runArgs({ ...config, ghost: { ...config.ghost, port: 2400 } }).filter((a) =>
    a.startsWith('url='),
  );
  assert.deepEqual(env, ['url=http://localhost:2400']);
});
