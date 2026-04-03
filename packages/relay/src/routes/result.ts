import { Router } from 'express';
import type { Request, Response } from 'express';
import type { ResultMeta } from '../types';
import { setResult, getResultSegments, getResultMeta } from '../storage';

const router = Router();

/** POST /result */
router.post('/result', (req: Request, res: Response) => {
  const { dataUrl, meta } = req.body as { dataUrl?: string; meta?: ResultMeta };

  if (!dataUrl || typeof dataUrl !== 'string') {
    res.status(400).json({ error: 'Missing or invalid dataUrl' });
    return;
  }

  setResult(dataUrl, {
    ...(meta || {}),
    receivedAt: new Date().toISOString(),
  });

  const sizeKB = Math.round((dataUrl.length * 3) / 4 / 1024);
  console.log(`Result export stored: ~${sizeKB}KB, query: "${meta?.query || ''}"`);

  res.json({ success: true, sizeKB });
});

/** GET /result */
router.get('/result', (req: Request, res: Response) => {
  const resultSegments = getResultSegments();

  if (resultSegments.length === 0) {
    res.status(404).json({ error: 'No result export available. Run an import in Figma first.' });
    return;
  }

  const index = req.query.index as string | undefined;

  if (index !== undefined) {
    const i = parseInt(index, 10);
    if (isNaN(i) || i < 0 || i >= resultSegments.length) {
      res
        .status(400)
        .json({ error: `Invalid index. Valid range: 0..${resultSegments.length - 1}` });
      return;
    }

    const dataUrl = resultSegments[i];
    const matches = dataUrl.match(/^data:image\/([\w+]+);base64,(.+)$/);
    if (!matches) {
      res.status(500).json({ error: 'Invalid result data' });
      return;
    }

    const ext = matches[1];
    const buf = Buffer.from(matches[2], 'base64');

    res.set('Content-Type', `image/${ext}`);
    res.set('Content-Length', String(buf.length));
    res.send(buf);
    return;
  }

  // No params -- return metadata
  const segmentSizes = resultSegments.map((s) => {
    const matches = s.match(/^data:image\/[\w+]+;base64,(.+)$/);
    return matches ? Math.round(Buffer.from(matches[1], 'base64').length / 1024) : 0;
  });

  res.json({
    hasResult: true,
    count: resultSegments.length,
    meta: getResultMeta(),
    segments: segmentSizes.map((sizeKB, i) => ({ index: i, sizeKB })),
  });
});

export default router;
