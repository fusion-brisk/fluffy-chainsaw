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

/**
 * Fetch an image from URL and apply as IMAGE fill to a Figma layer.
 *
 * Handles:
 * - data: URIs (via figma.base64Decode)
 * - Protocol-relative URLs (//)
 * - URL validation
 * - fetch + figma.createImage + fills assignment
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
): Promise<boolean> {
  const mode = scaleMode || 'FIT';
  const prefix = logPrefix || '[fetchAndApplyImage]';

  if (!url || url.trim() === '') {
    Logger.debug(prefix + ' Empty URL, skip');
    return false;
  }

  try {
    // Handle data: URIs (base64-encoded images)
    if (url.startsWith('data:')) {
      const match = url.match(/^data:[^;]+;base64,(.+)$/);
      if (match && match[1]) {
        const bytes = figma.base64Decode(match[1]);
        const dataImage = figma.createImage(bytes);
        Logger.debug(prefix + ' data: URI decoded, hash=' + dataImage.hash.substring(0, 8));
        if ('fills' in layer) {
          (layer as GeometryMixin).fills = [
            {
              type: 'IMAGE',
              scaleMode: mode,
              imageHash: dataImage.hash,
            },
          ];
        } else {
          try {
            (layer as unknown as GeometryMixin).fills = [
              {
                type: 'IMAGE',
                scaleMode: mode,
                imageHash: dataImage.hash,
              },
            ];
          } catch (fillErr) {
            Logger.debug(
              prefix +
                ' fills failed: ' +
                (fillErr instanceof Error ? fillErr.message : String(fillErr)),
            );
            return false;
          }
        }
        Logger.debug(prefix + ' Applied data: URI image');
        return true;
      }
      Logger.debug(prefix + ' Invalid data: URI');
      return false;
    }

    // Normalize and validate URL
    const normalizedUrl = normalizeImageUrl(url);
    if (!normalizedUrl) {
      Logger.debug(prefix + ' Invalid URL: ' + url.substring(0, 60));
      return false;
    }

    // Fetch image (with timeout to prevent pipeline stalls)
    const response = await withTimeout(fetch(normalizedUrl), IMAGE_FETCH_TIMEOUT);
    if (!response.ok) {
      Logger.debug(prefix + ' HTTP ' + response.status + ' for ' + normalizedUrl.substring(0, 60));
      return false;
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength === 0) {
      Logger.debug(prefix + ' Empty response for ' + normalizedUrl.substring(0, 60));
      return false;
    }

    const uint8Array = new Uint8Array(arrayBuffer);
    const image = figma.createImage(uint8Array);

    // Apply fills — try guard first, fallback to cast
    if ('fills' in layer) {
      (layer as GeometryMixin).fills = [
        {
          type: 'IMAGE',
          scaleMode: mode,
          imageHash: image.hash,
        },
      ];
    } else {
      try {
        (layer as unknown as GeometryMixin).fills = [
          {
            type: 'IMAGE',
            scaleMode: mode,
            imageHash: image.hash,
          },
        ];
      } catch (fillErr) {
        Logger.debug(
          prefix +
            ' fills failed: ' +
            (fillErr instanceof Error ? fillErr.message : String(fillErr)),
        );
        return false;
      }
    }
    Logger.debug(prefix + ' Image applied to "' + layer.name + '"');
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    Logger.debug(prefix + ' Error: ' + msg);
    return false;
  }
}
