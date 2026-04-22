/**
 * POST /push — extension publishes a new queue entry for the session.
 *
 * Validates payload size (5MB cap on data fields) and drops `screenshots`
 * outright: the cloud relay is Phase 1 (text-only) and does not handle image
 * segments yet. Returns `{ entryId, queueSize }` so the client can confirm.
 */

import type { QueueEntry, QueueEntryMeta, QueueEntryPayload, Route } from '../types';
import { getStatus, insertEntry } from '../ydb';
import { parseBody } from './_util';

/** 5 MB limit for rawRows / feedCards / wizards / productCard combined. */
const MAX_DATA_PAYLOAD_SIZE = 5 * 1024 * 1024;

/** Queue entries live for 24 hours before YDB's TTL reaps them. */
const ENTRY_TTL_MS = 24 * 60 * 60 * 1000;

interface PushBody {
  payload?: QueueEntryPayload;
  meta?: QueueEntryMeta;
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

export const push: Route = async (event, sessionId) => {
  const body = parseBody<PushBody>(event);
  if (!body || !body.payload) {
    return { statusCode: 400, body: { error: 'Missing payload' } };
  }

  const payload = body.payload;
  const meta = body.meta ?? {};

  // Phase 2 — strip screenshot segments. The cloud relay does not store
  // images yet. Log a warning so we notice if a newer extension starts
  // sending them.
  if (payload.screenshots) {
    console.warn('[push] dropping screenshots (Phase 2 feature)');
    delete payload.screenshots;
    delete (payload as { screenshotMeta?: unknown }).screenshotMeta;
  }

  // Size check happens after screenshot stripping so we're only measuring
  // the text payload the client actually needs us to persist.
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
