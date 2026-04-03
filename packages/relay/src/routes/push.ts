import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  addEntry,
  generateEntryId,
  setLastPushTimestamp,
  getQueue,
  getPendingCount,
  findFirstPending,
  findEntryById,
  removeEntryById,
  shiftEntry,
  clearQueue,
} from '../queue';
import { broadcast } from '../websocket';
import { setScreenshots, setLastImport, getLastImport, clearResultStorage } from '../storage';
import type { QueueEntryPayload, QueueEntryMeta, ScreenshotMeta } from '../types';
import { RELAY_VERSION } from '../version';

const router = Router();

const MAX_DATA_PAYLOAD_SIZE = 5 * 1024 * 1024; // 5MB for data fields (rawRows/feedCards/wizards)

/** POST /push */
router.post('/push', (req: Request, res: Response) => {
  const { payload, meta } = req.body as { payload?: QueueEntryPayload; meta?: QueueEntryMeta };

  if (!payload) {
    res.status(400).json({ error: 'Missing payload' });
    return;
  }

  // Validate payload size (data fields only, not screenshots)
  try {
    let dataSize = 0;
    if (payload.feedCards) dataSize += JSON.stringify(payload.feedCards).length;
    if (payload.rawRows) dataSize += JSON.stringify(payload.rawRows).length;
    if (payload.wizards) dataSize += JSON.stringify(payload.wizards).length;
    if (payload.productCard) dataSize += JSON.stringify(payload.productCard).length;

    if (dataSize > MAX_DATA_PAYLOAD_SIZE) {
      console.warn(`Push rejected: payload too large (${(dataSize / 1024 / 1024).toFixed(2)}MB)`);
      res.status(413).json({
        error: 'Payload too large',
        maxSizeMB: MAX_DATA_PAYLOAD_SIZE / 1024 / 1024,
        actualSizeMB: +(dataSize / 1024 / 1024).toFixed(2),
      });
      return;
    }
  } catch (e) {
    console.warn(
      'Payload size check failed, allowing through:',
      e instanceof Error ? e.message : e,
    );
  }

  // Extract and store screenshot segments separately
  if (payload.screenshots && payload.screenshots.length > 0) {
    const query = payload.rawRows?.[0]?.['#query'] || '';
    const meta: ScreenshotMeta = {
      ...(payload.screenshotMeta || {}),
      capturedAt: payload.capturedAt || new Date().toISOString(),
      query,
      url: payload.source?.url || '',
      count: payload.screenshots.length,
    };
    const totalKB = Math.round(payload.screenshots.reduce((sum, s) => sum + s.length, 0) / 1024);
    setScreenshots(payload.screenshots, meta);
    console.log(
      `${payload.screenshots.length} screenshot segments stored: ${totalKB}KB, query: "${query}"`,
    );
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
    acknowledged: false,
  });

  const sourceType = payload.sourceType || 'serp';
  const isFeed = sourceType === 'feed';
  const feedCardCount = isFeed ? (payload.feedCards || []).length : 0;
  const snippetCount = payload.rawRows?.length || 0;
  const wizardCount = payload.wizards?.length || 0;
  const hasProductCard = !!payload.productCard;
  const itemCount = isFeed ? feedCardCount : snippetCount + wizardCount;

  if (isFeed) {
    console.log(
      `Push [feed]: ${feedCardCount} cards (schema v${payload.schemaVersion || 1}), queue: ${getQueue().length}, id: ${entryId}`,
    );
  } else {
    console.log(
      `Push: ${snippetCount} snippets + ${wizardCount} wizards${hasProductCard ? ' + productCard' : ''} (schema v${payload.schemaVersion || 1}), queue: ${getQueue().length}, id: ${entryId}`,
    );
  }

  // Store deep copy for reimport
  setLastImport(req.body as { payload?: QueueEntryPayload; meta?: QueueEntryMeta });

  // Broadcast to WebSocket clients
  const query = isFeed ? '' : payload.rawRows?.[0]?.['#query'] || '';
  broadcast({
    type: 'new-data',
    entryId,
    itemCount,
    snippetCount,
    wizardCount,
    query,
    relayVersion: RELAY_VERSION,
    extensionVersion: (meta as QueueEntryMeta | undefined)?.extensionVersion || null,
    sourceType,
    feedCardCount: isFeed ? feedCardCount : undefined,
    timestamp: Date.now(),
  });

  res.json({
    success: true,
    queueSize: getQueue().length,
    entryId,
  });
});

