/**
 * POST /push — extension publishes a queue entry OR a heads-up signal.
 *
 * Discriminator: `body.kind === 'heads-up'` routes to UPSERT into
 * `session_heads_up` (lightweight progress signal). Otherwise the existing
 * payload path runs unchanged.
 *
 * The heads-up branch is fire-and-forget from the extension's perspective —
 * it returns 204 No Content even on validation success, no entryId.
 */

import type { HeadsUpPhase, QueueEntry, QueueEntryMeta, QueueEntryPayload, Route } from '../types';
import { getStatus, insertEntry, upsertHeadsUp } from '../ydb';
import { parseBody } from './_util';

const MAX_DATA_PAYLOAD_SIZE = 5 * 1024 * 1024;
const ENTRY_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_HEADS_UP_MESSAGE_LEN = 500;
const MAX_SCREENSHOT_KEYS = 30;
const MAX_SCREENSHOT_URL_LEN = 1024;

const HEADS_UP_PHASES: ReadonlyArray<HeadsUpPhase> = [
  'parsing',
  'uploading_json',
  'uploading_screenshots',
  'finalizing',
  'error',
];

interface PushBody {
  payload?: QueueEntryPayload;
  meta?: QueueEntryMeta;
  kind?: 'heads-up';
  phase?: HeadsUpPhase;
  current?: number;
  total?: number;
  message?: string;
}

function generateEntryId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function measureDataSize(payload: QueueEntryPayload): number {
  let size = 0;
  if (payload.feedCards) size += JSON.stringify(payload.feedCards).length;
  if (payload.rawRows) size += JSON.stringify(payload.rawRows).length;
  if (payload.wizards) size += JSON.stringify(payload.wizards).length;
  if (payload.productCard) size += JSON.stringify(payload.productCard).length;
  return size;
}

function isHeadsUpPhase(value: unknown): value is HeadsUpPhase {
  return typeof value === 'string' && (HEADS_UP_PHASES as ReadonlyArray<string>).includes(value);
}

/**
 * Validate optional screenshot fields on meta. Returns an error string when
 * the input is structurally wrong, or null when meta is OK to persist as-is.
 *
 * Why bother: the plugin trusts these fields to render the comparison
 * column. A garbage URL would crash `figma.createImageAsync`. A keys/urls
 * length mismatch would render the wrong segment per row. Catch both here.
 */
function validateScreenshotMeta(meta: QueueEntryMeta): string | null {
  const { screenshotKeys, screenshotUrls, screenshotMeta } = meta;
  // Each piece is independently optional, but if any present, must validate.
  if (
    screenshotKeys === undefined &&
    screenshotUrls === undefined &&
    screenshotMeta === undefined
  ) {
    return null;
  }
  if (screenshotKeys !== undefined) {
    if (
      !Array.isArray(screenshotKeys) ||
      screenshotKeys.length > MAX_SCREENSHOT_KEYS ||
      !screenshotKeys.every((k) => typeof k === 'string' && k.length > 0 && k.length < 256)
    ) {
      return 'meta.screenshotKeys must be an array of <=30 non-empty strings';
    }
  }
  if (screenshotUrls !== undefined) {
    if (
      !Array.isArray(screenshotUrls) ||
      screenshotUrls.length > MAX_SCREENSHOT_KEYS ||
      !screenshotUrls.every(
        (u) =>
          typeof u === 'string' && u.startsWith('https://') && u.length < MAX_SCREENSHOT_URL_LEN,
      )
    ) {
      return 'meta.screenshotUrls must be an array of <=30 https URLs';
    }
  }
  if (screenshotKeys && screenshotUrls && screenshotKeys.length !== screenshotUrls.length) {
    return 'meta.screenshotKeys and meta.screenshotUrls length mismatch';
  }
  if (screenshotMeta !== undefined) {
    const m = screenshotMeta as unknown as Record<string, unknown>;
    const positive = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n > 0;
    const nonNeg = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
    if (
      !m ||
      !positive(m.totalHeight) ||
      !positive(m.viewportHeight) ||
      !positive(m.viewportWidth) ||
      !positive(m.devicePixelRatio) ||
      !nonNeg(m.count)
    ) {
      return 'meta.screenshotMeta must contain positive totalHeight/viewportHeight/viewportWidth/devicePixelRatio and non-negative count';
    }
  }
  return null;
}

