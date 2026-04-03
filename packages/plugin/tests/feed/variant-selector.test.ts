/**
 * Tests for selectFeedVariant — pure function, no Figma API mocking needed.
 */
import { describe, it, expect } from 'vitest';
import { selectFeedVariant } from '../../src/sandbox/feed-page-builder/feed-component-map';
import { FeedCardRow } from '../../src/types/feed-card-types';

/** Helper: create a minimal FeedCardRow with defaults */
function makeRow(overrides: Partial<FeedCardRow>): FeedCardRow {
  return Object.assign(
    {
      '#Feed_CardType': 'market' as const,
      '#Feed_CardSize': 'm' as const,
      '#Feed_Platform': 'desktop' as const,
      '#Feed_Index': '0',
    },
    overrides,
  );
}

describe('selectFeedVariant', () => {
  // ===== Market =====
  describe('market', () => {
    it('xs size returns variant in 1-2 range', () => {
      const result = selectFeedVariant(
        makeRow({ '#Feed_CardType': 'market', '#Feed_CardSize': 'xs' }),
      );
      expect(result).not.toBeNull();
      expect(result!.variant).toBeGreaterThanOrEqual(1);
      expect(result!.variant).toBeLessThanOrEqual(2);
    });

    it('m size returns variant in 3-6 range', () => {
      const result = selectFeedVariant(
        makeRow({ '#Feed_CardType': 'market', '#Feed_CardSize': 'm' }),
      );
      expect(result).not.toBeNull();
      expect(result!.variant).toBeGreaterThanOrEqual(3);
      expect(result!.variant).toBeLessThanOrEqual(6);
    });

    it('xl size returns variant in 7-8 range', () => {
      const result = selectFeedVariant(
        makeRow({ '#Feed_CardType': 'market', '#Feed_CardSize': 'xl' }),
      );
      expect(result).not.toBeNull();
      expect(result!.variant).toBeGreaterThanOrEqual(7);
      expect(result!.variant).toBeLessThanOrEqual(8);
    });

    it('s size falls into xs range (1-2)', () => {
      const result = selectFeedVariant(
        makeRow({ '#Feed_CardType': 'market', '#Feed_CardSize': 's' }),
      );
      expect(result).not.toBeNull();
      expect(result!.variant).toBeGreaterThanOrEqual(1);
      expect(result!.variant).toBeLessThanOrEqual(2);
    });

    it('l size falls into xl range (7-8)', () => {
      const result = selectFeedVariant(
        makeRow({ '#Feed_CardType': 'market', '#Feed_CardSize': 'l' }),
      );
      expect(result).not.toBeNull();
      expect(result!.variant).toBeGreaterThanOrEqual(7);
      expect(result!.variant).toBeLessThanOrEqual(8);
    });
  });

  // ===== Video =====
  describe('video', () => {
    it('ml size returns variant in 1-5 range', () => {
      const result = selectFeedVariant(
        makeRow({ '#Feed_CardType': 'video', '#Feed_CardSize': 'ml' }),
      );
      expect(result).not.toBeNull();
      expect(result!.variant).toBeGreaterThanOrEqual(1);
      expect(result!.variant).toBeLessThanOrEqual(5);
    });

    it('xs size returns variant in 1-5 range', () => {
      const result = selectFeedVariant(
        makeRow({ '#Feed_CardType': 'video', '#Feed_CardSize': 'xs' }),
      );
      expect(result).not.toBeNull();
      expect(result!.variant).toBeGreaterThanOrEqual(1);
      expect(result!.variant).toBeLessThanOrEqual(5);
    });
  });

  // ===== Post =====
  describe('post', () => {
    it('with carousel returns variant in 1-4 range', () => {
      const result = selectFeedVariant(
        makeRow({
          '#Feed_CardType': 'post',
          '#Feed_CardSize': 'm',
          '#Feed_CarouselImages': '["img1.jpg","img2.jpg"]',
        }),
      );
      expect(result).not.toBeNull();
      expect(result!.variant).toBeGreaterThanOrEqual(1);
      expect(result!.variant).toBeLessThanOrEqual(4);
    });

    it('without carousel returns variant in 5-14 range', () => {
      const result = selectFeedVariant(
        makeRow({
          '#Feed_CardType': 'post',
          '#Feed_CardSize': 'm',
        }),
      );
      expect(result).not.toBeNull();
      expect(result!.variant).toBeGreaterThanOrEqual(5);
      expect(result!.variant).toBeLessThanOrEqual(14);
    });
  });

  // ===== Advert =====
  describe('advert', () => {
    it('default (production) returns variant in 1-6 range', () => {
      const result = selectFeedVariant(
        makeRow({
          '#Feed_CardType': 'advert',
          '#Feed_CardSize': 'm',
        }),
      );
      expect(result).not.toBeNull();
      expect(result!.variant).toBeGreaterThanOrEqual(1);
      expect(result!.variant).toBeLessThanOrEqual(6);
    });

    it('branded style uses examples set key', () => {
      const result = selectFeedVariant(
        makeRow({
          '#Feed_CardType': 'advert',
          '#Feed_CardSize': 'm',
          '#Feed_AdStyle': 'branded',
        }),
      );
      expect(result).not.toBeNull();
      expect(result!.variant).toBeGreaterThanOrEqual(1);
      expect(result!.variant).toBeLessThanOrEqual(9);
      // The key should be the advert_examples set key
      expect(result!.key).toBe('fa33e1ca52751009197bba25340780694e977cdf');
    });
  });

  // ===== Product =====
  describe('product', () => {
    it('independent type returns variant in 1-7 range', () => {
      const result = selectFeedVariant(
        makeRow({
          '#Feed_CardType': 'product',
          '#Feed_CardSize': 'm',
          '#Feed_ProductType': 'independent',
        }),
      );
      expect(result).not.toBeNull();
      expect(result!.variant).toBeGreaterThanOrEqual(1);
      expect(result!.variant).toBeLessThanOrEqual(7);
    });

    it('market type returns variant in 8-21 range', () => {
      const result = selectFeedVariant(
        makeRow({
          '#Feed_CardType': 'product',
          '#Feed_CardSize': 'm',
          '#Feed_ProductType': 'market',
        }),
      );
      expect(result).not.toBeNull();
      expect(result!.variant).toBeGreaterThanOrEqual(8);
      expect(result!.variant).toBeLessThanOrEqual(21);
    });

    it('defaults to independent when no ProductType specified', () => {
      const result = selectFeedVariant(
        makeRow({
          '#Feed_CardType': 'product',
          '#Feed_CardSize': 'm',
        }),
      );
      expect(result).not.toBeNull();
      expect(result!.variant).toBeGreaterThanOrEqual(1);
      expect(result!.variant).toBeLessThanOrEqual(7);
    });
  });

  // ===== Collection =====
  describe('collection', () => {
    it('returns variant in 1-4 range', () => {
      const result = selectFeedVariant(
        makeRow({
          '#Feed_CardType': 'collection',
          '#Feed_CardSize': 'm',
        }),
      );
      expect(result).not.toBeNull();
      expect(result!.variant).toBeGreaterThanOrEqual(1);
      expect(result!.variant).toBeLessThanOrEqual(4);
    });
  });

  // ===== Platform =====
  describe('platform', () => {
    it('mobile platform returns Mobile in result', () => {
      const result = selectFeedVariant(
        makeRow({
          '#Feed_CardType': 'market',
          '#Feed_CardSize': 'm',
          '#Feed_Platform': 'mobile',
        }),
      );
      expect(result).not.toBeNull();
      expect(result!.platform).toBe('mobile');
    });

    it('desktop platform returns desktop in result', () => {
      const result = selectFeedVariant(
        makeRow({
          '#Feed_CardType': 'video',
          '#Feed_CardSize': 'ml',
          '#Feed_Platform': 'desktop',
        }),
      );
      expect(result).not.toBeNull();
      expect(result!.platform).toBe('desktop');
    });
  });

  // ===== Deterministic (first in range) =====
  describe('deterministic selection', () => {
    it('always picks the first variant in range', () => {
      const r1 = selectFeedVariant(makeRow({ '#Feed_CardType': 'market', '#Feed_CardSize': 'xs' }));
      const r2 = selectFeedVariant(makeRow({ '#Feed_CardType': 'market', '#Feed_CardSize': 'xs' }));
      expect(r1).not.toBeNull();
      expect(r2).not.toBeNull();
      expect(r1!.variant).toBe(r2!.variant);
      expect(r1!.variant).toBe(1); // first in 1-2 range
    });
  });

  // ===== Unknown type =====
  describe('edge cases', () => {
    it('returns null for unknown card type', () => {
      const result = selectFeedVariant(
        makeRow({
          '#Feed_CardType': 'unknown' as unknown as FeedCardRow['#Feed_CardType'],
        }),
      );
      expect(result).toBeNull();
    });
  });
});
