import { Router } from 'express';
import type { Request, Response } from 'express';

const router = Router();

const VERSIONS_URL =
  'https://raw.githubusercontent.com/fusion-brisk/fluffy-chainsaw/main/versions.json';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

let cachedVersions: unknown = null;
let lastFetchTime = 0;

async function fetchVersions(): Promise<unknown> {
  const now = Date.now();
  if (cachedVersions && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedVersions;
  }

  try {
    const res = await fetch(VERSIONS_URL, {
      headers: { 'User-Agent': 'contentify-relay' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return cachedVersions;
    cachedVersions = await res.json();
    lastFetchTime = now;
    return cachedVersions;
  } catch {
    return cachedVersions;
  }
}

/** GET /versions — proxy cached versions.json for plugin */
router.get('/versions', async (_req: Request, res: Response) => {
  const versions = await fetchVersions();
  if (versions) {
    res.json(versions);
  } else {
    res.status(503).json({ error: 'Version data unavailable' });
  }
});

export default router;
