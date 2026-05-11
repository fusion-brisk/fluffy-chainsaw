/**
 * @vitest-environment node
 *
 * useResizeUI source-contract test. Asserts the hook cleans up its
 * pending rAF and timeout on unmount via useEffect cleanup, preventing
 * leaks during HMR or plugin teardown.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SOURCE = fs.readFileSync(path.join(__dirname, '../../src/ui/hooks/useResizeUI.ts'), 'utf8');

describe('useResizeUI — source contract', () => {
  it('exposes a cancelAnimation helper that clears rAF and timeout', () => {
    expect(SOURCE).toMatch(/cancelAnimationFrame\(/);
    expect(SOURCE).toMatch(/clearTimeout\(/);
  });

  it('registers a useEffect cleanup that invokes cancelAnimation on unmount', () => {
    // We expect either `return cancelAnimation;` or an inline return that calls it.
    expect(SOURCE).toMatch(/useEffect\([^)]*\)\s*=>\s*\{[\s\S]*?return\s+cancelAnimation/);
  });

  it('imports useEffect from react', () => {
    expect(SOURCE).toMatch(/from\s+['"]react['"]/);
    expect(SOURCE).toMatch(/useEffect/);
  });
});
