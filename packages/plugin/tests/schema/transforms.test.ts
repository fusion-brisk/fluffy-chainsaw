/**
 * Tests for schema transforms — all compute functions
 */

import { describe, it, expect } from 'vitest';
import { createMockInstance } from '../setup';
import type { CSVRow } from '../../src/types/csv-fields';
import {
  isDesktopPlatform,
  computeWithButton,
  computeWithReviews,
  computeWithDelivery,
  computeWithMeta,
  computeWithData,
  computeOfferWithReviews,
  computeOfferWithDelivery,
  computeOfferWithFintech,
  computeOfferWithMeta,
  computeOfferWithData,
  computeWithTitle,
  computeOfferWithButton,
  computeProductWithButton,
  computeWithQuotes,
  computeSnippetWithDelivery,
  computeWithAddress,
  computeWithContacts,
  computeSnippetWithButton,
  computeSnippetWithMeta,
  computeSnippetWithData,
  computeSnippetWithPrice,
  computeSnippetWithEcomMeta,
  computeSnippetWithFintech,
  computeSnippetWithPromo
} from '../../src/sandbox/schema/transforms';

// Helper: create mock instance with Platform property
function mockWithPlatform(platform: string) {
  return createMockInstance('Test', { Platform: platform }) as unknown as InstanceNode;
}

function mockDesktop() {
  return mockWithPlatform('Desktop');
}

function mockTouch() {
  return mockWithPlatform('Touch');
}

function mockNoPlatform() {
  return createMockInstance('Test') as unknown as InstanceNode;
}

// ============================================================================
// Shared transforms
// ============================================================================

describe('isDesktopPlatform', () => {
  it('returns true for Desktop', () => {
    expect(isDesktopPlatform(mockDesktop())).toBe(true);
  });

  it('returns false for Touch', () => {
    expect(isDesktopPlatform(mockTouch())).toBe(false);
  });

  it('returns true when no Platform property', () => {
    expect(isDesktopPlatform(mockNoPlatform())).toBe(true);
  });

  it('handles Platform#123 key format', () => {
    const inst = createMockInstance('Test', { 'Platform#123:0': 'Touch' }) as unknown as InstanceNode;
    expect(isDesktopPlatform(inst)).toBe(false);
  });
});

describe('computeWithButton (EShopItem)', () => {
  it('returns true on Desktop even without checkout', () => {
    expect(computeWithButton({}, mockDesktop())).toBe(true);
  });

  it('returns true on Touch with checkout', () => {
    expect(computeWithButton({ '#isCheckout': 'true' }, mockTouch())).toBe(true);
  });

  it('returns true on Touch with MarketCheckoutButton', () => {
    expect(computeWithButton({ '#MarketCheckoutButton': 'true' }, mockTouch())).toBe(true);
  });

  it('returns false on Touch without checkout', () => {
    expect(computeWithButton({}, mockTouch())).toBe(false);
  });
});

describe('computeWithReviews', () => {
  it('returns true with ReviewsNumber', () => {
    expect(computeWithReviews({ '#ReviewsNumber': '42' })).toBe(true);
  });

  it('returns true with ShopInfo-Ugc', () => {
    expect(computeWithReviews({ '#ShopInfo-Ugc': '4.5' })).toBe(true);
  });

  it('returns false with empty values', () => {
    expect(computeWithReviews({ '#ReviewsNumber': '', '#ShopInfo-Ugc': '' })).toBe(false);
  });

  it('returns false with whitespace only', () => {
    expect(computeWithReviews({ '#ReviewsNumber': '  ' })).toBe(false);
  });

  it('returns false with no fields', () => {
    expect(computeWithReviews({})).toBe(false);
  });
});

describe('computeWithDelivery', () => {
  it('returns true with DeliveryList', () => {
    expect(computeWithDelivery({ '#DeliveryList': 'Курьер' })).toBe(true);
  });

  it('returns true with EDeliveryGroup=true', () => {
    expect(computeWithDelivery({ '#EDeliveryGroup': 'true' })).toBe(true);
  });

  it('returns false with EDeliveryGroup=false', () => {
    expect(computeWithDelivery({ '#EDeliveryGroup': 'false' })).toBe(false);
  });

  it('returns false with empty fields', () => {
    expect(computeWithDelivery({})).toBe(false);
  });
});

