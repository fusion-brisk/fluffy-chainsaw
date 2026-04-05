import { Router } from 'express';
import type { Request, Response } from 'express';

const router = Router();

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

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const upstream = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Mimic browser request
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'image/*,*/*;q=0.8',
      },
    });
    clearTimeout(timeout);

    if (!upstream.ok) {
      res.status(upstream.status).json({ error: `Upstream ${upstream.status}` });
      return;
    }

    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
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
  }
});

export default router;
