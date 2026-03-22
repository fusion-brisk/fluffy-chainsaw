import { Router } from 'express';
import type { Request, Response } from 'express';
import type { DebugLogEntry } from '../types';

const router = Router();

const logBuffer: DebugLogEntry[] = [];
const MAX_ENTRIES = 500;

/** POST /debug-log — receive log entries from plugin (single or batch) */
router.post('/debug-log', (req: Request, res: Response) => {
  const body = req.body;
  if (!body) {
    res.status(400).json({ error: 'Empty body' });
    return;
  }

  const entries: DebugLogEntry[] = Array.isArray(body) ? body : [body];
  const now = Date.now();

  for (const entry of entries) {
    logBuffer.push({
      timestamp: entry.timestamp || now,
      level: entry.level || 'info',
      source: entry.source || 'unknown',
      message: entry.message || '',
      data: entry.data,
    });
  }

  // Trim to max size
  if (logBuffer.length > MAX_ENTRIES) {
    logBuffer.splice(0, logBuffer.length - MAX_ENTRIES);
  }

  res.json({ ok: true, stored: logBuffer.length });
});

/** GET /debug-log — read log entries with optional filtering */
router.get('/debug-log', (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 50, MAX_ENTRIES);
  const level = req.query.level as string | undefined;
  const source = req.query.source as string | undefined;
  const since = parseInt(req.query.since as string) || 0;

  let filtered = logBuffer;

  if (level) {
    filtered = filtered.filter((e) => e.level === level);
  }
  if (source) {
    filtered = filtered.filter((e) => e.source === source);
  }
  if (since > 0) {
    filtered = filtered.filter((e) => e.timestamp > since);
  }

  // Return newest first, limited
  const result = filtered.slice(-limit).reverse();

  res.json({ logs: result, total: logBuffer.length, returned: result.length });
});

/** DELETE /debug-log — clear buffer */
router.delete('/debug-log', (_req: Request, res: Response) => {
  const count = logBuffer.length;
  logBuffer.length = 0;
  res.json({ ok: true, cleared: count });
});

export default router;
