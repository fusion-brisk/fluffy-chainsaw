import { Router } from 'express';
import type { Request, Response } from 'express';
import { openSync, readSync, closeSync, statSync } from 'fs';
import { resolve } from 'path';

const router = Router();

// Path to plugin dist — relay and plugin are siblings in the monorepo
// __dirname in compiled relay (dist/) is packages/relay/dist/
// So ../../plugin/dist/code.js → packages/plugin/dist/code.js
const CODE_JS_PATH = resolve(__dirname, '../../plugin/dist/code.js');

// Regex to extract hash from bundled code
// Rollup replace turns: export const BUILD_HASH = '__BUILD_HASH__'
// into: var BUILD_HASH = "a8a200a-1743782400000"  (in IIFE)
const HASH_RE = /BUILD_HASH\s*=\s*["']([^"']+)["']/;

/** GET /build-hash */
router.get('/build-hash', (_req: Request, res: Response) => {
  try {
    // Read first 4KB — hash is near the top of the IIFE
    const fd = openSync(CODE_JS_PATH, 'r');
    const buf = Buffer.alloc(4096);
    readSync(fd, buf, 0, 4096, 0);
    closeSync(fd);

    const chunk = buf.toString('utf8');
    const match = chunk.match(HASH_RE);

    if (match) {
      res.json({ hash: match[1] });
    } else {
      // Fallback: return mtime as hash
      const { mtimeMs } = statSync(CODE_JS_PATH);
      res.json({ hash: `mtime-${Math.floor(mtimeMs)}` });
    }
  } catch {
    res.status(404).json({ error: 'dist/code.js not found' });
  }
});

export default router;
