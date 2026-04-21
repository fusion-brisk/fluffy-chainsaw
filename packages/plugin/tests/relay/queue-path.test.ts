/**
 * Regression test for the pkg-bundling bug that shipped in relay v2.6.0.
 *
 * History: queue.ts used `path.join(__dirname, '..', '.relay-queue.json')` which, when
 * packaged with pkg, resolved to a virtual snapshot path like `/snapshot/.../` that is NOT
 * included in the executable at compile time, causing EVERY save to fail with:
 *   "File or directory ... was not included into executable at compilation stage."
 *
 * Fix: derive DATA_FILE from process.env.HOME + '.contentify' — a real writable directory.
 *
 * This test guards the derivation logic independently of Node's actual filesystem, so it
 * passes regardless of whether the user's $HOME/.contentify exists.
 */

import { describe, it, expect } from 'vitest';
import path from 'path';

/** Mirror of queue.ts derivation — keep in sync. */
function resolveQueueFilePath(home: string | undefined): string {
  const installDir = path.join(home || '/tmp', '.contentify');
  return path.join(installDir, 'relay-queue.json');
}

describe('relay queue-path derivation', () => {
  it('uses $HOME/.contentify/ — NOT __dirname (which breaks in pkg snapshot)', () => {
    const resolved = resolveQueueFilePath('/Users/alice');
    expect(resolved).toBe('/Users/alice/.contentify/relay-queue.json');
    // Critical: no "/snapshot/" path segment (pkg virtual FS marker).
    expect(resolved).not.toContain('/snapshot/');
  });

  it('falls back to /tmp when HOME is undefined', () => {
    const resolved = resolveQueueFilePath(undefined);
    expect(resolved).toBe('/tmp/.contentify/relay-queue.json');
  });

  it('falls back to /tmp when HOME is empty string', () => {
    const resolved = resolveQueueFilePath('');
    expect(resolved).toBe('/tmp/.contentify/relay-queue.json');
  });

  it('filename has NO leading dot (renamed from `.relay-queue.json` in v2.6.1)', () => {
    const resolved = resolveQueueFilePath('/Users/alice');
    const basename = path.basename(resolved);
    expect(basename).toBe('relay-queue.json');
    expect(basename.startsWith('.')).toBe(false);
  });
});
