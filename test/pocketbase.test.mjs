import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { join } from 'node:path';
import {
  cachePathFor,
  downloadUrl,
  parseChecksums,
  resolveAssetName,
} from '../scripts/pocketbase-binary.mjs';
import { getFreePort, waitForHealth } from './pocketbase.mjs';

test('resolveAssetName maps platform and arch to release asset names', () => {
  assert.equal(resolveAssetName('0.40.4', 'linux', 'x64'), 'pocketbase_0.40.4_linux_amd64.zip');
  assert.equal(resolveAssetName('0.40.4', 'darwin', 'arm64'), 'pocketbase_0.40.4_darwin_arm64.zip');
  assert.equal(resolveAssetName('0.40.4', 'win32', 'x64'), 'pocketbase_0.40.4_windows_amd64.zip');
});

test('resolveAssetName rejects unsupported platform and arch', () => {
  assert.throws(() => resolveAssetName('0.40.4', 'sunos', 'x64'), /Unsupported platform/);
  assert.throws(() => resolveAssetName('0.40.4', 'linux', 'ia32'), /Unsupported architecture/);
});

test('parseChecksums parses sha256 lines and ignores noise', () => {
  const hash = 'a'.repeat(64);
  const other = 'b'.repeat(64);
  const text = `\n# comment\n${hash}  pocketbase_0.40.4_linux_amd64.zip\r\nnot a checksum line\n${other}  other.zip\n`;
  const checksums = parseChecksums(text);
  assert.equal(checksums.get('pocketbase_0.40.4_linux_amd64.zip'), hash);
  assert.equal(checksums.get('other.zip'), other);
  assert.equal(checksums.size, 2);
});

test('cachePathFor stores each platform and arch build under the version', () => {
  assert.equal(
    cachePathFor({ cacheRoot: '/tmp/cache', version: '0.40.4', platform: 'linux', arch: 'x64' }),
    join('/tmp/cache', '0.40.4', 'linux_x64', 'pocketbase'),
  );
  assert.equal(
    cachePathFor({ cacheRoot: '/tmp/cache', version: '0.40.4', platform: 'win32', arch: 'x64' }),
    join('/tmp/cache', '0.40.4', 'win32_x64', 'pocketbase.exe'),
  );
});

test('downloadUrl points at the GitHub release asset', () => {
  assert.equal(
    downloadUrl('0.40.4', 'pocketbase_0.40.4_linux_amd64.zip'),
    'https://github.com/pocketbase/pocketbase/releases/download/v0.40.4/pocketbase_0.40.4_linux_amd64.zip',
  );
});

test('getFreePort returns a port that can be bound', async () => {
  const port = await getFreePort();
  assert.ok(Number.isInteger(port) && port > 0 && port < 65536);
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  await new Promise((resolve) => server.close(resolve));
});

test('waitForHealth resolves once the endpoint responds ok', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return { ok: calls >= 2 };
  };
  await waitForHealth('http://127.0.0.1:1/api/health', { fetchImpl, timeoutMs: 500, intervalMs: 5 });
  assert.equal(calls, 2);
});

test('waitForHealth rejects with the url after timeout', async () => {
  const fetchImpl = async () => {
    throw new Error('ECONNREFUSED');
  };
  await assert.rejects(
    waitForHealth('http://127.0.0.1:1/api/health', { fetchImpl, timeoutMs: 30, intervalMs: 5 }),
    /http:\/\/127\.0\.0\.1:1\/api\/health/,
  );
});
