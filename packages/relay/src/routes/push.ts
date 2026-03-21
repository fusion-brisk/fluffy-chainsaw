import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  addEntry,
  generateEntryId,
  setLastPushTimestamp,
  getQueue,
  getPendingCount,
  findFirstPending,
  removeEntryById,
  shiftEntry,
  clearQueue
} from '../queue';
import { broadcast } from '../websocket';
import type { QueueEntryPayload, QueueEntryMeta, ScreenshotMeta } from '../types';

const router = Router();

// === In-memory storage for screenshots & reimport ===
let screenshotSegments: string[] = [];
let screenshotMeta: ScreenshotMeta | null = null;
let lastImportPayload: { payload?: QueueEntryPayload; meta?: QueueEntryMeta } | null = null;

// Expose for other routes
export function getScreenshotSegments(): string[] { return screenshotSegments; }
export function getScreenshotMeta(): ScreenshotMeta | null { return screenshotMeta; }
export function getLastImportPayload(): typeof lastImportPayload { return lastImportPayload; }
export function clearResult(): void {
  // Called by reimport route
}

/** POST /push */
router.post('/push', (req: Request, res: Response) => {
  // Dynamically import version from package.json
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pkg = require('../../package.json') as { version: string };

  const { payload, meta } = req.body as { payload?: QueueEntryPayload; meta?: QueueEntryMeta };

  if (!payload) {
    res.status(400).json({ error: 'Missing payload' });
    return;
  }

  // Validate payload size
  const MAX_PAYLOAD_SIZE = 1 * 1024 * 1024; // 1MB
  try {
    const rawRowsSize = payload.rawRows ? JSON.stringify(payload.rawRows).length : 0;
    if (rawRowsSize > MAX_PAYLOAD_SIZE) {
      console.warn(`Push rejected: payload too large (${(rawRowsSize / 1024 / 1024).toFixed(2)}MB)`);
      res.status(413).json({
        error: 'Payload too large',
        maxSizeMB: 1,
        actualSizeMB: +(rawRowsSize / 1024 / 1024).toFixed(2)
      });
      return;
    }
  } catch { /* size check failed, allow through */ }

  // Extract and store screenshot segments separately
  if (payload.screenshots && payload.screenshots.length > 0) {
    const query = payload.rawRows?.[0]?.['#query'] || '';
    screenshotSegments = payload.screenshots;
    screenshotMeta = {
      ...(payload.screenshotMeta || {}),
      capturedAt: payload.capturedAt || new Date().toISOString(),
      query,
      url: payload.source?.url || '',
      count: payload.screenshots.length
    };
    const totalKB = Math.round(screenshotSegments.reduce((sum, s) => sum + s.length, 0) / 1024);
    console.log(`${screenshotSegments.length} screenshot segments stored: ${totalKB}KB, query: "${query}"`);
    delete payload.screenshots;
    delete payload.screenshotMeta;
  }

  const entryId = generateEntryId();
  const pushedAt = new Date().toISOString();
  setLastPushTimestamp(pushedAt);

  addEntry({
    id: entryId,
    payload,
    meta: meta || {},
    pushedAt,
    acknowledged: false
  });

  const snippetCount = payload.rawRows?.length || 0;
  const wizardCount = payload.wizards?.length || 0;
  const hasProductCard = !!payload.productCard;
  const itemCount = snippetCount + wizardCount;
  console.log(`Push: ${snippetCount} snippets + ${wizardCount} wizards${hasProductCard ? ' + productCard' : ''} (schema v${payload.schemaVersion || 1}), queue: ${getQueue().length}, id: ${entryId}`);

  // Store deep copy for reimport
  try {
    lastImportPayload = JSON.parse(JSON.stringify(req.body));
  } catch { /* ignore clone errors */ }

  // Broadcast to WebSocket clients
  const query = payload.rawRows?.[0]?.['#query'] || '';
  broadcast({
    type: 'new-data',
    entryId,
    itemCount,
    snippetCount,
    wizardCount,
    query,
    relayVersion: pkg.version,
    extensionVersion: (meta as QueueEntryMeta | undefined)?.extensionVersion || null,
    timestamp: Date.now()
  });

  res.json({
    success: true,
    queueSize: getQueue().length,
    entryId
  });
});

/** GET /peek */
router.get('/peek', (_req: Request, res: Response) => {
  const entry = findFirstPending();

  if (!entry) {
    res.json({
      hasData: false,
      queueSize: getQueue().length
    });
    return;
  }

  entry.lastPeekedAt = Date.now();

  const itemCount = entry.payload?.rawRows?.length || 0;
  console.log(`Peek: ${itemCount} items, id: ${entry.id}`);

  res.json({
    hasData: true,
    entryId: entry.id,
    payload: entry.payload,
    meta: entry.meta,
    pushedAt: entry.pushedAt,
    pendingCount: getPendingCount()
  });
});

