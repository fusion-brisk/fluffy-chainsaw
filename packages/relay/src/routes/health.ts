import { Router } from 'express';
import type { Request, Response } from 'express';
import { getQueue, getPendingCount, getLastPushTimestamp } from '../queue';
import { RELAY_VERSION } from '../version';

const router = Router();

/** GET /health */
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    version: RELAY_VERSION,
    queueSize: getQueue().length,
    pendingCount: getPendingCount(),
    lastPushAt: getLastPushTimestamp(),
  });
});

export default router;
