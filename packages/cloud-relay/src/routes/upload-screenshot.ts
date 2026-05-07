/**
 * POST /upload-screenshot — extension uploads a single JPEG screenshot
 * segment to Yandex Object Storage and gets back a key + public URL.
 *
 * Body shape (JSON):
 *   {
 *     "segIdx": number,        // 0-based segment index (for ordering)
 *     "dataBase64": string,    // base64 of JPEG bytes (no data: prefix)
 *     "contentType"?: string,  // default "image/jpeg"
 *     "totalSegments"?: number // optional, just for logging
 *   }
 *
 * Response: { key, url }
 *
 * Why base64-JSON instead of multipart/form-data:
 *   - Yandex API Gateway forwards bodies via the YC Function event with
 *     `isBase64Encoded` flag. Multipart parsing inside the function would
 *     require an extra dependency. JSON+base64 keeps the contract uniform
 *     with the rest of /push, /peek.
 *   - Per-segment payload (~100-300 KB after base64) sits well below the
 *     3.5 MB gateway cap. The full feed (often 5-10 segments) gets uploaded
 *     in series by the extension.
 */

import type { Route } from '../types';
import { uploadScreenshotSegment } from '../object-storage';
import { parseBody } from './_util';

const MAX_SEGMENT_BYTES = 4 * 1024 * 1024; // raw JPEG limit; base64 can be larger
const MAX_PER_KIND = {
  segment: 30, // viewport scroll segments
  advert: 50, // per-advert clipped creatives
} as const;

type UploadKind = keyof typeof MAX_PER_KIND;

interface UploadBody {
  segIdx?: number;
  dataBase64?: string;
  contentType?: string;
  totalSegments?: number;
  /**
   * Discriminates upload purpose. `segment` (default) — full-viewport
   * screenshot row used for SERP/feed fidelity. `advert` — per-advert
   * clip extracted from those segments by background.ts when the RTB
   * iframe leaves no readable <img> in the DOM.
   */
  kind?: UploadKind;
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isUploadKind(value: unknown): value is UploadKind {
  return value === 'segment' || value === 'advert';
}

export const uploadScreenshot: Route = async (event, sessionId) => {
  const body = parseBody<UploadBody>(event);
  if (!body) {
    return { statusCode: 400, body: { error: 'Missing or invalid JSON body' } };
  }
  const kind: UploadKind = isUploadKind(body.kind) ? body.kind : 'segment';
  const maxIdx = MAX_PER_KIND[kind];
  if (!isInteger(body.segIdx) || body.segIdx >= maxIdx) {
    return {
      statusCode: 400,
      body: { error: `segIdx must be a non-negative integer below ${maxIdx} for kind=${kind}` },
    };
  }
  if (typeof body.dataBase64 !== 'string' || body.dataBase64.length === 0) {
    return { statusCode: 400, body: { error: 'dataBase64 must be a non-empty string' } };
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(body.dataBase64, 'base64');
  } catch {
    return { statusCode: 400, body: { error: 'dataBase64 is not valid base64' } };
  }
  if (bytes.length === 0) {
    return { statusCode: 400, body: { error: 'Decoded payload is empty' } };
  }
  if (bytes.length > MAX_SEGMENT_BYTES) {
    return {
      statusCode: 413,
      body: {
        error: 'Segment too large',
        maxBytes: MAX_SEGMENT_BYTES,
        actualBytes: bytes.length,
      },
    };
  }

  const contentType =
    typeof body.contentType === 'string' && /^image\/(jpe?g|png|webp)$/.test(body.contentType)
      ? body.contentType
      : 'image/jpeg';

  // Key format: <sessionId>/<timestamp>-[<kind>-]<segIdx>.<ext>
  // Timestamp lets multiple imports in the same session coexist for inspection
  // until the bucket lifecycle policy expires them.
  // Kind is omitted for the default `segment` to keep existing keys stable.
  const ext = contentType.split('/')[1].replace('jpeg', 'jpg');
  const kindPrefix = kind === 'segment' ? '' : `${kind}-`;
  const key = `${sessionId}/${Date.now()}-${kindPrefix}${String(body.segIdx).padStart(2, '0')}.${ext}`;

  try {
    const result = await uploadScreenshotSegment(key, bytes, contentType);
    return {
      statusCode: 200,
      body: { key: result.key, url: result.url },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[upload-screenshot] failed:', message);
    return {
      statusCode: 502,
      body: { error: 'Upload to object storage failed', detail: message },
    };
  }
};
