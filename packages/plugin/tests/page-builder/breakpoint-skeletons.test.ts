/**
 * Smoke test for BREAKPOINTS configuration.
 *
 * Full Figma-API integration is not exercised here because tests/setup.ts only
 * mocks a minimal subset (createMockInstance, etc.) and does not simulate
 * figma.createFrame / importComponentByKeyAsync. This test locks the
 * breakpoint spec so refactors can't silently drop a column or change widths.
 */

import { describe, expect, it } from 'vitest';
import {
  BREAKPOINTS,
  type BreakpointName,
} from '../../src/sandbox/page-builder/breakpoint-skeletons';

describe('BREAKPOINTS', () => {
  it('has exactly four canonical breakpoints', () => {
    expect(BREAKPOINTS).toHaveLength(4);
    const names = BREAKPOINTS.map((b) => b.name);
    expect(names).toEqual<BreakpointName[]>(['5col', '4col', '3col', 'touch']);
  });

  it('desktop breakpoints decrease in width and column count', () => {
    const desktops = BREAKPOINTS.filter((b) => b.platform === 'desktop');
    for (let i = 1; i < desktops.length; i++) {
      expect(desktops[i].frameWidth).toBeLessThan(desktops[i - 1].frameWidth);
      expect(desktops[i].gridCols).toBeLessThan(desktops[i - 1].gridCols);
      expect(desktops[i].leftColWidth).toBeLessThan(desktops[i - 1].leftColWidth);
    }
  });

  it('tile widths match Yandex production measurements', () => {
    const byName = Object.fromEntries(BREAKPOINTS.map((b) => [b.name, b]));
    expect(byName['5col'].tileWidth).toBe(184);
    expect(byName['4col'].tileWidth).toBe(184);
    expect(byName['3col'].tileWidth).toBe(172);
    expect(byName['touch'].tileWidth).toBe(360);
  });

  it('leftPaddingX values are measured from production', () => {
    const byName = Object.fromEntries(BREAKPOINTS.map((b) => [b.name, b]));
    // Values measured from .content__left.x on yandex.ru/search?products_mode=1
    expect(byName['5col'].leftPaddingX).toBe(372);
    expect(byName['4col'].leftPaddingX).toBe(272);
    expect(byName['3col'].leftPaddingX).toBe(236);
    expect(byName['touch'].leftPaddingX).toBe(15);
  });

  it('content column fits inside frame with its left padding', () => {
    for (const bp of BREAKPOINTS) {
      // leftPadding + leftColWidth must not exceed frameWidth (no overflow)
      expect(bp.leftPaddingX + bp.leftColWidth).toBeLessThanOrEqual(bp.frameWidth);
    }
  });

  it('touch breakpoint uses top-aligned gallery and 1-column grid', () => {
    const touch = BREAKPOINTS.find((b) => b.name === 'touch');
    expect(touch).toBeDefined();
    expect(touch!.galleryVariant).toBe('top');
    expect(touch!.gridCols).toBe(1);
    expect(touch!.platform).toBe('touch');
  });

  it('desktop breakpoints use left-aligned gallery', () => {
    for (const bp of BREAKPOINTS) {
      if (bp.platform === 'desktop') {
        expect(bp.galleryVariant).toBe('left');
      }
    }
  });
});
