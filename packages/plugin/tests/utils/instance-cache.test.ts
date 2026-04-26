/**
 * Tests for instance-cache utility helpers.
 *
 * Regression: shouldProcessGroupForEmptyCheck must NOT match the bare lowercase
 * "wrapper" name. That used to be the catch-all that surfaced the
 * EThumb > Image Overlay Controller > wrapper > SquareLabel layer in
 * EProductSnippet imports — handleEmptyGroups would auto-show wrapper
 * because SquareLabel inside is master-default visible=true.
 */

import { describe, it, expect } from 'vitest';
import { shouldProcessGroupForEmptyCheck } from '../../src/utils/instance-cache';

describe('shouldProcessGroupForEmptyCheck', () => {
  describe('exact-name patterns', () => {
    it.each([
      'EcomMeta',
      'Meta',
      'ESnippet-Meta',
      'Rating + Reviews',
      'Rating + Review + Quote',
      'Sitelinks',
      'Contacts',
      'Promo',
      'Price Block',
      'EDeliveryGroup',
      'ShopInfo-DeliveryBnplContainer',
    ])('matches %s', (name) => {
      expect(shouldProcessGroupForEmptyCheck(name)).toBe(true);
    });
  });

  describe('suffix patterns (case-sensitive)', () => {
    it.each(['PromoGroup', 'SitelinksContainer', 'PromoWrapper', 'PriceBlock'])(
      'matches %s via suffix',
      (name) => {
        expect(shouldProcessGroupForEmptyCheck(name)).toBe(true);
      },
    );

    it('matches bare "Wrapper" (capital W) via suffix', () => {
      expect(shouldProcessGroupForEmptyCheck('Wrapper')).toBe(true);
    });
  });

  describe('regression: lowercase "wrapper" must NOT match', () => {
    it('does not match bare "wrapper" — DepotKit utility container', () => {
      // EThumb > Image Overlay Controller > wrapper > SquareLabel
      // Master-default wrapper.visible=false. handleEmptyGroups must leave it alone.
      expect(shouldProcessGroupForEmptyCheck('wrapper')).toBe(false);
    });

    it('does not match "wrapper-foo" (lowercase, not a known suffix)', () => {
      expect(shouldProcessGroupForEmptyCheck('wrapper-foo')).toBe(false);
    });

    it('does not match "foo-wrapper" (lowercase substring, not the Wrapper suffix)', () => {
      expect(shouldProcessGroupForEmptyCheck('foo-wrapper')).toBe(false);
    });
  });

  describe('unknown names', () => {
    it.each(['SquareLabel', 'Image Overlay Controller', 'EThumb', ''])(
      'does not match %s',
      (name) => {
        expect(shouldProcessGroupForEmptyCheck(name)).toBe(false);
      },
    );
  });
});
