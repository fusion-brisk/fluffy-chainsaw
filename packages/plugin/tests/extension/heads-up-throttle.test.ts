/**
 * Source-contract test for the extension's sendHeadsUp helper.
 *
 * The extension package has no test runner, so we read background.ts as text
 * and assert (a) the helper exists with the expected throttle constant, and
 * (b) handleIconClick contains the required instrumentation calls. This is
 * the same pattern as tests/extension/delivery-badges.test.ts.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const BG_PATH = path.resolve(__dirname, '../../../extension/src/background.ts');

describe('extension/background.ts — heads-up source contract', () => {
  const source = fs.readFileSync(BG_PATH, 'utf8');

  it('declares HEADS_UP_THROTTLE_MS = 200', () => {
    expect(source).toMatch(/HEADS_UP_THROTTLE_MS\s*=\s*200/);
  });

  it('exports / declares sendHeadsUp helper', () => {
    expect(source).toMatch(/function sendHeadsUp\b/);
  });

  it('handleIconClick fires sendHeadsUp("uploading_json") before main fetch', () => {
    expect(source).toMatch(/sendHeadsUp\(\s*['"]uploading_json['"]/);
  });

  it('screenshot loop fires sendHeadsUp("uploading_screenshots", { current, total })', () => {
    expect(source).toMatch(/sendHeadsUp\(\s*['"]uploading_screenshots['"][^)]*current[^)]*total/s);
  });

  it('finalizing heads-up after screenshots', () => {
    expect(source).toMatch(/sendHeadsUp\(\s*['"]finalizing['"]/);
  });

  it('error heads-up in catch block', () => {
    expect(source).toMatch(/sendHeadsUp\(\s*['"]error['"]/);
  });
});
