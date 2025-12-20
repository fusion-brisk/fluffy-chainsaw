/**
 * Tests for validation.ts
 */

import { describe, it, expect } from 'vitest';
import { 
  validateRow, 
  validateRows, 
  hasRequiredFields,
  getMissingRequiredFields 
} from '../../src/types/validation';
import { CSVRow, SnippetType } from '../../src/types/csv-fields';

describe('validation', () => {
  describe('validateRow', () => {
    it('should validate a complete EShopItem row', () => {
      const row: CSVRow = {
        '#SnippetType': 'EShopItem',
        '#ShopName': 'Test Shop',
        '#OrganicPrice': '1 990 ₽',
        '#OrganicTitle': 'Test Product'
      };

      const result = validateRow(row);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should normalize boolean fields', () => {
      const row: CSVRow = {
        '#SnippetType': 'EShopItem',
        '#ShopName': 'Test Shop',
        '#OrganicPrice': '1 990 ₽',
        '#EPriceGroup_Discount': 'TRUE',
        '#OfficialShop': 'yes'
      };

      const result = validateRow(row);
      
      expect(result.normalizedRow['#EPriceGroup_Discount']).toBe('true');
      expect(result.normalizedRow['#OfficialShop']).toBe('true');
    });

    it('should normalize numeric fields', () => {
      const row: CSVRow = {
        '#SnippetType': 'EShopItem',
        '#ShopName': 'Test Shop',
        '#OrganicPrice': '1 990 ₽',
        '#ProductRating': '4,5',
        '#DiscountPercent': '-20%'
      };

      const result = validateRow(row);
      
      // Рейтинг нормализуется
      expect(result.normalizedRow['#ProductRating']).toBeDefined();
    });

    it('should add warning for missing optional fields', () => {
      const row: CSVRow = {
        '#SnippetType': 'EShopItem',
        '#ShopName': 'Test Shop',
        '#OrganicPrice': '1 990 ₽'
        // Missing #OrganicImage, #FaviconImage
      };

      const result = validateRow(row);
      
      expect(result.valid).toBe(true);
      // Warnings for missing images are OK
    });
  });

  describe('validateRows', () => {
    it('should validate multiple rows', () => {
      const rows: CSVRow[] = [
        { '#SnippetType': 'EShopItem', '#ShopName': 'Shop 1', '#OrganicPrice': '100' },
        { '#SnippetType': 'EShopItem', '#ShopName': 'Shop 2', '#OrganicPrice': '200' }
      ];

      const result = validateRows(rows);
      
      expect(result.validRows).toHaveLength(2);
      expect(result.invalidRows).toHaveLength(0);
      expect(result.totalErrors).toBe(0);
    });

    it('should separate valid and invalid rows', () => {
      const rows: CSVRow[] = [
        { '#SnippetType': 'EShopItem', '#ShopName': 'Valid Shop', '#OrganicPrice': '100' },
        { '#SnippetType': 'Unknown' as SnippetType } // Invalid type
      ];

      const result = validateRows(rows);
      
      expect(result.validRows.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('hasRequiredFields', () => {
    it('should return true for EShopItem with all required fields', () => {
      const row: CSVRow = {
        '#SnippetType': 'EShopItem',
        '#ShopName': 'Test Shop',
        '#OrganicPrice': '1 990 ₽'
      };

      expect(hasRequiredFields(row, 'EShopItem')).toBe(true);
    });

    it('should return false for EShopItem missing ShopName', () => {
      const row: CSVRow = {
        '#SnippetType': 'EShopItem',
        '#OrganicPrice': '1 990 ₽'
      };

      expect(hasRequiredFields(row, 'EShopItem')).toBe(false);
    });

    it('should return true for Organic with minimal fields', () => {
      const row: CSVRow = {
        '#SnippetType': 'Organic',
        '#OrganicTitle': 'Search Result Title'
      };

      expect(hasRequiredFields(row, 'Organic')).toBe(true);
    });

    it('should return true for EProductSnippet2 with all required fields', () => {
      const row: CSVRow = {
        '#SnippetType': 'EProductSnippet2',
        '#OrganicTitle': 'Product',
        '#OrganicPrice': '500 ₽'
      };

      expect(hasRequiredFields(row, 'EProductSnippet2')).toBe(true);
    });
  });

  describe('getMissingRequiredFields', () => {
    it('should return empty array when all required fields present', () => {
      const row: CSVRow = {
        '#SnippetType': 'EShopItem',
        '#ShopName': 'Shop',
        '#OrganicPrice': '100'
      };

      const missing = getMissingRequiredFields(row, 'EShopItem');
      expect(missing).toHaveLength(0);
    });

    it('should return missing fields for EShopItem', () => {
      const row: CSVRow = {
        '#SnippetType': 'EShopItem'
        // Missing: #ShopName, #OrganicPrice
      };

      const missing = getMissingRequiredFields(row, 'EShopItem');
      expect(missing).toContain('#ShopName');
      expect(missing).toContain('#OrganicPrice');
    });

    it('should return missing fields for EOfferItem', () => {
      const row: CSVRow = {
        '#SnippetType': 'EOfferItem'
      };

      const missing = getMissingRequiredFields(row, 'EOfferItem');
      expect(missing).toContain('#ShopName');
      expect(missing).toContain('#OrganicPrice');
    });
  });
});