describe('computeWithMeta', () => {
  it('returns true with delivery', () => {
    expect(computeWithMeta({ '#EDeliveryGroup': 'true' })).toBe(true);
  });

  it('returns true with BNPL', () => {
    expect(computeWithMeta({ '#ShopInfo-Bnpl': 'true' })).toBe(true);
  });

  it('returns false without delivery or BNPL', () => {
    expect(computeWithMeta({})).toBe(false);
  });
});

describe('computeWithData', () => {
  it('returns true with reviews', () => {
    expect(computeWithData({ '#ReviewsNumber': '10' })).toBe(true);
  });

  it('returns true with delivery', () => {
    expect(computeWithData({ '#EDeliveryGroup': 'true' })).toBe(true);
  });

  it('returns true with BNPL', () => {
    expect(computeWithData({ '#ShopInfo-Bnpl': 'true' })).toBe(true);
  });

  it('returns false with nothing', () => {
    expect(computeWithData({})).toBe(false);
  });
});

// ============================================================================
// EOfferItem transforms
// ============================================================================

describe('computeOfferWithReviews', () => {
  it('returns true with EOfferItem_hasReviews flag', () => {
    expect(computeOfferWithReviews({ '#EOfferItem_hasReviews': 'true' })).toBe(true);
  });

  it('returns true with ReviewsNumber', () => {
    expect(computeOfferWithReviews({ '#ReviewsNumber': '5' })).toBe(true);
  });

  it('returns false without either', () => {
    expect(computeOfferWithReviews({})).toBe(false);
  });
});

describe('computeOfferWithDelivery', () => {
  it('returns true with EOfferItem_hasDelivery flag', () => {
    expect(computeOfferWithDelivery({ '#EOfferItem_hasDelivery': 'true' })).toBe(true);
  });

  it('returns true with base delivery fields', () => {
    expect(computeOfferWithDelivery({ '#DeliveryList': 'Курьер' })).toBe(true);
  });

  it('returns false without any delivery', () => {
    expect(computeOfferWithDelivery({})).toBe(false);
  });
});

describe('computeOfferWithFintech', () => {
  it('returns true with EOfferItem_Fintech', () => {
    expect(computeOfferWithFintech({ '#EOfferItem_Fintech': 'true' })).toBe(true);
  });

  it('returns true with EPriceGroup_Fintech', () => {
    expect(computeOfferWithFintech({ '#EPriceGroup_Fintech': 'true' })).toBe(true);
  });

  it('returns false without either', () => {
    expect(computeOfferWithFintech({})).toBe(false);
  });
});

describe('computeOfferWithMeta / computeOfferWithData', () => {
  it('computeOfferWithMeta: delivery OR bnpl', () => {
    expect(computeOfferWithMeta({ '#EOfferItem_hasDelivery': 'true' })).toBe(true);
    expect(computeOfferWithMeta({ '#ShopInfo-Bnpl': 'true' })).toBe(true);
    expect(computeOfferWithMeta({})).toBe(false);
  });

  it('computeOfferWithData: reviews OR delivery OR bnpl', () => {
    expect(computeOfferWithData({ '#EOfferItem_hasReviews': 'true' })).toBe(true);
    expect(computeOfferWithData({ '#EOfferItem_hasDelivery': 'true' })).toBe(true);
    expect(computeOfferWithData({ '#ShopInfo-Bnpl': 'true' })).toBe(true);
    expect(computeOfferWithData({})).toBe(false);
  });
});

describe('computeWithTitle', () => {
  it('returns true with OrganicTitle', () => {
    expect(computeWithTitle({ '#OrganicTitle': 'iPhone 15' })).toBe(true);
  });

  it('returns true with OfferTitle', () => {
    expect(computeWithTitle({ '#OfferTitle': 'Offer' })).toBe(true);
  });

  it('returns false with empty', () => {
    expect(computeWithTitle({})).toBe(false);
  });
});

describe('computeOfferWithButton', () => {
  it('always returns true', () => {
    expect(computeOfferWithButton()).toBe(true);
  });
});

// ============================================================================
// EProductSnippet transforms
// ============================================================================

