import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureBinary } from '../scripts/pocketbase-binary.mjs';

export function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

export async function waitForHealth(url, { timeoutMs = 30000, intervalMs = 200, fetchImpl = fetch } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetchImpl(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`PocketBase did not become healthy at ${url} within ${timeoutMs}ms`);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}\n${stderr}`));
    });
  });
}

export async function startPocketBase({
  version,
  binaryPath,
  dataDir,
  email = 'admin@test.local',
  password = 'test-password-1234',
} = {}) {
  const binary = binaryPath ?? (await ensureBinary({ version }));
  const dir = dataDir ?? (await mkdtemp(join(tmpdir(), 'pocketbase-test-')));
  const port = await getFreePort();
  const url = `http://127.0.0.1:${port}`;

  await run(binary, ['superuser', 'upsert', email, password, `--dir=${dir}`]);

  const child = spawn(binary, ['serve', `--http=127.0.0.1:${port}`, `--dir=${dir}`], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  try {
    await waitForHealth(`${url}/api/health`);
  } catch (error) {
    child.kill('SIGKILL');
    throw new Error(`${error.message}\n${stderr}`);
  }

  async function stop() {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          child.kill('SIGKILL');
          resolve();
        }, 2000);
        child.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    if (!dataDir) await rm(dir, { recursive: true, force: true });
  }

  return { url, email, password, process: child, stop };
}
