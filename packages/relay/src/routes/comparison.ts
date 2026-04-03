import { Router } from 'express';
import type { Request, Response } from 'express';
import { getQueue, getPendingCount } from '../queue';
import {
  getScreenshotSegments,
  getScreenshotMeta,
  getLastImport,
  getResultSegments,
  getResultMeta,
} from '../storage';
import type { QueueEntryPayload } from '../types';

const router = Router();

/** GET /comparison */
router.get('/comparison', (_req: Request, res: Response) => {
  const pendingCount = getPendingCount();

  res.json({
    screenshot: {
      available: getScreenshotSegments().length > 0,
      count: getScreenshotSegments().length,
      meta: getScreenshotMeta(),
    },
    result: {
      available: getResultSegments().length > 0,
      count: getResultSegments().length,
      meta: getResultMeta(),
    },
    sourceData: {
      available: pendingCount > 0,
      queueSize: getQueue().length,
      pendingCount,
    },
    canReimport: getLastImport() !== null,
  });
});

/** GET /source-data */
router.get('/source-data', (req: Request, res: Response) => {
  const lastImport = getLastImport();
  if (!lastImport) {
    res.status(404).json({ error: 'No import data available. Send data via POST /push first.' });
    return;
  }

  const payload = (lastImport.payload || lastImport) as QueueEntryPayload;
  const rows = payload.rawRows || [];

  const index = req.query.index as string | undefined;
  if (index !== undefined) {
    const i = parseInt(index, 10);
    if (isNaN(i) || i < 0 || i >= rows.length) {
      res.status(400).json({ error: `Invalid index. Valid range: 0..${rows.length - 1}` });
      return;
    }
    res.json({ row: rows[i], index: i, totalRows: rows.length });
    return;
  }

  res.json({
    totalRows: rows.length,
    query: rows[0]?.['#query'] || '',
    capturedAt: payload.capturedAt || null,
    rows,
    productCard: payload.productCard || null,
  });
});

export default router;
