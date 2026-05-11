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
  // Market joined the unified Feed Card shell on 2026-05-08 — its data is
  // now rendered inside Feed Card_0426 with a Tile / Media Content swap
  // (`Type=Actions On` + `Product=true`) instead of the legacy
  // `Market Production Snippet` set. Size axis no longer drives variant
  // selection; size still flows through the parser for future use.
  describe('market', () => {
    it('returns Feed Card set with State=Default for any size', () => {
      for (const size of ['xs', 's', 'm', 'ml', 'l', 'xl'] as const) {
        const result = selectFeedVariant(
          makeRow({ '#Feed_CardType': 'market', '#Feed_CardSize': size }),
        );
        expect(result).not.toBeNull();
        expect(result!.key).toBe('fe5ce5e0d5863ab0b4b4d7fd952b19f6ddb58783');
        expect(result!.state).toBe('Default');
        expect(result!.variant).toBeUndefined();
      }
    });
  });

  // ===== Video / Post =====
  // post/video are now routed through the unified Feed Card shell — type-specific
  // Tile (Tile / Video / Tile / Media Content) is swapped into the Media Tile slot
  // by the corresponding apply*Data function.
  describe('video', () => {
    it('returns Feed Card set with State=Default for any size', () => {
      const result = selectFeedVariant(
        makeRow({ '#Feed_CardType': 'video', '#Feed_CardSize': 'ml' }),
      );
      expect(result).not.toBeNull();
      expect(result!.key).toBe('fe5ce5e0d5863ab0b4b4d7fd952b19f6ddb58783');
      expect(result!.state).toBe('Default');
      expect(result!.variant).toBeUndefined();
    });
  });

  describe('post', () => {
    it('returns Feed Card set with State=Default regardless of carousel', () => {
      const carousel = selectFeedVariant(
        makeRow({
          '#Feed_CardType': 'post',
          '#Feed_CardSize': 'm',
          '#Feed_CarouselImages': '["img1.jpg","img2.jpg"]',
        }),
      );
      const noCarousel = selectFeedVariant(
        makeRow({
          '#Feed_CardType': 'post',
          '#Feed_CardSize': 'm',
        }),
      );
      expect(carousel!.key).toBe('fe5ce5e0d5863ab0b4b4d7fd952b19f6ddb58783');
      expect(carousel!.state).toBe('Default');
      expect(noCarousel!.key).toBe('fe5ce5e0d5863ab0b4b4d7fd952b19f6ddb58783');
      expect(noCarousel!.state).toBe('Default');
    });
  });

  // ===== Advert =====
  // Advert is now routed through the unified Feed Card shell:
  // the slot tile (Tile / Ads, Type=Default) is swapped in by applyAdsData
  // via INSTANCE_SWAP. The selector returns the Feed Card set key + State axis,
  // not a numbered Variant.
  describe('advert', () => {
    it('returns Feed Card set with State=Default regardless of style', () => {
      const result = selectFeedVariant(
        makeRow({
          '#Feed_CardType': 'advert',
          '#Feed_CardSize': 'm',
        }),
      );
      expect(result).not.toBeNull();
      expect(result!.key).toBe('fe5ce5e0d5863ab0b4b4d7fd952b19f6ddb58783');
      expect(result!.state).toBe('Default');
      expect(result!.variant).toBeUndefined();
    });

    it('branded style still routes to Feed Card shell (style picked at slot level)', () => {
      const result = selectFeedVariant(
        makeRow({
          '#Feed_CardType': 'advert',
          '#Feed_CardSize': 'm',
          '#Feed_AdStyle': 'branded',
        }),
      );
      expect(result).not.toBeNull();
      expect(result!.key).toBe('fe5ce5e0d5863ab0b4b4d7fd952b19f6ddb58783');
      expect(result!.state).toBe('Default');
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
    it('always picks the first variant in range for product (legacy range path)', () => {
      const r1 = selectFeedVariant(
        makeRow({ '#Feed_CardType': 'product', '#Feed_ProductType': 'independent' }),
      );
      const r2 = selectFeedVariant(
        makeRow({ '#Feed_CardType': 'product', '#Feed_ProductType': 'independent' }),
      );
      expect(r1).not.toBeNull();
      expect(r2).not.toBeNull();
      expect(r1!.variant).toBe(r2!.variant);
      expect(r1!.variant).toBe(1); // first in 1-7 range
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