/** GET /pull (deprecated) */
router.get('/pull', (_req: Request, res: Response) => {
  const queue = getQueue();
  if (queue.length === 0) {
    res.json({ hasData: false, queueSize: 0 });
    return;
  }

  const entry = shiftEntry();
  if (!entry) {
    res.json({ hasData: false, queueSize: 0 });
    return;
  }

  const itemCount = entry.payload?.rawRows?.length || 0;
  console.log(`Pull: ${itemCount} items, remaining: ${getQueue().length}`);

  res.json({
    hasData: true,
    entryId: entry.id,
    payload: entry.payload,
    meta: entry.meta,
    pushedAt: entry.pushedAt,
    remainingQueue: getQueue().length
  });
});

/** POST /ack */
router.post('/ack', (req: Request, res: Response) => {
  const { entryId } = req.body as { entryId?: string };

  if (!entryId) {
    res.status(400).json({ error: 'Missing entryId' });
    return;
  }

  const removed = removeEntryById(entryId);

  if (!removed) {
    console.log(`Ack: id ${entryId} (already removed or not found)`);
    res.json({
      success: true,
      alreadyRemoved: true,
      queueSize: getQueue().length
    });
    return;
  }

  const itemCount = removed.payload?.rawRows?.length || 0;
  console.log(`Ack: ${itemCount} items confirmed, id: ${entryId}, remaining: ${getQueue().length}`);

  res.json({
    success: true,
    queueSize: getQueue().length
  });
});

/** POST /reject */
router.post('/reject', (req: Request, res: Response) => {
  const { entryId } = req.body as { entryId?: string };
  console.log(`Reject: id ${entryId} (data stays in queue)`);
  res.json({
    success: true,
    queueSize: getQueue().length
  });
});

/** GET /status */
router.get('/status', (_req: Request, res: Response) => {
  const pkg = require('../../package.json') as { version: string };
  const queue = getQueue();
  const pendingCount = getPendingCount();

  let firstEntry: { id: string; itemCount: number; pushedAt: string; query: string } | null = null;
  if (queue.length > 0) {
    const entry = queue[0];
    firstEntry = {
      id: entry.id,
      itemCount: entry.payload?.rawRows?.length || 0,
      pushedAt: entry.pushedAt,
      query: entry.payload?.rawRows?.[0]?.['#query'] || ''
    };
  }

  res.json({
    version: pkg.version,
    queueSize: queue.length,
    pendingCount,
    hasData: pendingCount > 0,
    firstEntry
  });
});

/** DELETE /clear */
router.delete('/clear', (_req: Request, res: Response) => {
  const count = clearQueue();
  console.log(`Clear: removed ${count} entries`);
  res.json({ success: true, cleared: count });
});

/** POST /reimport */
router.post('/reimport', (_req: Request, res: Response) => {
  const pkg = require('../../package.json') as { version: string };

  if (!lastImportPayload) {
    res.status(404).json({ error: 'No previous import to replay. Send data via POST /push first.' });
    return;
  }

  // Clear previous result (import from result.ts storage)
  const { clearResultStorage } = require('./result') as { clearResultStorage: () => void };
  clearResultStorage();

  const cloned = JSON.parse(JSON.stringify(lastImportPayload)) as {
    payload?: QueueEntryPayload;
    meta?: QueueEntryMeta;
  };
  const payload = cloned.payload || (cloned as unknown as QueueEntryPayload);
  const meta = cloned.meta || {};

  const entryId = generateEntryId();
  const pushedAt = new Date().toISOString();
  setLastPushTimestamp(pushedAt);

  addEntry({
    id: entryId,
    payload,
    meta,
    pushedAt,
    acknowledged: false
  });

  const snippetCount = payload.rawRows?.length || 0;
  const wizardCount = payload.wizards?.length || 0;
  console.log(`Reimport: ${snippetCount} snippets + ${wizardCount} wizards, id: ${entryId}`);

  const query = payload.rawRows?.[0]?.['#query'] || '';
  broadcast({
    type: 'new-data',
    entryId,
    itemCount: snippetCount + wizardCount,
    snippetCount,
    wizardCount,
    query,
    relayVersion: pkg.version,
    extensionVersion: (meta as QueueEntryMeta).extensionVersion || null,
    timestamp: Date.now()
  });

  res.json({ success: true, entryId, queueSize: getQueue().length });
});

export default router;
