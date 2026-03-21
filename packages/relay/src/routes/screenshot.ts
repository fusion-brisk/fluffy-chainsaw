import { Router } from 'express';
import type { Request, Response } from 'express';
import { getScreenshotSegments, getScreenshotMeta } from './push';

const router = Router();

/** GET /screenshot */
router.get('/screenshot', (req: Request, res: Response) => {
  const screenshotSegments = getScreenshotSegments();
  const screenshotMeta = getScreenshotMeta();

  if (screenshotSegments.length === 0) {
    res.status(404).json({ error: 'No screenshot available. Click the extension icon on a Yandex page.' });
    return;
  }

  const index = req.query.index as string | undefined;

  // ?index=all
  if (index === 'all') {
    res.json({
      segments: screenshotSegments,
      meta: screenshotMeta
    });
    return;
  }

  // ?index=N
  if (index !== undefined) {
    const i = parseInt(index, 10);
    if (isNaN(i) || i < 0 || i >= screenshotSegments.length) {
      res.status(400).json({
        error: `Invalid index. Valid range: 0..${screenshotSegments.length - 1}`
      });
      return;
    }

    const dataUrl = screenshotSegments[i];
    const matches = dataUrl.match(/^data:image\/([\w+]+);base64,(.+)$/);
    if (!matches) {
      res.status(500).json({ error: 'Invalid screenshot data' });
      return;
    }

    const ext = matches[1];
    const buf = Buffer.from(matches[2], 'base64');

    res.set('Content-Type', `image/${ext}`);
    res.set('Content-Length', String(buf.length));
    res.set('X-Segment-Index', String(i));
    res.set('X-Segment-Count', String(screenshotSegments.length));
    res.send(buf);
    return;
  }

  // No params -- metadata
  const segmentSizes = screenshotSegments.map(s => {
    const matches = s.match(/^data:image\/[\w+]+;base64,(.+)$/);
    return matches ? Math.round(Buffer.from(matches[1], 'base64').length / 1024) : 0;
  });

  res.json({
    hasScreenshot: true,
    count: screenshotSegments.length,
    meta: screenshotMeta,
    segments: segmentSizes.map((sizeKB, i) => ({ index: i, sizeKB }))
  });
});

export default router;