describe('computeProductWithButton', () => {
  it('returns true with EMarketCheckoutLabel', () => {
    expect(computeProductWithButton({ '#EMarketCheckoutLabel': 'true' })).toBe(true);
  });

  it('returns true with BUTTON', () => {
    expect(computeProductWithButton({ '#BUTTON': 'true' })).toBe(true);
  });

  it('returns false without either', () => {
    expect(computeProductWithButton({})).toBe(false);
  });
});

// ============================================================================
// ESnippet transforms — plain Organic override
// ============================================================================

describe('ESnippet transforms — Organic override', () => {
  const organicRow: CSVRow = { '#SnippetType': 'Organic' };
  const shopRow: CSVRow = { '#SnippetType': 'EShopItem' };

  it('computeSnippetWithDelivery: false for Organic', () => {
    expect(computeSnippetWithDelivery({ ...organicRow, '#EDeliveryGroup': 'true' })).toBe(false);
    expect(computeSnippetWithDelivery({ ...shopRow, '#EDeliveryGroup': 'true' })).toBe(true);
  });

  it('computeSnippetWithFintech: false for Organic', () => {
    expect(computeSnippetWithFintech({ ...organicRow, '#EPriceGroup_Fintech': 'true' })).toBe(false);
    expect(computeSnippetWithFintech({ ...shopRow, '#EPriceGroup_Fintech': 'true' })).toBe(true);
  });

  it('computeSnippetWithPrice: false for Organic', () => {
    expect(computeSnippetWithPrice({ ...organicRow, '#OrganicPrice': '1990' })).toBe(false);
    expect(computeSnippetWithPrice({ ...shopRow, '#OrganicPrice': '1990' })).toBe(true);
  });

  it('computeSnippetWithMeta: false for Organic', () => {
    expect(computeSnippetWithMeta({ ...organicRow, '#EDeliveryGroup': 'true' })).toBe(false);
    expect(computeSnippetWithMeta({ ...shopRow, '#EDeliveryGroup': 'true' })).toBe(true);
  });

  it('computeSnippetWithData: false for Organic', () => {
    expect(computeSnippetWithData({ ...organicRow, '#ReviewsNumber': '10' })).toBe(false);
    expect(computeSnippetWithData({ ...shopRow, '#ReviewsNumber': '10' })).toBe(true);
  });

  it('computeSnippetWithEcomMeta: false for Organic', () => {
    expect(computeSnippetWithEcomMeta({ ...organicRow, '#OrganicPrice': '100' })).toBe(false);
    expect(computeSnippetWithEcomMeta({ ...shopRow, '#OrganicPrice': '100' })).toBe(true);
  });

  it('computeSnippetWithPromo: false for Organic', () => {
    expect(computeSnippetWithPromo({ ...organicRow, '#Promo': 'text' })).toBe(false);
    expect(computeSnippetWithPromo({ ...shopRow, '#Promo': 'text' })).toBe(true);
  });

  it('computeWithAddress: false for Organic', () => {
    expect(computeWithAddress({ ...organicRow, '#addressText': 'Moscow' })).toBe(false);
    expect(computeWithAddress({ ...shopRow, '#addressText': 'Moscow' })).toBe(true);
  });

  it('computeWithContacts: false for Organic', () => {
    expect(computeWithContacts({ ...organicRow, '#Phone': '+7999' })).toBe(false);
    expect(computeWithContacts({ ...shopRow, '#Phone': '+7999' })).toBe(true);
  });

  it('computeSnippetWithButton: false for Organic even on Desktop', () => {
    const desktop = mockDesktop();
    expect(computeSnippetWithButton({ ...organicRow, '#BUTTON': 'true' }, desktop)).toBe(false);
    expect(computeSnippetWithButton({ ...shopRow, '#BUTTON': 'true' }, desktop)).toBe(true);
  });
});

describe('computeSnippetWithButton (non-Organic)', () => {
  const row: CSVRow = { '#SnippetType': 'EShopItem' };

  it('true when BUTTON + Desktop', () => {
    expect(computeSnippetWithButton({ ...row, '#BUTTON': 'true' }, mockDesktop())).toBe(true);
  });

  it('false when BUTTON + Touch (no checkout)', () => {
    expect(computeSnippetWithButton({ ...row, '#BUTTON': 'true' }, mockTouch())).toBe(false);
  });

  it('true when Touch + checkout', () => {
    expect(computeSnippetWithButton({ ...row, '#isCheckout': 'true' }, mockTouch())).toBe(true);
  });

  it('false when no BUTTON on Desktop', () => {
    expect(computeSnippetWithButton(row, mockDesktop())).toBe(false);
  });
});

