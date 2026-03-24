/**
 * Tests for schema engine — resolveValue and applySchema
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockInstance } from '../setup';
import type { CSVRow } from '../../src/types/csv-fields';

// Mock dependencies before importing engine
vi.mock('../../src/sandbox/property-utils', () => ({
  trySetProperty: vi.fn(() => true)
}));

vi.mock('../../src/utils/instance-cache', () => ({
  getCachedInstance: vi.fn(),
  DeepCache: {}
}));

vi.mock('../../src/logger', () => ({
  Logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

import { applySchema } from '../../src/sandbox/schema/engine';
import { trySetProperty } from '../../src/sandbox/property-utils';
import { getCachedInstance } from '../../src/utils/instance-cache';
import type { ComponentSchema } from '../../src/sandbox/schema/types';
import { ESHOP_ITEM_SCHEMA } from '../../src/sandbox/schema/eshop-item';
import { EOFFER_ITEM_SCHEMA } from '../../src/sandbox/schema/eoffer-item';
import { EPRODUCT_SNIPPET_SCHEMA } from '../../src/sandbox/schema/eproduct-snippet';
import { ESNIPPET_SCHEMA } from '../../src/sandbox/schema/esnippet';

const mockTrySetProperty = vi.mocked(trySetProperty);
const mockGetCachedInstance = vi.mocked(getCachedInstance);

function mockInstance(name: string) {
  return createMockInstance(name) as unknown as InstanceNode;
}

function mockCache() {
  return {
    instances: new Map(),
    textNodes: new Map(),
    groups: new Map(),
    allTextNodes: [],
    stats: { nodeCount: 0, instanceCount: 0, textCount: 0, groupCount: 0, buildTime: 0 }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('applySchema', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // Basic property resolution
  // =========================================================================

  describe('equals mode', () => {
    it('sets true when field matches value', () => {
      const schema: ComponentSchema = {
        containerNames: ['Test'],
        containerProperties: [{
          propertyNames: ['withFintech'],
          fieldName: '#F',
          equals: { field: '#EPriceGroup_Fintech', value: 'true' }
        }],
        nestedInstances: [],
        replacesHandlers: []
      };

      const container = mockInstance('Test');
      applySchema(container, { '#EPriceGroup_Fintech': 'true' }, schema, mockCache());

      expect(mockTrySetProperty).toHaveBeenCalledWith(
        container, ['withFintech'], true, '#F'
      );
    });

    it('sets false when field does not match', () => {
      const schema: ComponentSchema = {
        containerNames: ['Test'],
        containerProperties: [{
          propertyNames: ['withFintech'],
          fieldName: '#F',
          equals: { field: '#EPriceGroup_Fintech', value: 'true' }
        }],
        nestedInstances: [],
        replacesHandlers: []
      };

      const container = mockInstance('Test');
      applySchema(container, { '#EPriceGroup_Fintech': 'false' }, schema, mockCache());

      expect(mockTrySetProperty).toHaveBeenCalledWith(
        container, ['withFintech'], false, '#F'
      );
    });
  });

  describe('hasValue mode', () => {
    it('sets true when field has non-empty value', () => {
      const schema: ComponentSchema = {
        containerNames: ['Test'],
        containerProperties: [{
          propertyNames: ['brand'],
          fieldName: '#Brand',
          hasValue: '#Brand'
        }],
        nestedInstances: [],
        replacesHandlers: []
      };

      const container = mockInstance('Test');
      applySchema(container, { '#Brand': 'Samsung' }, schema, mockCache());

      expect(mockTrySetProperty).toHaveBeenCalledWith(
        container, ['brand'], true, '#Brand'
      );
    });

    it('sets false when field is empty', () => {
      const schema: ComponentSchema = {
        containerNames: ['Test'],
        containerProperties: [{
          propertyNames: ['brand'],
          fieldName: '#Brand',
          hasValue: '#Brand'
        }],
        nestedInstances: [],
        replacesHandlers: []
      };

      const container = mockInstance('Test');
      applySchema(container, { '#Brand': '' }, schema, mockCache());

      expect(mockTrySetProperty).toHaveBeenCalledWith(
        container, ['brand'], false, '#Brand'
      );
    });

    it('sets false when field is whitespace', () => {
      const schema: ComponentSchema = {
        containerNames: ['Test'],
        containerProperties: [{
          propertyNames: ['brand'],
          fieldName: '#Brand',
          hasValue: '#Brand'
        }],
        nestedInstances: [],
        replacesHandlers: []
      };

      const container = mockInstance('Test');
      applySchema(container, { '#Brand': '  ' }, schema, mockCache());

      expect(mockTrySetProperty).toHaveBeenCalledWith(
        container, ['brand'], false, '#Brand'
      );
    });
  });

  describe('stringValue mode', () => {
    it('passes string value through', () => {
      const schema: ComponentSchema = {
        containerNames: ['Test'],
        containerProperties: [{
          propertyNames: ['organicTitle'],
          fieldName: '#OrganicTitle',
          stringValue: '#OrganicTitle'
        }],
        nestedInstances: [],
        replacesHandlers: []
      };

      const container = mockInstance('Test');
      applySchema(container, { '#OrganicTitle': 'iPhone 15' }, schema, mockCache());

      expect(mockTrySetProperty).toHaveBeenCalledWith(
        container, ['organicTitle'], 'iPhone 15', '#OrganicTitle'
      );
    });

    it('skips when skipIfEmpty and value is empty', () => {
      const schema: ComponentSchema = {
        containerNames: ['Test'],
        containerProperties: [{
          propertyNames: ['organicTitle'],
          fieldName: '#OrganicTitle',
          stringValue: '#OrganicTitle',
          skipIfEmpty: true
        }],
        nestedInstances: [],
        replacesHandlers: []
      };

      const container = mockInstance('Test');
      applySchema(container, { '#OrganicTitle': '' }, schema, mockCache());

      expect(mockTrySetProperty).not.toHaveBeenCalled();
    });

    it('passes empty string when skipIfEmpty is not set', () => {
      const schema: ComponentSchema = {
        containerNames: ['Test'],
        containerProperties: [{
          propertyNames: ['organicTitle'],
          fieldName: '#OrganicTitle',
          stringValue: '#OrganicTitle'
        }],
        nestedInstances: [],
        replacesHandlers: []
      };

      const container = mockInstance('Test');
      applySchema(container, { '#OrganicTitle': '' }, schema, mockCache());

      expect(mockTrySetProperty).toHaveBeenCalledWith(
        container, ['organicTitle'], '', '#OrganicTitle'
      );
    });

    it('trims whitespace', () => {
      const schema: ComponentSchema = {
        containerNames: ['Test'],
        containerProperties: [{
          propertyNames: ['title'],
          fieldName: '#T',
          stringValue: '#OrganicTitle'
        }],
        nestedInstances: [],
        replacesHandlers: []
      };

      const container = mockInstance('Test');
      applySchema(container, { '#OrganicTitle': '  iPhone 15  ' }, schema, mockCache());

      expect(mockTrySetProperty).toHaveBeenCalledWith(
        container, ['title'], 'iPhone 15', '#T'
      );
    });
  });

  describe('compute mode', () => {
    it('calls compute function and uses result', () => {
      const computeFn = vi.fn(() => true);
      const schema: ComponentSchema = {
        containerNames: ['Test'],
        containerProperties: [{
          propertyNames: ['withButton'],
          fieldName: '#B',
          compute: computeFn
        }],
        nestedInstances: [],
        replacesHandlers: []
      };

      const container = mockInstance('Test');
      const row: CSVRow = { '#BUTTON': 'true' };
      const cache = mockCache();
      applySchema(container, row, schema, cache);

      expect(computeFn).toHaveBeenCalledWith(row, container, cache);
      expect(mockTrySetProperty).toHaveBeenCalledWith(
        container, ['withButton'], true, '#B'
      );
    });

    it('compute returning string passes string', () => {
      const schema: ComponentSchema = {
        containerNames: ['Test'],
        containerProperties: [{
          propertyNames: ['view'],
          fieldName: '#V',
          compute: () => 'special'
        }],
        nestedInstances: [],
        replacesHandlers: []
      };

      const container = mockInstance('Test');
      applySchema(container, {}, schema, mockCache());

      expect(mockTrySetProperty).toHaveBeenCalledWith(
        container, ['view'], 'special', '#V'
      );
    });
  });

  // =========================================================================
  // Priority: compute > equals > hasValue > stringValue
  // =========================================================================

  describe('value resolution priority', () => {
    it('compute wins over equals', () => {
      const schema: ComponentSchema = {
        containerNames: ['Test'],
        containerProperties: [{
          propertyNames: ['prop'],
          fieldName: '#F',
          compute: () => 'from-compute',
          equals: { field: '#X', value: 'true' }
        }],
        nestedInstances: [],
        replacesHandlers: []
      };

      const container = mockInstance('Test');
      applySchema(container, { '#X': 'true' } as CSVRow, schema, mockCache());

      expect(mockTrySetProperty).toHaveBeenCalledWith(
        container, ['prop'], 'from-compute', '#F'
      );
    });
  });

  // =========================================================================
  // Nested instances
  // =========================================================================

  describe('nested instances', () => {
    it('applies properties to nested instance found in cache', () => {
      const nestedInst = mockInstance('EShopName');
      mockGetCachedInstance.mockReturnValue(nestedInst);

      const schema: ComponentSchema = {
        containerNames: ['Test'],
        containerProperties: [],
        nestedInstances: [{
          instanceName: 'EShopName',
          properties: [{
            propertyNames: ['name'],
            fieldName: '#ShopName',
            stringValue: '#ShopName',
            skipIfEmpty: true
          }]
        }],
        replacesHandlers: []
      };

      const container = mockInstance('Test');
      applySchema(container, { '#ShopName': 'Ozon' }, schema, mockCache());

      expect(mockGetCachedInstance).toHaveBeenCalledWith(expect.anything(), 'EShopName');
      expect(mockTrySetProperty).toHaveBeenCalledWith(
        nestedInst, ['name'], 'Ozon', '#ShopName'
      );
    });

    it('skips nested instance if not found in cache', () => {
      mockGetCachedInstance.mockReturnValue(null);

      const schema: ComponentSchema = {
        containerNames: ['Test'],
        containerProperties: [],
        nestedInstances: [{
          instanceName: 'Missing',
          properties: [{
            propertyNames: ['name'],
            fieldName: '#F',
            stringValue: '#ShopName'
          }]
        }],
        replacesHandlers: []
      };

      const container = mockInstance('Test');
      applySchema(container, { '#ShopName': 'Ozon' }, schema, mockCache());

      expect(mockTrySetProperty).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================

  describe('edge cases', () => {
    it('skips removed container', () => {
      const container = mockInstance('Test');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (container as any).removed = true;

      const schema: ComponentSchema = {
        containerNames: ['Test'],
        containerProperties: [{
          propertyNames: ['x'],
          fieldName: '#X',
          equals: { field: '#X', value: 'true' }
        }],
        nestedInstances: [],
        replacesHandlers: []
      };

      applySchema(container, { '#X': 'true' } as CSVRow, schema, mockCache());
      expect(mockTrySetProperty).not.toHaveBeenCalled();
    });

    it('handles null row gracefully', () => {
      const container = mockInstance('Test');
      const schema: ComponentSchema = {
        containerNames: ['Test'],
        containerProperties: [],
        nestedInstances: [],
        replacesHandlers: []
      };

      // @ts-expect-error — testing null row
      expect(() => applySchema(container, null, schema, mockCache())).not.toThrow();
      expect(mockTrySetProperty).not.toHaveBeenCalled();
    });

    it('processes multiple properties in order', () => {
      const calls: string[] = [];
      mockTrySetProperty.mockImplementation((_inst, names) => {
        calls.push(names[0]);
        return true;
      });

      const schema: ComponentSchema = {
        containerNames: ['Test'],
        containerProperties: [
          { propertyNames: ['first'], fieldName: '#1', equals: { field: '#A', value: 'true' } },
          { propertyNames: ['second'], fieldName: '#2', equals: { field: '#B', value: 'true' } },
          { propertyNames: ['third'], fieldName: '#3', equals: { field: '#C', value: 'true' } }
        ],
        nestedInstances: [],
        replacesHandlers: []
      };

      const container = mockInstance('Test');
      applySchema(container, { '#A': 'true', '#B': 'true', '#C': 'true' } as CSVRow, schema, mockCache());

      expect(calls).toEqual(['first', 'second', 'third']);
    });
  });

  // =========================================================================
  // Real schema test (EShopItem-like)
  // =========================================================================

  describe('realistic EShopItem schema', () => {
    it('applies all EShopItem-like properties correctly', () => {
      const nestedInst = mockInstance('EShopName');
      mockGetCachedInstance.mockReturnValue(nestedInst);

      const schema: ComponentSchema = {
        containerNames: ['EShopItem'],
        containerProperties: [
          { propertyNames: ['brand'], fieldName: '#Brand', hasValue: '#Brand' },
          { propertyNames: ['withFintech'], fieldName: '#wF', equals: { field: '#EPriceGroup_Fintech', value: 'true' } },
          { propertyNames: ['organicTitle'], fieldName: '#OT', stringValue: '#OrganicTitle', skipIfEmpty: true },
          { propertyNames: ['withButton'], fieldName: '#B', compute: () => true }
        ],
        nestedInstances: [{
          instanceName: 'EShopName',
          properties: [
            { propertyNames: ['name'], fieldName: '#SN', stringValue: '#ShopName', skipIfEmpty: true },
            { propertyNames: ['isOfficial'], fieldName: '#OS', equals: { field: '#OfficialShop', value: 'true' } }
          ]
        }],
        replacesHandlers: ['EShopItem']
      };

      const container = mockInstance('EShopItem');
      const row: CSVRow = {
        '#Brand': 'Apple',
        '#EPriceGroup_Fintech': 'true',
        '#OrganicTitle': 'iPhone 15',
        '#ShopName': 'Ozon',
        '#OfficialShop': 'true'
      };

      applySchema(container, row, schema, mockCache());

      // Container properties
      expect(mockTrySetProperty).toHaveBeenCalledWith(container, ['brand'], true, '#Brand');
      expect(mockTrySetProperty).toHaveBeenCalledWith(container, ['withFintech'], true, '#wF');
      expect(mockTrySetProperty).toHaveBeenCalledWith(container, ['organicTitle'], 'iPhone 15', '#OT');
      expect(mockTrySetProperty).toHaveBeenCalledWith(container, ['withButton'], true, '#B');

      // Nested EShopName properties
      expect(mockTrySetProperty).toHaveBeenCalledWith(nestedInst, ['name'], 'Ozon', '#SN');
      expect(mockTrySetProperty).toHaveBeenCalledWith(nestedInst, ['isOfficial'], true, '#OS');

      expect(mockTrySetProperty).toHaveBeenCalledTimes(6);
    });
  });

  // =========================================================================
  // Schema integration tests — real schemas from production
  // =========================================================================

  describe('ESHOP_ITEM_SCHEMA integration', () => {
    it('sets all boolean properties for full data row', () => {
      const nestedInst = mockInstance('EShopName');
      mockGetCachedInstance.mockReturnValue(nestedInst);
      mockTrySetProperty.mockReturnValue(true);

      const container = mockInstance('EShopItem');
      const row: CSVRow = {
        '#Brand': 'Apple',
        '#BUTTON': 'true',
        '#isCheckout': 'true',
        '#ReviewsNumber': '42',
        '#DeliveryList': 'Курьер',
        '#EPriceGroup_Fintech': 'true',
        '#PriceDisclaimer': 'true',
        '#ShopInfo-Bnpl': 'true',
        '#FavoriteBtn': 'true',
        '#OrganicTitle': 'iPhone 15',
        '#OrganicText': 'Описание',
        '#ShopName': 'Ozon',
        '#OfficialShop': 'true',
      };

      applySchema(container, row, ESHOP_ITEM_SCHEMA, mockCache());

      // brand=true (hasValue)
      expect(mockTrySetProperty).toHaveBeenCalledWith(
        container, ['brand', 'Brand'], true, '#Brand'
      );
      // withButton=true (compute: Desktop default + checkout)
      expect(mockTrySetProperty).toHaveBeenCalledWith(
        container, ['withButton', 'buttons', 'BUTTONS'], true, '#BUTTON'
      );
      // withReviews=true (compute)
      expect(mockTrySetProperty).toHaveBeenCalledWith(
        container, ['withReviews'], true, '#withReviews'
      );
      // withDelivery=true (compute)
      expect(mockTrySetProperty).toHaveBeenCalledWith(
        container, ['withDelivery', 'delivery', 'Delivery'], true, '#withDelivery'
      );
      // withFintech=true (equals)
      expect(mockTrySetProperty).toHaveBeenCalledWith(
        container, ['withFintech', 'fintech', 'Fintech'], true, '#withFintech'
      );
      // organicTitle string
      expect(mockTrySetProperty).toHaveBeenCalledWith(
        container, ['organicTitle'], 'iPhone 15', '#OrganicTitle'
      );
      // Nested EShopName — name + isOfficial
      expect(mockTrySetProperty).toHaveBeenCalledWith(
        nestedInst, ['name'], 'Ozon', '#ShopName'
      );
      expect(mockTrySetProperty).toHaveBeenCalledWith(
        nestedInst, ['isOfficial'], true, '#OfficialShop'
      );
    });

    it('sets booleans to false for empty row', () => {
      mockGetCachedInstance.mockReturnValue(null);
      mockTrySetProperty.mockReturnValue(true);

      const container = mockInstance('EShopItem');
      applySchema(container, {} as CSVRow, ESHOP_ITEM_SCHEMA, mockCache());

      // brand=false (hasValue, no #Brand)
      expect(mockTrySetProperty).toHaveBeenCalledWith(
        container, ['brand', 'Brand'], false, '#Brand'
      );
      // withReviews=false
      expect(mockTrySetProperty).toHaveBeenCalledWith(
        container, ['withReviews'], false, '#withReviews'
      );
      // withDelivery=false
      expect(mockTrySetProperty).toHaveBeenCalledWith(
        container, ['withDelivery', 'delivery', 'Delivery'], false, '#withDelivery'
      );
      // organicTitle skipped (skipIfEmpty) — should NOT be called with empty
      const titleCalls = mockTrySetProperty.mock.calls.filter(
        c => c[1][0] === 'organicTitle'
      );
      expect(titleCalls).toHaveLength(0);
    });
  });

  describe('EOFFER_ITEM_SCHEMA integration', () => {
    it('always sets withButton=true', () => {
      const nestedInst = mockInstance('EShopName');
      mockGetCachedInstance.mockReturnValue(nestedInst);
      mockTrySetProperty.mockReturnValue(true);

      const container = mockInstance('EOfferItem');
      applySchema(container, {} as CSVRow, EOFFER_ITEM_SCHEMA, mockCache());

      // withButton always true for EOfferItem
      expect(mockTrySetProperty).toHaveBeenCalledWith(
        container, ['withButton'], true, '#EOfferItem_hasButton'
      );
    });

    it('sets withTitle=true when OrganicTitle present', () => {
      mockGetCachedInstance.mockReturnValue(null);
      mockTrySetProperty.mockReturnValue(true);

      const container = mockInstance('EOfferItem');
      applySchema(container, { '#OrganicTitle': 'Product' } as CSVRow, EOFFER_ITEM_SCHEMA, mockCache());

      expect(mockTrySetProperty).toHaveBeenCalledWith(
        container, ['withTitle', 'Offer Title'], true, '#withTitle'
      );
    });

    it('sets withQuotes=true from QuoteText', () => {
      mockGetCachedInstance.mockReturnValue(null);
      mockTrySetProperty.mockReturnValue(true);

      const container = mockInstance('EOfferItem');
      applySchema(container, { '#QuoteText': 'Отличный товар!' } as CSVRow, EOFFER_ITEM_SCHEMA, mockCache());

      expect(mockTrySetProperty).toHaveBeenCalledWith(
        container, ['withQuotes'], true, '#withQuotes'
      );
    });
  });

  describe('EPRODUCT_SNIPPET_SCHEMA integration', () => {
    it('applies delivery and button properties', () => {
      mockGetCachedInstance.mockReturnValue(null);
      mockTrySetProperty.mockReturnValue(true);

      const container = mockInstance('EProductSnippet');
      const row: CSVRow = {
        '#EDeliveryGroup': 'true',
        '#EMarketCheckoutLabel': 'true',
        '#OrganicTitle': 'Ноутбук',
        '#Brand': 'Lenovo',
      };

      applySchema(container, row, EPRODUCT_SNIPPET_SCHEMA, mockCache());

      // withDelivery=true (equals)
      expect(mockTrySetProperty).toHaveBeenCalledWith(
        container, ['withDelivery', 'Delivery'], true, '#withDelivery'
      );
      // withButton=true (compute: EMarketCheckoutLabel)
      expect(mockTrySetProperty).toHaveBeenCalledWith(
        container, ['withButton', 'Button'], true, '#withButton'
      );
      // organicTitle string
      expect(mockTrySetProperty).toHaveBeenCalledWith(
        container, ['organicTitle', 'title', 'Title'], 'Ноутбук', '#OrganicTitle'
      );
      // brand=true (hasValue)
      expect(mockTrySetProperty).toHaveBeenCalledWith(
        container, ['brand', 'Brand'], true, '#Brand'
      );
    });

    it('sets withButton=false without checkout or button flag', () => {
      mockGetCachedInstance.mockReturnValue(null);
      mockTrySetProperty.mockReturnValue(true);

      const container = mockInstance('EProductSnippet');
      applySchema(container, {} as CSVRow, EPRODUCT_SNIPPET_SCHEMA, mockCache());

      expect(mockTrySetProperty).toHaveBeenCalledWith(
        container, ['withButton', 'Button'], false, '#withButton'
      );
    });
  });

  describe('ESNIPPET_SCHEMA integration', () => {
    it('sets all ESnippet properties for shop snippet', () => {
      mockGetCachedInstance.mockReturnValue(null);
      mockTrySetProperty.mockReturnValue(true);

      const container = mockInstance('ESnippet');
      const row: CSVRow = {
        '#SnippetType': 'EShopItem',
        '#withThumb': 'true',
        '#ReviewsNumber': '15',
        '#EDeliveryGroup': 'true',
        '#EPriceGroup_Fintech': 'true',
        '#addressText': 'Москва',
        '#Sitelinks': 'true',
        '#Promo': 'Скидка',
        '#BUTTON': 'true',
        '#ShopInfo-Bnpl': 'true',
        '#Phone': '+7999',
        '#OrganicPrice': '1990',
        '#ProductRating': '4.5',
        '#showKebab': 'true',
        '#OfficialShop': 'true',
        '#isPromo': 'true',
        '#OrganicTitle': 'Товар',
        '#OrganicText': 'Описание',
        '#OrganicHost': 'shop.ru',
        '#OrganicPath': '/product/123',
      };

      applySchema(container, row, ESNIPPET_SCHEMA, mockCache());

      // Spot-check key properties
      expect(mockTrySetProperty).toHaveBeenCalledWith(
        container, ['withThumb'], true, '#withThumb'
      );
      expect(mockTrySetProperty).toHaveBeenCalledWith(
        container, ['withReviews'], true, '#withReviews'
      );
      expect(mockTrySetProperty).toHaveBeenCalledWith(
        container, ['withDelivery'], true, '#withDelivery'
      );
      expect(mockTrySetProperty).toHaveBeenCalledWith(
        container, ['withContacts'], true, '#withContacts'
      );
      expect(mockTrySetProperty).toHaveBeenCalledWith(
        container, ['organicTitle'], 'Товар', '#OrganicTitle'
      );
      expect(mockTrySetProperty).toHaveBeenCalledWith(
        container, ['isOfficial', 'official', 'Official'], true, '#isOfficial'
      );
    });

    it('disables all compute properties for Organic snippet type', () => {
      mockGetCachedInstance.mockReturnValue(null);
      mockTrySetProperty.mockReturnValue(true);

      const container = mockInstance('ESnippet');
      const row: CSVRow = {
        '#SnippetType': 'Organic',
        '#EDeliveryGroup': 'true',
        '#OrganicPrice': '1990',
        '#Phone': '+7999',
        '#Promo': 'text',
      };

      applySchema(container, row, ESNIPPET_SCHEMA, mockCache());

      // All Organic-suppressed properties should be false
      expect(mockTrySetProperty).toHaveBeenCalledWith(
        container, ['withDelivery'], false, '#withDelivery'
      );
      expect(mockTrySetProperty).toHaveBeenCalledWith(
        container, ['withPrice'], false, '#withPrice'
      );
      expect(mockTrySetProperty).toHaveBeenCalledWith(
        container, ['withContacts'], false, '#withContacts'
      );
      expect(mockTrySetProperty).toHaveBeenCalledWith(
        container, ['withPromo'], false, '#withPromo'
      );
    });

    it('skips empty string properties with skipIfEmpty', () => {
      mockGetCachedInstance.mockReturnValue(null);
      mockTrySetProperty.mockReturnValue(true);

      const container = mockInstance('ESnippet');
      applySchema(container, { '#SnippetType': 'Organic' } as CSVRow, ESNIPPET_SCHEMA, mockCache());

      // organicTitle should not appear in calls (skipIfEmpty + empty)
      const titleCalls = mockTrySetProperty.mock.calls.filter(
        c => c[1][0] === 'organicTitle'
      );
      expect(titleCalls).toHaveLength(0);
    });
  });
});
