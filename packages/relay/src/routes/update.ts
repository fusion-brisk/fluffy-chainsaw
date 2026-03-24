import { Router } from 'express';
import type { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { broadcast } from '../websocket';
import type { UpdateInfo } from '../types';

const router = Router();

const GITHUB_REPO = 'fusion-brisk/fluffy-chainsaw';
const UPDATE_CHECK_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours

let latestVersionCache: string | null = null;

function getPkgVersion(): string {
  const pkg = require('../../package.json') as { version: string };
  return pkg.version;
}

/** Compare semver strings: returns 1 if a > b, -1 if a < b, 0 if equal */
function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

interface GitHubRelease {
  tag_name: string;
  assets: Array<{ name: string; browser_download_url: string; size: number }>;
}

/** Check GitHub Releases for a newer relay version */
async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      { headers: { 'User-Agent': 'contentify-relay' }, signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return null;

    const release = (await res.json()) as GitHubRelease;
    const latestTag = release.tag_name;
    const latestVersion = latestTag.replace(/^v/, '');
    latestVersionCache = latestVersion;

    const currentVersion = getPkgVersion();
    if (compareSemver(latestVersion, currentVersion) > 0) {
      const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
      const assetName = `contentify-relay-host-${arch}`;
      const asset = release.assets.find(a => a.name === assetName);
      if (!asset) {
        console.log(`[update] New version ${latestVersion} found, but no ${assetName} asset`);
        return null;
      }
      return { version: latestVersion, downloadUrl: asset.browser_download_url, size: asset.size };
    }
    return null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[update] Check failed: ${msg}`);
    return null;
  }
}

// Hardcoded relay binary path — never use process.execPath to avoid replacing system node
const RELAY_BINARY_PATH = path.join(
  process.env.HOME || '/tmp',
  '.contentify',
  'relay-host'
);

/** Download new binary, replace current, and restart via launchctl */
async function downloadAndReplace(update: UpdateInfo): Promise<void> {
  const binaryPath = RELAY_BINARY_PATH;
  const backupPath = binaryPath + '.backup';
  const tempPath = binaryPath + '.new';

  console.log(`[update] Downloading v${update.version}...`);

  try {
    const res = await fetch(update.downloadUrl, {
      headers: { 'User-Agent': 'contentify-relay' },
      signal: AbortSignal.timeout(60000)
    });
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);

    const buffer = Buffer.from(await res.arrayBuffer());

    if (update.size && Math.abs(buffer.length - update.size) > 1024) {
      throw new Error(`Size mismatch: got ${buffer.length}, expected ${update.size}`);
    }

    await fs.writeFile(tempPath, buffer);
    await fs.chmod(tempPath, 0o755);

    try { await fs.unlink(backupPath); } catch { /* no backup yet */ }
    await fs.rename(binaryPath, backupPath);
    await fs.rename(tempPath, binaryPath);

    console.log('[update] Binary replaced. Restarting...');

    broadcast({ type: 'relay-updating', newVersion: update.version, timestamp: Date.now() });

    setTimeout(() => {
      const { execSync } = require('child_process') as typeof import('child_process');
      try {
        execSync('launchctl kickstart -k gui/$(id -u)/com.contentify.relay', { stdio: 'ignore' });
      } catch {
        console.log('[update] launchctl failed, exiting for KeepAlive restart');
        process.exit(0);
      }
    }, 2000);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[update] Failed: ${msg}`);
    try { await fs.unlink(tempPath); } catch { /* cleanup */ }
  }
}

/** Run update check and apply if available */
async function runUpdateCheck(): Promise<void> {
  const update = await checkForUpdate();
  if (update) {
    console.log(`[update] New version available: ${update.version} (current: ${getPkgVersion()})`);
    await downloadAndReplace(update);
  }
}

/** GET /version */
router.get('/version', (_req: Request, res: Response) => {
  const currentVersion = getPkgVersion();
  res.json({
    version: currentVersion,
    latest: latestVersionCache,
    updateAvailable: latestVersionCache ? compareSemver(latestVersionCache, currentVersion) > 0 : null
  });
});

/** POST /update */
router.post('/update', async (_req: Request, res: Response) => {
  const update = await checkForUpdate();
  if (update) {
    res.json({ updateAvailable: true, version: update.version });
    downloadAndReplace(update);
  } else {
    res.json({ updateAvailable: false, version: getPkgVersion(), latest: latestVersionCache });
  }
});

/** Start periodic update checks */
export function startUpdateSchedule(): void {
  setTimeout(() => {
    runUpdateCheck();
    setInterval(runUpdateCheck, UPDATE_CHECK_INTERVAL);
  }, 30000);
}

export default router;
