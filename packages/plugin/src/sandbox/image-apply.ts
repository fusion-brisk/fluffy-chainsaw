/**
 * Shared image fetch-and-apply utility.
 *
 * Consolidates the pattern "normalize URL → fetch → figma.createImage → set fills"
 * that was duplicated across 8+ locations in the codebase.
 *
 * ES5-safe (sandbox code, compiled by Babel).
 */

import { Logger } from '../logger';

/** Timeout for image fetch operations (ms) */
const IMAGE_FETCH_TIMEOUT = 10000;

// === Timing instrumentation + URL → hash dedup cache ===
// Module-level state so the apply handler can aggregate totals without threading
// extra args through every call site. Cleared at the start of each apply.
let imageTimingTotalMs = 0;
let imageTimingCount = 0;
let imageTimingFailCount = 0;
let imageCacheHits = 0;

// Dedup cache: URL → pending-or-resolved Promise of Figma image hash.
// Promise (not raw hash) so concurrent callers racing on the same URL share one
// network request instead of each firing their own.
//
// Scope = single apply. Reset via resetImageCache() because Figma may GC images
// referenced only by deleted frames; persisting hashes across imports risks
// applying a stale hash that Figma no longer has bytes for.
const imageHashCache = new Map<string, Promise<string | null>>();

export function resetImageTiming(): void {
  imageTimingTotalMs = 0;
  imageTimingCount = 0;
  imageTimingFailCount = 0;
  imageCacheHits = 0;
}

export function resetImageCache(): void {
  imageHashCache.clear();
}

export interface ImageTimingSnapshot {
  totalMs: number;
  count: number;
  failCount: number;
  cacheHits: number;
}

export function getImageTiming(): ImageTimingSnapshot {
  return {
    totalMs: imageTimingTotalMs,
    count: imageTimingCount,
    failCount: imageTimingFailCount,
    cacheHits: imageCacheHits,
  };
}

/**
 * Race a promise against a timeout. Rejects with 'Timeout' if deadline exceeded.
 * ES5-safe (uses basic Promise).
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise(function (resolve, reject) {
    let done = false;
    const timer = setTimeout(function () {
      if (!done) {
        done = true;
        reject(new Error('Timeout after ' + ms + 'ms'));
      }
    }, ms);
    promise.then(
      function (val) {
        if (!done) {
          done = true;
          clearTimeout(timer);
          resolve(val);
        }
      },
      function (err) {
        if (!done) {
          done = true;
          clearTimeout(timer);
          reject(err);
        }
      },
    );
  });
}

/**
 * Normalize an image URL: handle protocol-relative URLs (//), validate protocol.
 * Returns null for empty, invalid, or unsupported URLs.
 */
export function normalizeImageUrl(url: string): string | null {
  if (!url || url.trim() === '') return null;

  let normalized = url;
  if (url.startsWith('//')) {
    normalized = 'https:' + url;
  }

  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    return null;
  }

  // NOTE: Do NOT use `new URL()` for validation here.
  // The Figma plugin sandbox VM rejects valid URLs through its URL constructor.
  // The startsWith check above is sufficient — fetch() validates at connect time.
  return normalized;
}

/** Apply an IMAGE fill with the given hash. Returns true on success. */
function applyImageHashToLayer(
  layer: SceneNode,
  hash: string,
  mode: 'FIT' | 'FILL' | 'CROP' | 'TILE',
  prefix: string,
): boolean {
  if ('fills' in layer) {
    (layer as GeometryMixin).fills = [{ type: 'IMAGE', scaleMode: mode, imageHash: hash }];
    return true;
  }
  try {
    (layer as unknown as GeometryMixin).fills = [
      { type: 'IMAGE', scaleMode: mode, imageHash: hash },
    ];
    return true;
  } catch (fillErr) {
    Logger.debug(
      prefix + ' fills failed: ' + (fillErr instanceof Error ? fillErr.message : String(fillErr)),
    );
    return false;
  }
}

/**
 * Fetch the given URL and return the Figma image hash. Deduplicates across
 * concurrent callers for the same URL (second caller awaits first caller's
 * promise). Returns null on failure.
 *
 * NOT exported — external callers should use `fetchAndApplyImage`.
 */
