import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLATFORMS = { linux: 'linux', darwin: 'darwin', win32: 'windows' };
const ARCHES = { x64: 'amd64', arm64: 'arm64' };

const LATEST_RELEASE_URL = 'https://api.github.com/repos/pocketbase/pocketbase/releases/latest';
const VERSION_DIR_PATTERN = /^\d+\.\d+\.\d+$/;

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

function parseReleaseTag(tag) {
  const version = typeof tag === 'string' ? tag.replace(/^v/, '') : '';
  if (!VERSION_DIR_PATTERN.test(version)) throw new Error(`Unexpected latest release tag: ${tag}`);
  return version;
}

async function fetchLatestVersion(fetchImpl) {
  const response = await fetchImpl(LATEST_RELEASE_URL, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'pocketbase-mcp' },
  });
  if (!response.ok) throw new Error(`Failed to resolve latest PocketBase release: HTTP ${response.status}`);
  return parseReleaseTag((await response.json()).tag_name);
}

let latestVersionPromise;

export function resolveLatestVersion(fetchImpl = fetch) {
  if (fetchImpl !== fetch) return fetchLatestVersion(fetchImpl);
  latestVersionPromise ??= fetchLatestVersion(fetchImpl);
  return latestVersionPromise;
}

async function resolveCachedVersion(cacheRoot) {
  const entries = await readdir(cacheRoot, { withFileTypes: true }).catch(() => []);
  const versions = entries
    .filter((entry) => entry.isDirectory() && VERSION_DIR_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return versions.at(-1);
}

async function resolveVersion(fetchImpl, cacheRoot) {
  try {
    return await resolveLatestVersion(fetchImpl);
  } catch (error) {
    const cached = await resolveCachedVersion(cacheRoot);
    if (!cached) throw new Error(`${error.message}\nNo cached PocketBase version found in ${cacheRoot}`);
    return cached;
  }
}

export function resolveAssetName(version, platform, arch) {
  const os = PLATFORMS[platform];
  if (!os) throw new Error(`Unsupported platform: ${platform}`);
  const cpu = ARCHES[arch];
  if (!cpu) throw new Error(`Unsupported architecture: ${arch}`);
  return `pocketbase_${version}_${os}_${cpu}.zip`;
}

function binaryName(platform) {
  return platform === 'win32' ? 'pocketbase.exe' : 'pocketbase';
}

export function cachePathFor({ cacheRoot, version, platform, arch }) {
  return join(cacheRoot, version, `${platform}_${arch}`, binaryName(platform));
}

export function downloadUrl(version, asset) {
  return `https://github.com/pocketbase/pocketbase/releases/download/v${version}/${asset}`;
}

function checksumsUrl(version) {
  return `https://github.com/pocketbase/pocketbase/releases/download/v${version}/checksums.txt`;
}

export function parseChecksums(text) {
  const checksums = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = /^([0-9a-f]{64})\s+(\S+)$/.exec(line.trim());
    if (match) checksums.set(match[2], match[1]);
  }
  return checksums;
}

function defaultCacheRoot() {
  return join(repoRoot, '.cache', 'pocketbase');
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

function extractionCommands(zipPath, destDir, platform) {
  if (platform === 'win32') {
    return [
      ['tar', ['-xf', zipPath, '-C', destDir]],
      ['powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destDir}' -Force`]],
    ];
  }
  return [
    ['unzip', ['-o', zipPath, '-d', destDir]],
    ['tar', ['-xf', zipPath, '-C', destDir]],
  ];
}

async function extractZip(zipPath, destDir, platform) {
  await mkdir(destDir, { recursive: true });
  let lastError;
  for (const [command, args] of extractionCommands(zipPath, destDir, platform)) {
    try {
      await run(command, args);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Failed to extract ${zipPath}: ${lastError?.message}`);
}

async function downloadAsset(fetchImpl, asset, version) {
  const response = await fetchImpl(downloadUrl(version, asset));
  if (!response.ok) throw new Error(`Failed to download ${asset}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function fetchExpectedChecksum(fetchImpl, version, asset) {
  const response = await fetchImpl(checksumsUrl(version));
  if (!response.ok) throw new Error(`Failed to download checksums.txt: HTTP ${response.status}`);
  const expected = parseChecksums(await response.text()).get(asset);
  if (!expected) throw new Error(`No published checksum for ${asset}`);
  return expected;
}

function verifyChecksum(zipBuffer, expected, asset) {
  const actual = createHash('sha256').update(zipBuffer).digest('hex');
  if (actual !== expected) {
    throw new Error(`Checksum mismatch for ${asset}: expected ${expected}, got ${actual}`);
  }
}

async function writeAndExtract(target, zipBuffer, platform) {
  const zipPath = `${target}.zip`;
  await writeFile(zipPath, zipBuffer);
  await extractZip(zipPath, dirname(target), platform);
  await rm(zipPath, { force: true });
  if (platform !== 'win32') await chmod(target, 0o755);
}

export async function ensureBinary({
  version,
  platform = process.platform,
  arch = process.arch,
  cacheRoot = defaultCacheRoot(),
  fetchImpl = fetch,
} = {}) {
  const resolved = version ?? (await resolveVersion(fetchImpl, cacheRoot));
  const target = cachePathFor({ cacheRoot, version: resolved, platform, arch });
  try {
    await stat(target);
    return target;
  } catch {}

  const asset = resolveAssetName(resolved, platform, arch);
  const zipBuffer = await downloadAsset(fetchImpl, asset, resolved);
  const expected = await fetchExpectedChecksum(fetchImpl, resolved, asset);
  verifyChecksum(zipBuffer, expected, asset);

  await mkdir(dirname(target), { recursive: true });
  await writeAndExtract(target, zipBuffer, platform);
  return target;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const binary = await ensureBinary();
  console.log(binary);
}
