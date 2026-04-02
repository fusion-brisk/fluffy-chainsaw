import { Router } from 'express';
import type { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { broadcast } from '../websocket';
import type { UpdateInfo } from '../types';
import { RELAY_VERSION } from '../version';

const router = Router();

const GITHUB_REPO = 'fusion-brisk/fluffy-chainsaw';
const UPDATE_CHECK_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours

let latestVersionCache: string | null = null;

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

const VERSIONS_URL =
  'https://raw.githubusercontent.com/fusion-brisk/fluffy-chainsaw/main/versions.json';

interface VersionsManifest {
  relay: { latest: string; minimum: string; downloadUrl: string };
  extension: { latest: string; minimum: string; downloadUrl: string };
}

interface GitHubRelease {
  tag_name: string;
  assets: Array<{ name: string; browser_download_url: string; size: number }>;
}

/** Fallback: fetch download URL from GitHub Releases API */
async function fetchDownloadUrlFromGitHub(version: string): Promise<UpdateInfo | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { 'User-Agent': 'contentify-relay' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;

    const release = (await res.json()) as GitHubRelease;
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
    const assetName = `contentify-relay-host-${arch}`;
    const asset = release.assets.find((a) => a.name === assetName);
    if (!asset) {
      console.log(`[update] No ${assetName} asset in release`);
      return null;
    }
    return { version, downloadUrl: asset.browser_download_url, size: asset.size };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[update] GitHub API fallback failed: ${msg}`);
    return null;
  }
}

/** Check for update: versions.json first (lightweight), GitHub API for download URL */
async function checkForUpdate(): Promise<UpdateInfo | null> {
  const currentVersion = RELAY_VERSION;

  // Step 1: Check versions.json — lightweight, no rate limit
  try {
    const res = await fetch(VERSIONS_URL, {
      headers: { 'User-Agent': 'contentify-relay' },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const manifest = (await res.json()) as VersionsManifest;
      const latestVersion = manifest.relay?.latest;
      if (latestVersion) {
        latestVersionCache = latestVersion;
        if (compareSemver(latestVersion, currentVersion) <= 0) {
          return null; // Up to date
        }
        // Step 2: Update available — get download URL from GitHub Releases
        console.log(
          `[update] New version available: ${latestVersion} (current: ${currentVersion})`,
        );
        return await fetchDownloadUrlFromGitHub(latestVersion);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[update] versions.json check failed: ${msg}, trying GitHub API`);
  }

  // Fallback: check GitHub Releases directly
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { 'User-Agent': 'contentify-relay' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;

    const release = (await res.json()) as GitHubRelease;
    const latestVersion = release.tag_name.replace(/^v/, '');
    latestVersionCache = latestVersion;

    if (compareSemver(latestVersion, currentVersion) <= 0) return null;

    console.log(`[update] New version available: ${latestVersion} (current: ${currentVersion})`);
    return await fetchDownloadUrlFromGitHub(latestVersion);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[update] Check failed: ${msg}`);
    return null;
  }
}

// Hardcoded relay binary path — never use process.execPath to avoid replacing system node
const RELAY_BINARY_PATH = path.join(process.env.HOME || '/tmp', '.contentify', 'relay-host');

/** Download new binary, replace current, and restart via launchctl */
async function downloadAndReplace(update: UpdateInfo): Promise<void> {
  const binaryPath = RELAY_BINARY_PATH;
  const backupPath = binaryPath + '.backup';
  const tempPath = binaryPath + '.new';

  console.log(`[update] Downloading v${update.version}...`);

  try {
    const res = await fetch(update.downloadUrl, {
      headers: { 'User-Agent': 'contentify-relay' },
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);

    const buffer = Buffer.from(await res.arrayBuffer());

    if (update.size && Math.abs(buffer.length - update.size) > 1024) {
      throw new Error(`Size mismatch: got ${buffer.length}, expected ${update.size}`);
    }

    await fs.writeFile(tempPath, buffer);
    await fs.chmod(tempPath, 0o755);

    try {
      await fs.unlink(backupPath);
    } catch {
      /* no backup yet */
    }
    await fs.rename(binaryPath, backupPath);
    await fs.rename(tempPath, binaryPath);

    console.log('[update] Binary replaced. Restarting...');

    // Also download latest CRX for local serving
    try {
      const crxUrl = `https://github.com/${GITHUB_REPO}/releases/latest/download/contentify.crx`;
      const crxRes = await fetch(crxUrl, {
        headers: { 'User-Agent': 'contentify-relay' },
        signal: AbortSignal.timeout(30000),
      });
      if (crxRes.ok) {
        const crxBuffer = Buffer.from(await crxRes.arrayBuffer());
        const crxPath = path.join(process.env.HOME || '/tmp', '.contentify', 'contentify.crx');
        await fs.writeFile(crxPath, crxBuffer);
        console.log(`[update] CRX cached: ${(crxBuffer.length / 1024).toFixed(0)}KB`);
      }
    } catch (crxErr) {
      console.log('[update] CRX cache failed:', crxErr instanceof Error ? crxErr.message : crxErr);
    }

    broadcast({ type: 'relay-updating', newVersion: update.version, timestamp: Date.now() });

    setTimeout(() => {
      const { execSync } = require('child_process') as typeof import('child_process');

      // Strategy 1: launchctl kickstart (started via LaunchAgent plist)
      try {
        execSync('launchctl kickstart -k gui/$(id -u)/com.contentify.relay', {
          stdio: 'ignore',
          timeout: 5000,
        });
        return;
      } catch {
        console.log('[update] launchctl kickstart failed, trying stop/start...');
      }

      // Strategy 2: launchctl stop + start
      try {
        execSync('launchctl stop com.contentify.relay', { stdio: 'ignore', timeout: 3000 });
        execSync('launchctl start com.contentify.relay', { stdio: 'ignore', timeout: 3000 });
        return;
      } catch {
        console.log('[update] launchctl stop/start failed');
      }

      // Strategy 3: exit 0 — KeepAlive in plist or process supervisor will restart
      console.log('[update] Exiting for KeepAlive restart...');
      process.exit(0);
    }, 2000);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[update] Failed: ${msg}`);
    try {
      await fs.unlink(tempPath);
    } catch {
      /* cleanup */
    }
  }
}

/** Run update check and apply if available */
async function runUpdateCheck(): Promise<void> {
  const update = await checkForUpdate();
  if (update) {
    await downloadAndReplace(update);
  }
}

/** GET /version */
router.get('/version', (_req: Request, res: Response) => {
  const currentVersion = RELAY_VERSION;
  res.json({
    version: currentVersion,
    latest: latestVersionCache,
    updateAvailable: latestVersionCache
      ? compareSemver(latestVersionCache, currentVersion) > 0
      : null,
  });
});

/** POST /update */
router.post('/update', async (_req: Request, res: Response) => {
  const update = await checkForUpdate();
  if (update) {
    res.json({ updateAvailable: true, version: update.version });
    downloadAndReplace(update);
  } else {
    res.json({ updateAvailable: false, version: RELAY_VERSION, latest: latestVersionCache });
  }
});

/** GET /extension.crx — serve cached CRX for local download */
router.get('/extension.crx', async (_req: Request, res: Response) => {
  const crxPath = path.join(process.env.HOME || '/tmp', '.contentify', 'contentify.crx');
  try {
    const stat = await fs.stat(crxPath);
    res.set('Content-Type', 'application/x-chrome-extension');
    res.set('Content-Disposition', 'attachment; filename="contentify.crx"');
    res.set('Content-Length', String(stat.size));
    const data = await fs.readFile(crxPath);
    res.send(data);
  } catch {
    res.status(404).json({
      error: 'CRX not cached. Will be available after next relay update.',
      downloadUrl: `https://github.com/${GITHUB_REPO}/releases/latest/download/contentify.crx`,
    });
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