describe('computeWithQuotes', () => {
  it('returns true with withQuotes flag', () => {
    expect(computeWithQuotes({ '#withQuotes': 'true' })).toBe(true);
  });

  it('returns true with QuoteText', () => {
    expect(computeWithQuotes({ '#QuoteText': 'Great shop!' })).toBe(true);
  });

  it('returns true with EQuote-Text', () => {
    expect(computeWithQuotes({ '#EQuote-Text': 'Nice' })).toBe(true);
  });

  it('returns false without any', () => {
    expect(computeWithQuotes({})).toBe(false);
  });
});

describe('computeSnippetWithEcomMeta', () => {
  it('returns true with ProductRating', () => {
    expect(computeSnippetWithEcomMeta({ '#ProductRating': '4.5' })).toBe(true);
  });

  it('returns true with OrganicPrice', () => {
    expect(computeSnippetWithEcomMeta({ '#OrganicPrice': '1990' })).toBe(true);
  });

  it('returns true with OldPrice', () => {
    expect(computeSnippetWithEcomMeta({ '#OldPrice': '2990' })).toBe(true);
  });

  it('returns true with ReviewCount', () => {
    expect(computeSnippetWithEcomMeta({ '#ReviewCount': '15' })).toBe(true);
  });

  it('returns true with EPriceBarometer_View', () => {
    expect(computeSnippetWithEcomMeta({ '#EPriceBarometer_View': 'good' })).toBe(true);
  });

  it('returns true with ELabelGroup', () => {
    expect(computeSnippetWithEcomMeta({ '#ELabelGroup': 'true' })).toBe(true);
  });

  it('returns false with false values', () => {
    expect(computeSnippetWithEcomMeta({ '#ProductRating': 'false' })).toBe(false);
  });

  it('returns false with empty values', () => {
    expect(computeSnippetWithEcomMeta({ '#ProductRating': '' })).toBe(false);
  });

  it('returns false with no fields', () => {
    expect(computeSnippetWithEcomMeta({})).toBe(false);
  });
});

// ============================================================================
// ESnippet transforms — dedicated tests for each function
// ============================================================================

describe('computeSnippetWithDelivery (dedicated)', () => {
  const base: CSVRow = { '#SnippetType': 'EShopItem' };

  it('returns true with EDeliveryGroup=true', () => {
    expect(computeSnippetWithDelivery({ ...base, '#EDeliveryGroup': 'true' })).toBe(true);
  });

  it('returns true with EDelivery_abroad=true', () => {
    expect(computeSnippetWithDelivery({ ...base, '#EDelivery_abroad': 'true' })).toBe(true);
  });

  it('returns false with neither flag', () => {
    expect(computeSnippetWithDelivery(base)).toBe(false);
  });

  it('returns false with EDeliveryGroup=false', () => {
    expect(computeSnippetWithDelivery({ ...base, '#EDeliveryGroup': 'false' })).toBe(false);
  });
});

describe('computeSnippetWithMeta (dedicated)', () => {
  const base: CSVRow = { '#SnippetType': 'EShopItem' };

  it('returns true with delivery', () => {
    expect(computeSnippetWithMeta({ ...base, '#EDeliveryGroup': 'true' })).toBe(true);
  });

  it('returns true with BNPL', () => {
    expect(computeSnippetWithMeta({ ...base, '#ShopInfo-Bnpl': 'true' })).toBe(true);
  });

  it('returns true with both delivery and BNPL', () => {
    expect(computeSnippetWithMeta({ ...base, '#EDeliveryGroup': 'true', '#ShopInfo-Bnpl': 'true' })).toBe(true);
  });

  it('returns false without delivery or BNPL', () => {
    expect(computeSnippetWithMeta(base)).toBe(false);
  });
});