function fetchImageHashForUrl(
  normalizedUrl: string,
  prefix: string,
  proxyBaseUrl?: string,
): Promise<string | null> {
  const cached = imageHashCache.get(normalizedUrl);
  if (cached) {
    imageCacheHits += 1;
    return cached;
  }

  const promise = (async function () {
    let arrayBuffer: ArrayBuffer | null = null;

    // Direct fetch first
    try {
      const directRes = await withTimeout(fetch(normalizedUrl), IMAGE_FETCH_TIMEOUT);
      if (directRes.ok) {
        arrayBuffer = await directRes.arrayBuffer();
      } else {
        Logger.debug(prefix + ' Direct HTTP ' + directRes.status + ', trying proxy');
      }
    } catch {
      Logger.debug(prefix + ' Direct fetch failed, trying proxy');
    }

    // Fallback: relay image-proxy (CORS-blocked CDNs)
    if ((!arrayBuffer || arrayBuffer.byteLength === 0) && proxyBaseUrl) {
      try {
        const proxyUrl = proxyBaseUrl + '/image-proxy?url=' + encodeURIComponent(normalizedUrl);
        const proxyRes = await withTimeout(fetch(proxyUrl), IMAGE_FETCH_TIMEOUT);
        if (proxyRes.ok) {
          arrayBuffer = await proxyRes.arrayBuffer();
          Logger.debug(
            prefix + ' Proxy OK, ' + (arrayBuffer ? arrayBuffer.byteLength : 0) + ' bytes',
          );
        } else {
          Logger.debug(prefix + ' Proxy HTTP ' + proxyRes.status);
        }
      } catch (proxyErr) {
        Logger.debug(
          prefix +
            ' Proxy failed: ' +
            (proxyErr instanceof Error ? proxyErr.message : String(proxyErr)),
        );
      }
    }

    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      Logger.debug(prefix + ' No image data for ' + normalizedUrl.substring(0, 60));
      return null;
    }

    const image = figma.createImage(new Uint8Array(arrayBuffer));
    return image.hash;
  })();

  imageHashCache.set(normalizedUrl, promise);
  return promise;
}

/**
 * Fetch an image from URL and apply as IMAGE fill to a Figma layer.
 *
 * Handles:
 * - data: URIs (via figma.base64Decode)
 * - Protocol-relative URLs (//)
 * - URL validation
 * - fetch + figma.createImage + fills assignment
 * - Per-apply URL dedup cache (same URL = one network fetch, N fill applies)
 *
 * @param layer     Target Figma node (must support `fills`)
 * @param url       Image URL (http/https, //, or data: URI)
 * @param scaleMode IMAGE scaleMode — 'FIT' (default), 'FILL', 'CROP', 'TILE'
 * @param logPrefix Logging prefix for debug messages
 * @returns true on success, false on failure
 */
export async function fetchAndApplyImage(
  layer: SceneNode,
  url: string,
  scaleMode?: 'FIT' | 'FILL' | 'CROP' | 'TILE',
  logPrefix?: string,
  proxyBaseUrl?: string,
): Promise<boolean> {
  const mode = scaleMode || 'FIT';
  const prefix = logPrefix || '[fetchAndApplyImage]';

  if (!url || url.trim() === '') {
    Logger.debug(prefix + ' Empty URL, skip');
    return false;
  }

  const _timingStart = Date.now();
  let _timingSuccess = false;

  try {
    // Handle data: URIs — decoded locally, no network, no cache needed.
    if (url.startsWith('data:')) {
      const match = url.match(/^data:[^;]+;base64,(.+)$/);
      if (!match || !match[1]) {
        Logger.debug(prefix + ' Invalid data: URI');
        return false;
      }
      const bytes = figma.base64Decode(match[1]);
      const dataImage = figma.createImage(bytes);
      Logger.debug(prefix + ' data: URI decoded, hash=' + dataImage.hash.substring(0, 8));
      const ok = applyImageHashToLayer(layer, dataImage.hash, mode, prefix);
      if (ok) {
        Logger.debug(prefix + ' Applied data: URI image');
        _timingSuccess = true;
      }
      return ok;
    }

    // Normalize and validate URL
    const normalizedUrl = normalizeImageUrl(url);
    if (!normalizedUrl) {
      Logger.debug(prefix + ' Invalid URL: ' + url.substring(0, 60));
      return false;
    }

    const hash = await fetchImageHashForUrl(normalizedUrl, prefix, proxyBaseUrl);
    if (!hash) return false;

    const ok = applyImageHashToLayer(layer, hash, mode, prefix);
    if (ok) {
      Logger.debug(prefix + ' Image applied to "' + layer.name + '"');
      _timingSuccess = true;
    }
    return ok;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    Logger.debug(prefix + ' Error: ' + msg);
    return false;
  } finally {
    imageTimingTotalMs += Date.now() - _timingStart;
    imageTimingCount += 1;
    if (!_timingSuccess) imageTimingFailCount += 1;
  }
}
