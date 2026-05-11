/**
 * @vitest-environment node
 *
 * useMeasuredHeight source-contract test. Asserts structural invariants
 * of the hook: it uses ResizeObserver, disconnects on unmount, and
 * seeds height synchronously from getBoundingClientRect to avoid a
 * one-frame 0-height flash.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SOURCE = fs.readFileSync(
  path.join(__dirname, '../../src/ui/hooks/useMeasuredHeight.ts'),
  'utf8',
);

describe('useMeasuredHeight — source contract', () => {
  it('uses ResizeObserver', () => {
    expect(SOURCE).toContain('new ResizeObserver');
  });

  it('disconnects observer when ref detaches or unmount fires', () => {
    expect(SOURCE).toMatch(/observer.+disconnect\(\)/i);
  });

  it('seeds height synchronously via getBoundingClientRect', () => {
    expect(SOURCE).toContain('getBoundingClientRect()');
  });

  it('cleans up in a useEffect return', () => {
    expect(SOURCE).toMatch(/useEffect\(\(\)\s*=>\s*\{\s*return\s*\(\)\s*=>/);
  });

  it('exports a hook that returns [refCallback, height]', () => {
    expect(SOURCE).toMatch(/export\s+function\s+useMeasuredHeight/);
    expect(SOURCE).toMatch(/return\s+\[\s*refCallback\s*,\s*height\s*\]/);
  });
});
