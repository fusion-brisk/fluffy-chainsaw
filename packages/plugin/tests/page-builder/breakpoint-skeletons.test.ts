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
  it('has exactly five canonical breakpoints', () => {
    expect(BREAKPOINTS).toHaveLength(5);
    const names = BREAKPOINTS.map((b) => b.name);
    expect(names).toEqual<BreakpointName[]>(['5col', '4col', '3col', '3col-narrow', 'touch']);
  });

  it('desktop frameWidth decreases monotonically, gridCols non-increasing', () => {
    const desktops = BREAKPOINTS.filter((b) => b.platform === 'desktop');
    for (let i = 1; i < desktops.length; i++) {
      expect(desktops[i].frameWidth).toBeLessThan(desktops[i - 1].frameWidth);
      // 3col and 3col-narrow share 3 cols, others decrease strictly
      expect(desktops[i].gridCols).toBeLessThanOrEqual(desktops[i - 1].gridCols);
    }
  });

  it('leftColWidth matches Yandex regular SERP plateaus', () => {
    const byName = Object.fromEntries(BREAKPOINTS.map((b) => [b.name, b]));
    // Yandex transitions at min-width: 1252 — above keeps leftCol=792,
    // below collapses to 568. The 820-990 narrow variant keeps 568.
    expect(byName['5col'].leftColWidth).toBe(792);
    expect(byName['4col'].leftColWidth).toBe(792);
    expect(byName['3col'].leftColWidth).toBe(568);
    expect(byName['3col-narrow'].leftColWidth).toBe(568);
  });

  it('tile widths match Yandex production measurements', () => {
    const byName = Object.fromEntries(BREAKPOINTS.map((b) => [b.name, b]));
    expect(byName['5col'].tileWidth).toBe(184);
    expect(byName['4col'].tileWidth).toBe(184);
    expect(byName['3col'].tileWidth).toBe(172);
    expect(byName['3col-narrow'].tileWidth).toBe(172);
    // touch is a 2-col grid; (360 − 8 gap) / 2 ≈ 176 as the starting hint,
    // final width is determined by the FLEX track and FILL child.
    expect(byName['touch'].tileWidth).toBe(176);
  });

  it('leftPaddingX values are measured from regular Yandex SERP', () => {
    const byName = Object.fromEntries(BREAKPOINTS.map((b) => [b.name, b]));
    // Values measured from .content__left.x on yandex.ru/search (no products_mode).
    // Transitions: 1560 (124→100), 1252 (leftCol.w 792→568), 990 (100→28).
    expect(byName['5col'].leftPaddingX).toBe(124);
    expect(byName['4col'].leftPaddingX).toBe(100);
    expect(byName['3col'].leftPaddingX).toBe(100);
    expect(byName['3col-narrow'].leftPaddingX).toBe(28);
    expect(byName['touch'].leftPaddingX).toBe(15);
  });

  it('content column fits inside frame with its left padding', () => {
    for (const bp of BREAKPOINTS) {
      // leftPadding + leftColWidth must not exceed frameWidth (no overflow)
      expect(bp.leftPaddingX + bp.leftColWidth).toBeLessThanOrEqual(bp.frameWidth);
    }
  });

  it('touch breakpoint uses top-aligned gallery and 2-column grid', () => {
    const touch = BREAKPOINTS.find((b) => b.name === 'touch');
    expect(touch).toBeDefined();
    expect(touch!.galleryVariant).toBe('top');
    expect(touch!.gridCols).toBe(2);
    expect(touch!.platform).toBe('touch');
  });

  it('desktop breakpoints use left-aligned gallery', () => {
    for (const bp of BREAKPOINTS) {
      if (bp.platform === 'desktop') {
        expect(bp.galleryVariant).toBe('left');
      }
    }
  });

  it('hasAsideFilters is enabled on wide desktop, disabled below 990px threshold and on touch', () => {
    const byName = Object.fromEntries(BREAKPOINTS.map((b) => [b.name, b]));
    // Yandex typically hides aside below the 990px CSS threshold
    expect(byName['5col'].hasAsideFilters).toBe(true);
    expect(byName['4col'].hasAsideFilters).toBe(true);
    expect(byName['3col'].hasAsideFilters).toBe(true);
    expect(byName['3col-narrow'].hasAsideFilters).toBe(false);
    expect(byName['touch'].hasAsideFilters).toBe(false);
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