describe('computeSnippetWithData (dedicated)', () => {
  const base: CSVRow = { '#SnippetType': 'EShopItem' };

  it('returns true with reviews', () => {
    expect(computeSnippetWithData({ ...base, '#ReviewsNumber': '10' })).toBe(true);
  });

  it('returns true with delivery', () => {
    expect(computeSnippetWithData({ ...base, '#EDeliveryGroup': 'true' })).toBe(true);
  });

  it('returns true with BNPL', () => {
    expect(computeSnippetWithData({ ...base, '#ShopInfo-Bnpl': 'true' })).toBe(true);
  });

  it('returns false with nothing', () => {
    expect(computeSnippetWithData(base)).toBe(false);
  });

  it('returns false with empty reviews', () => {
    expect(computeSnippetWithData({ ...base, '#ReviewsNumber': '' })).toBe(false);
  });
});

describe('computeSnippetWithPrice (dedicated)', () => {
  const base: CSVRow = { '#SnippetType': 'EShopItem' };

  it('returns true with OrganicPrice', () => {
    expect(computeSnippetWithPrice({ ...base, '#OrganicPrice': '1990' })).toBe(true);
  });

  it('returns false with empty price', () => {
    expect(computeSnippetWithPrice({ ...base, '#OrganicPrice': '' })).toBe(false);
  });

  it('returns false with whitespace price', () => {
    expect(computeSnippetWithPrice({ ...base, '#OrganicPrice': '   ' })).toBe(false);
  });

  it('returns false without price field', () => {
    expect(computeSnippetWithPrice(base)).toBe(false);
  });
});

describe('computeSnippetWithFintech (dedicated)', () => {
  const base: CSVRow = { '#SnippetType': 'EShopItem' };

  it('returns true with EPriceGroup_Fintech=true', () => {
    expect(computeSnippetWithFintech({ ...base, '#EPriceGroup_Fintech': 'true' })).toBe(true);
  });

  it('returns false with EPriceGroup_Fintech=false', () => {
    expect(computeSnippetWithFintech({ ...base, '#EPriceGroup_Fintech': 'false' })).toBe(false);
  });

  it('returns false without fintech field', () => {
    expect(computeSnippetWithFintech(base)).toBe(false);
  });
});

describe('computeSnippetWithPromo (dedicated)', () => {
  const base: CSVRow = { '#SnippetType': 'EShopItem' };

  it('returns true with Promo text', () => {
    expect(computeSnippetWithPromo({ ...base, '#Promo': 'Скидка 20%' })).toBe(true);
  });

  it('returns false with empty Promo', () => {
    expect(computeSnippetWithPromo({ ...base, '#Promo': '' })).toBe(false);
  });

  it('returns false with whitespace Promo', () => {
    expect(computeSnippetWithPromo({ ...base, '#Promo': '   ' })).toBe(false);
  });

  it('returns false without Promo field', () => {
    expect(computeSnippetWithPromo(base)).toBe(false);
  });
});

describe('computeWithAddress (dedicated)', () => {
  const base: CSVRow = { '#SnippetType': 'EShopItem' };

  it('returns true with hasShopOfflineRegion=true', () => {
    expect(computeWithAddress({ ...base, '#hasShopOfflineRegion': 'true' })).toBe(true);
  });

  it('returns true with addressText', () => {
    expect(computeWithAddress({ ...base, '#addressText': 'Москва, ул. Тверская' })).toBe(true);
  });

  it('returns false with empty addressText', () => {
    expect(computeWithAddress({ ...base, '#addressText': '' })).toBe(false);
  });

  it('returns false with whitespace addressText', () => {
    expect(computeWithAddress({ ...base, '#addressText': '   ' })).toBe(false);
  });

  it('returns false without address fields', () => {
    expect(computeWithAddress(base)).toBe(false);
  });
});

describe('computeWithContacts (dedicated)', () => {
  const base: CSVRow = { '#SnippetType': 'EShopItem' };

  it('returns true with Phone', () => {
    expect(computeWithContacts({ ...base, '#Phone': '+7 999 123 45 67' })).toBe(true);
  });

  it('returns true with Contacts', () => {
    expect(computeWithContacts({ ...base, '#Contacts': 'info@shop.ru' })).toBe(true);
  });

  it('returns false with empty Phone', () => {
    expect(computeWithContacts({ ...base, '#Phone': '' })).toBe(false);
  });

  it('returns false with whitespace Contacts', () => {
    expect(computeWithContacts({ ...base, '#Contacts': '   ' })).toBe(false);
  });

  it('returns false without contact fields', () => {
    expect(computeWithContacts(base)).toBe(false);
  });
});