export const push: Route = async (event, sessionId) => {
  const body = parseBody<PushBody>(event);
  if (!body) {
    return { statusCode: 400, body: { error: 'Missing body' } };
  }

  // Heads-up branch — discriminated by `kind` field.
  if (body.kind === 'heads-up') {
    if (body.payload != null) {
      return {
        statusCode: 400,
        body: { error: 'Combined payload and heads-up not allowed in single request' },
      };
    }
    if (!isHeadsUpPhase(body.phase)) {
      return { statusCode: 400, body: { error: 'Invalid or missing heads-up phase' } };
    }
    if (body.phase === 'uploading_screenshots') {
      const c = body.current;
      const t = body.total;
      const validCounter = (n: unknown): n is number =>
        typeof n === 'number' && Number.isInteger(n) && n >= 0;
      if (!validCounter(c) || !validCounter(t)) {
        return {
          statusCode: 400,
          body: {
            error: 'uploading_screenshots requires current and total as non-negative integers',
          },
        };
      }
    }
    if (body.phase === 'error') {
      if (typeof body.message !== 'string' || body.message.trim() === '') {
        return {
          statusCode: 400,
          body: { error: 'error phase requires a non-empty message string' },
        };
      }
    }
    await upsertHeadsUp(sessionId, body.phase, {
      current: typeof body.current === 'number' ? body.current : null,
      total: typeof body.total === 'number' ? body.total : null,
      message:
        typeof body.message === 'string' ? body.message.slice(0, MAX_HEADS_UP_MESSAGE_LEN) : null,
    });
    return { statusCode: 204 };
  }

  // ── Payload branch (unchanged from prior behaviour) ────────────────────────
  if (!body.payload) {
    return { statusCode: 400, body: { error: 'Missing payload' } };
  }

  const payload = body.payload;
  const meta = body.meta ?? {};

  if (payload.screenshots) {
    // Inline screenshots in payload have always been blocked — they break
    // the 3.5 MB API Gateway cap. The supported path now is to upload each
    // segment via POST /upload-screenshot, then reference them by key/URL
    // in `meta.screenshotKeys` / `meta.screenshotUrls`.
    console.warn(
      '[push] dropping inline screenshots; use /upload-screenshot + meta.screenshotKeys',
    );
    delete payload.screenshots;
    delete (payload as { screenshotMeta?: unknown }).screenshotMeta;
  }

  // Validate optional meta.screenshotKeys/Urls/Meta — added by extension
  // after a successful /upload-screenshot batch. Reject malformed input
  // rather than silently dropping; plugin behaviour depends on these.
  const metaErr = validateScreenshotMeta(meta);
  if (metaErr) {
    return { statusCode: 400, body: { error: metaErr } };
  }

  let dataSize = 0;
  try {
    dataSize = measureDataSize(payload);
  } catch (err) {
    console.warn(
      '[push] payload size check failed, allowing through:',
      err instanceof Error ? err.message : err,
    );
  }

  if (dataSize > MAX_DATA_PAYLOAD_SIZE) {
    console.warn(`[push] rejected: payload too large (${(dataSize / 1024 / 1024).toFixed(2)}MB)`);
    return {
      statusCode: 413,
      body: {
        error: 'Payload too large',
        maxSizeMB: MAX_DATA_PAYLOAD_SIZE / 1024 / 1024,
        actualSizeMB: +(dataSize / 1024 / 1024).toFixed(2),
      },
    };
  }

  const now = new Date();
  const entryId = generateEntryId();
  const entry: QueueEntry = {
    sessionId,
    entryId,
    payload,
    meta,
    pushedAt: now,
    acknowledged: false,
    lastPeekedAt: null,
    expiresAt: new Date(now.getTime() + ENTRY_TTL_MS),
  };

  await insertEntry(entry);
  const status = await getStatus(sessionId);

  return {
    statusCode: 200,
    body: {
      success: true,
      queueSize: status.queueSize,
      entryId,
    },
  };
};