/** GET /peek */
router.get('/peek', (_req: Request, res: Response) => {
  const entry = findFirstPending();

  if (!entry) {
    res.json({
      hasData: false,
      queueSize: getQueue().length,
    });
    return;
  }

  entry.lastPeekedAt = Date.now();

  const peekSourceType = entry.payload?.sourceType || 'serp';
  const itemCount =
    peekSourceType === 'feed'
      ? entry.payload?.feedCards?.length || 0
      : entry.payload?.rawRows?.length || 0;
  console.log(`Peek [${peekSourceType}]: ${itemCount} items, id: ${entry.id}`);

  res.json({
    hasData: true,
    entryId: entry.id,
    payload: entry.payload,
    meta: entry.meta,
    pushedAt: entry.pushedAt,
    pendingCount: getPendingCount(),
  });
});

/** GET /pull (deprecated — use /peek + /ack instead) */
router.get('/pull', (_req: Request, res: Response) => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Link', '</peek>; rel="successor-version"');

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
    remainingQueue: getQueue().length,
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
      queueSize: getQueue().length,
    });
    return;
  }

  const itemCount = removed.payload?.rawRows?.length || 0;
  console.log(`Ack: ${itemCount} items confirmed, id: ${entryId}, remaining: ${getQueue().length}`);

  res.json({
    success: true,
    queueSize: getQueue().length,
  });
});

/** POST /reject */
router.post('/reject', (req: Request, res: Response) => {
  const { entryId } = req.body as { entryId?: string };

  if (entryId) {
    const entry = findEntryById(entryId);
    if (entry) {
      entry.lastPeekedAt = null;
    }
  }

  console.log(`Reject: id ${entryId} (returned to queue)`);
  res.json({
    success: true,
    queueSize: getQueue().length,
  });
});

/** GET /status */
router.get('/status', (_req: Request, res: Response) => {
  const queue = getQueue();
  const pendingCount = getPendingCount();

  let firstEntry: { id: string; itemCount: number; pushedAt: string; query: string } | null = null;
  if (queue.length > 0) {
    const entry = queue[0];
    firstEntry = {
      id: entry.id,
      itemCount: entry.payload?.rawRows?.length || 0,
      pushedAt: entry.pushedAt,
      query: entry.payload?.rawRows?.[0]?.['#query'] || '',
    };
  }

  res.json({
    version: RELAY_VERSION,
    queueSize: queue.length,
    pendingCount,
    hasData: pendingCount > 0,
    firstEntry,
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
  const lastImport = getLastImport();
  if (!lastImport) {
    res
      .status(404)
      .json({ error: 'No previous import to replay. Send data via POST /push first.' });
    return;
  }

  clearResultStorage();

  const cloned = JSON.parse(JSON.stringify(lastImport)) as {
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
    acknowledged: false,
  });

  const reimportSourceType = payload.sourceType || 'serp';
  const reimportIsFeed = reimportSourceType === 'feed';
  const reimportFeedCardCount = reimportIsFeed ? (payload.feedCards || []).length : 0;
  const snippetCount = payload.rawRows?.length || 0;
  const wizardCount = payload.wizards?.length || 0;

  if (reimportIsFeed) {
    console.log(`Reimport [feed]: ${reimportFeedCardCount} cards, id: ${entryId}`);
  } else {
    console.log(`Reimport: ${snippetCount} snippets + ${wizardCount} wizards, id: ${entryId}`);
  }

  const query = reimportIsFeed ? '' : payload.rawRows?.[0]?.['#query'] || '';
  broadcast({
    type: 'new-data',
    entryId,
    itemCount: reimportIsFeed ? reimportFeedCardCount : snippetCount + wizardCount,
    snippetCount,
    wizardCount,
    query,
    relayVersion: RELAY_VERSION,
    extensionVersion: (meta as QueueEntryMeta).extensionVersion || null,
    sourceType: reimportSourceType,
    feedCardCount: reimportIsFeed ? reimportFeedCardCount : undefined,
    timestamp: Date.now(),
  });

  res.json({ success: true, entryId, queueSize: getQueue().length });
});

export default router;
