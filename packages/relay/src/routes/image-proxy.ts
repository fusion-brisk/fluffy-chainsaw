import { Router } from 'express';
import type { Request, Response } from 'express';

const router = Router();

/** Allowlist: only proxy images from known Yandex CDN hosts. */
const ALLOWED_HOST_RE =
  /\.(yandex\.(ru|net|com)|yandex-team\.ru|yastatic\.net|avatars\.mds\.yandex\.net)$/;

function isAllowedUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    return ALLOWED_HOST_RE.test(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * GET /image-proxy?url=<encoded-url>
 *
 * Fetches an image from an external URL and forwards it to the Figma plugin.
 * Needed because Figma sandbox can't fetch URLs that lack CORS headers
 * (e.g. avatars.mds.yandex.net/get-inspire/).
 */
router.get('/image-proxy', async (req: Request, res: Response) => {
  const url = req.query.url as string;
  if (!url) {
    res.status(400).json({ error: 'Missing url parameter' });
    return;
  }

  if (!isAllowedUrl(url)) {
    res.status(403).json({ error: 'URL host not in allowlist' });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const upstream = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'image/*,*/*;q=0.8',
      },
    });

    if (!upstream.ok) {
      res.status(upstream.status).json({ error: `Upstream ${upstream.status}` });
      return;
    }

    const rawCT = upstream.headers.get('content-type') || '';
    const contentType = rawCT.startsWith('image/') ? rawCT : 'image/jpeg';
    const buffer = Buffer.from(await upstream.arrayBuffer());

    res.set({
      'Content-Type': contentType,
      'Content-Length': String(buffer.length),
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    });
    res.send(buffer);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[image-proxy] Failed to fetch ${url.substring(0, 80)}: ${msg}`);
    res.status(502).json({ error: msg });
  } finally {
    clearTimeout(timeout);
  }
});

export default router;
