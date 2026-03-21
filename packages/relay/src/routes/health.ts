import { Router } from 'express';
import type { Request, Response } from 'express';
import { getQueue, getPendingCount, getLastPushTimestamp } from '../queue';

const router = Router();

function getPkgVersion(): string {
  const pkg = require('../../package.json') as { version: string };
  return pkg.version;
}

/** GET /health */
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    version: getPkgVersion(),
    queueSize: getQueue().length,
    pendingCount: getPendingCount(),
    lastPushAt: getLastPushTimestamp()
  });
});

export default router;
