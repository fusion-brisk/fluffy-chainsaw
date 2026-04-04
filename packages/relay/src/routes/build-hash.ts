import { Router } from 'express';
import type { Request, Response } from 'express';
import { readFileSync, statSync } from 'fs';
import { resolve } from 'path';

const router = Router();

// Path to plugin dist — relay and plugin are siblings in the monorepo
// __dirname in compiled relay (dist/) is packages/relay/dist/
// So ../../plugin/dist/ → packages/plugin/dist/
const BUILD_HASH_PATH = resolve(__dirname, '../../plugin/dist/build-hash.txt');
const CODE_JS_PATH = resolve(__dirname, '../../plugin/dist/code.js');

/** GET /build-hash */
router.get('/build-hash', (_req: Request, res: Response) => {
  try {
    // Primary: read sidecar file written by rollup build
    const hash = readFileSync(BUILD_HASH_PATH, 'utf8').trim();
    if (hash) {
      res.json({ hash });
      return;
    }
  } catch {
    // Sidecar missing — fall through to mtime fallback
  }

  try {
    // Fallback: use code.js mtime (works before sidecar is generated)
    const { mtimeMs } = statSync(CODE_JS_PATH);
    res.json({ hash: `mtime-${Math.floor(mtimeMs)}` });
  } catch {
    res.status(404).json({ error: 'dist/code.js not found' });
  }
});

export default router;
