/**
 * Tests for field-fallbacks.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  applyFieldFallbacks, 
  getValueWithFallback, 
  getFallbackConfig,
  hasFallback,
  FIELD_FALLBACKS 
} from '../../src/handlers/field-fallbacks';
import { CSVRow } from '../../src/types/csv-fields';

describe('field-fallbacks', () => {
  describe('FIELD_FALLBACKS config', () => {
    it('should have fallback configs for common fields', () => {
      expect(FIELD_FALLBACKS.length).toBeGreaterThan(0);
      
      const fieldNames = FIELD_FALLBACKS.map(c => c.field);
      expect(fieldNames).toContain('#OrganicText');
      expect(fieldNames).toContain('#OrganicHost');
      expect(fieldNames).toContain('#ShopName');
      expect(fieldNames).toContain('#FaviconImage');
    });
  });

  describe('hasFallback', () => {
    it('should return true for fields with fallbacks', () => {
      expect(hasFallback('#OrganicText')).toBe(true);
      expect(hasFallback('#OrganicHost')).toBe(true);
      expect(hasFallback('#ShopName')).toBe(true);
    });

    it('should return false for fields without fallbacks', () => {
      expect(hasFallback('#OrganicPrice')).toBe(false);
      expect(hasFallback('#RandomField')).toBe(false);
    });
  });

  describe('getFallbackConfig', () => {
    it('should return config for existing field', () => {
      const config = getFallbackConfig('#OrganicText');
      expect(config).toBeDefined();
      expect(config?.field).toBe('#OrganicText');
      expect(config?.fallbacks).toContain('#OrganicTitle');
    });

    it('should return undefined for non-existent field', () => {
      expect(getFallbackConfig('#NonExistent')).toBeUndefined();
    });
  });

  describe('applyFieldFallbacks', () => {
    let row: CSVRow;

    beforeEach(() => {
      row = { '#SnippetType': 'EShopItem' };
    });

    it('should not modify fields that already have values', () => {
      row['#OrganicText'] = 'Existing text';
      row['#OrganicTitle'] = 'Title that should not be used';
      
      applyFieldFallbacks(row);
      
      expect(row['#OrganicText']).toBe('Existing text');
    });

    it('should apply fallback from #OrganicTitle to #OrganicText', () => {
      row['#OrganicTitle'] = 'My Product Title';
      
      applyFieldFallbacks(row);
      
      expect(row['#OrganicText']).toBe('My Product Title');
    });

    it('should apply fallback from #ShopName to #OrganicHost', () => {
      row['#ShopName'] = 'example-shop.ru';
      
      applyFieldFallbacks(row);
      
      expect(row['#OrganicHost']).toBe('example-shop.ru');
    });

    it('should apply fallback from #OrganicHost to #ShopName', () => {
      row['#OrganicHost'] = 'my-store.com';
      
      applyFieldFallbacks(row);
      
      expect(row['#ShopName']).toBe('my-store.com');
    });

    it('should construct FaviconImage URL from OrganicHost', () => {
      row['#OrganicHost'] = 'https://example.com/path';
      
      applyFieldFallbacks(row);
      
      expect(row['#FaviconImage']).toBe('https://favicon.yandex.net/favicon/v2/example.com?size=32');
    });

    it('should construct FaviconImage URL from ShopName (domain-like)', () => {
      row['#ShopName'] = 'ozon.ru';
      
      applyFieldFallbacks(row);
      
      expect(row['#FaviconImage']).toBe('https://favicon.yandex.net/favicon/v2/ozon.ru?size=32');
    });

    it('should handle empty row gracefully', () => {
      const emptyRow: CSVRow = {};
      
      expect(() => applyFieldFallbacks(emptyRow)).not.toThrow();
    });

    it('should normalize rating values', () => {
      row['#ShopInfo-Ugc'] = '4,8';
      
      applyFieldFallbacks(row);
      
      expect(row['#ProductRating']).toBe('4,8');
    });

    it('should set default ButtonView based on SnippetType', () => {
      row['#SnippetType'] = 'EShopItem';
      
      applyFieldFallbacks(row);
      
      expect(row['#ButtonView']).toBe('secondary');
    });

    it('should set ButtonView to "white" for EOfferItem', () => {
      row['#SnippetType'] = 'EOfferItem';
      
      applyFieldFallbacks(row);
      
      expect(row['#ButtonView']).toBe('white');
    });

    it('should set ButtonView to "primaryLong" for EProductSnippet2', () => {
      row['#SnippetType'] = 'EProductSnippet2';
      
      applyFieldFallbacks(row);
      
      expect(row['#ButtonView']).toBe('primaryLong');
    });
  });

  describe('getValueWithFallback', () => {
    it('should return direct value if exists', () => {
      const row: CSVRow = {
        '#OrganicText': 'Direct value',
        '#OrganicTitle': 'Fallback value'
      };
      
      expect(getValueWithFallback(row, '#OrganicText')).toBe('Direct value');
    });

    it('should return fallback value if direct is empty', () => {
      const row: CSVRow = {
        '#OrganicTitle': 'Fallback value'
      };
      
      expect(getValueWithFallback(row, '#OrganicText')).toBe('Fallback value');
    });

    it('should return empty string if no value found', () => {
      const row: CSVRow = {};
      
      expect(getValueWithFallback(row, '#OrganicText')).toBe('');
    });

    it('should apply transform when using fallback', () => {
      const row: CSVRow = {
        '#OrganicHost': 'https://shop.example.com/products'
      };
      
      const favicon = getValueWithFallback(row, '#FaviconImage');
      expect(favicon).toBe('https://favicon.yandex.net/favicon/v2/shop.example.com?size=32');
    });

    it('should return empty string for field without fallback config', () => {
      const row: CSVRow = {};
      
      expect(getValueWithFallback(row, '#OrganicPrice')).toBe('');
    });
  });
});

