/**
 * GET /image-proxy?url=<encoded-url>
 *
 * CORS proxy for image fetches initiated by the Figma plugin sandbox.
 * Figma plugin iframes have a strict same-origin policy on `fetch`, and
 * the `figma.createImage(bytes)` API takes raw bytes — there's no native
 * way to ask Figma to fetch a cross-origin URL. The plugin's image
 * applicator therefore tries direct fetch first, then falls back to this
 * route when the CDN doesn't return CORS headers (which is the case for
 * `avatars.mds.yandex.net` and most Yandex content CDNs).
 *
 * Contract:
 *   - `url` query param required, must be http/https
 *   - response is the raw image bytes with the upstream Content-Type
 *     (proxied as base64 since YC Function HTTP responses are string-only)
 *   - cache-control 1 hour to keep S3 traffic and bandwidth low
 *
 * Security: only http/https are allowed (no file://, data:, etc.). Body
 * size capped at 10 MB.
 */

import type { Route } from '../types';

const MAX_BYTES = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;

export const imageProxy: Route = async (event) => {
  const url = event.queryStringParameters?.url;
  if (!url) {
    return { statusCode: 400, body: { error: 'Missing url query param' } };
  }
  if (!/^https?:\/\//i.test(url)) {
    return { statusCode: 400, body: { error: 'Only http/https URLs allowed' } };
  }

  let upstreamRes: Response;
  try {
    const ctl = new AbortController();
    const tid = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
    try {
      upstreamRes = await fetch(url, { signal: ctl.signal });
    } finally {
      clearTimeout(tid);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { statusCode: 502, body: { error: 'Upstream fetch failed', detail: msg } };
  }

  if (!upstreamRes.ok) {
    return {
      statusCode: 502,
      body: { error: 'Upstream returned non-2xx', status: upstreamRes.status },
    };
  }

  // Streaming would be ideal but YC Function responses are buffered anyway,
  // and the body is small. Read into a Buffer once.
  const arrayBuffer = await upstreamRes.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_BYTES) {
    return {
      statusCode: 413,
      body: { error: 'Image too large', maxBytes: MAX_BYTES, actualBytes: arrayBuffer.byteLength },
    };
  }
  const buffer = Buffer.from(arrayBuffer);
  const contentType = upstreamRes.headers.get('content-type') || 'application/octet-stream';

  return {
    statusCode: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
    },
    body: buffer.toString('base64'),
    isBase64Encoded: true,
  };
};
