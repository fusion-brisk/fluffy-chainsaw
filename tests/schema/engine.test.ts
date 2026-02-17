/**
 * Tests for schema engine — resolveValue and applySchema
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockInstance } from '../setup';
import type { CSVRow } from '../../src/types/csv-fields';

// Mock dependencies before importing engine
vi.mock('../../src/property-utils', () => ({
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

import { applySchema } from '../../src/schema/engine';
import { trySetProperty } from '../../src/property-utils';
import { getCachedInstance } from '../../src/utils/instance-cache';
import type { ComponentSchema, PropertyMapping } from '../../src/schema/types';

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
      applySchema(container, { '#X': 'true' }, schema, mockCache());

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

      applySchema(container, { '#X': 'true' }, schema, mockCache());
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
      applySchema(container, { '#A': 'true', '#B': 'true', '#C': 'true' }, schema, mockCache());

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
});
