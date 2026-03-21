import { Router } from 'express';
import type { Request, Response } from 'express';
import type { DebugReport } from '../types';

const router = Router();

const debugReports: DebugReport[] = [];
const MAX_DEBUG_REPORTS = 5;

/** POST /debug */
router.post('/debug', (req: Request, res: Response) => {
  const report = req.body as DebugReport | undefined;
  if (!report) {
    res.status(400).json({ error: 'Empty body' });
    return;
  }
  report._receivedAt = new Date().toISOString();
  debugReports.unshift(report);
  if (debugReports.length > MAX_DEBUG_REPORTS) {
    debugReports.length = MAX_DEBUG_REPORTS;
  }
  console.log(`[Debug] Report received: ${report.operation || 'unknown'}, success=${report.success}, errors=${(report.errors || []).length}`);
  res.json({ ok: true, stored: debugReports.length });
});

/** GET /debug */
router.get('/debug', (_req: Request, res: Response) => {
  if (debugReports.length === 0) {
    res.json({ hasReport: false, message: 'No debug reports yet. Run an import in Figma.' });
    return;
  }
  const latest = debugReports[0];
  res.json({ hasReport: true, report: latest, totalReports: debugReports.length });
});

/** GET /debug/all */
router.get('/debug/all', (_req: Request, res: Response) => {
  res.json({ reports: debugReports, count: debugReports.length });
});

export default router;
