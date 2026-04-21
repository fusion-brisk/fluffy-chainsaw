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

  it('desktop frameWidth and gridCols decrease monotonically', () => {
    const desktops = BREAKPOINTS.filter((b) => b.platform === 'desktop');
    for (let i = 1; i < desktops.length; i++) {
      expect(desktops[i].frameWidth).toBeLessThan(desktops[i - 1].frameWidth);
      expect(desktops[i].gridCols).toBeLessThan(desktops[i - 1].gridCols);
    }
  });

  it('leftColWidth is 792 on wide desktop, drops to 568 on narrow desktop', () => {
    const byName = Object.fromEntries(BREAKPOINTS.map((b) => [b.name, b]));
    // Matches Yandex's own behaviour on regular SERP: content__left stays 792px
    // from 1440 upward, shrinks to 568 at ~1024 and below.
    expect(byName['5col'].leftColWidth).toBe(792);
    expect(byName['4col'].leftColWidth).toBe(792);
    expect(byName['3col'].leftColWidth).toBe(568);
  });

  it('tile widths match Yandex production measurements', () => {
    const byName = Object.fromEntries(BREAKPOINTS.map((b) => [b.name, b]));
    expect(byName['5col'].tileWidth).toBe(184);
    expect(byName['4col'].tileWidth).toBe(184);
    expect(byName['3col'].tileWidth).toBe(172);
    expect(byName['touch'].tileWidth).toBe(360);
  });

  it('leftPaddingX values are measured from regular Yandex SERP', () => {
    const byName = Object.fromEntries(BREAKPOINTS.map((b) => [b.name, b]));
    // Values measured from .content__left.x on yandex.ru/search (no products_mode):
    //   - 1920/1700 → 124
    //   - 1440/1024 → 100
    //   - touch → 15
    expect(byName['5col'].leftPaddingX).toBe(124);
    expect(byName['4col'].leftPaddingX).toBe(100);
    expect(byName['3col'].leftPaddingX).toBe(100);
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

  it('hasAsideFilters is true on desktop, false on touch', () => {
    for (const bp of BREAKPOINTS) {
      expect(bp.hasAsideFilters).toBe(bp.platform === 'desktop');
    }
  });

  it('aside + content fits inside frame at the measured leftPaddingX', () => {
    const ASIDE_W = 230;
    const ASIDE_GAP = 16;
    for (const bp of BREAKPOINTS) {
      if (!bp.hasAsideFilters) continue;
      const needed = bp.leftPaddingX + ASIDE_W + ASIDE_GAP + bp.leftColWidth;
      expect(needed).toBeLessThanOrEqual(bp.frameWidth);
    }
  });
});
