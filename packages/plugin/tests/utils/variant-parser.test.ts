/**
 * Tests for variant-parser — pure functions, no Figma mocks needed
 */

import { describe, it, expect } from 'vitest';
import {
  parseVariantSyntax,
  detectPropertyType,
  normalizeVariantValue,
} from '../../src/sandbox/variant-parser';

// ============================================================================
// parseVariantSyntax
// ============================================================================

describe('parseVariantSyntax', () => {
  it('parses simple "Key=Value"', () => {
    expect(parseVariantSyntax('Platform=Desktop')).toEqual({
      propName: 'Platform',
      propValue: 'Desktop',
    });
  });

  it('trims surrounding whitespace', () => {
    expect(parseVariantSyntax('  Platform=Desktop  ')).toEqual({
      propName: 'Platform',
      propValue: 'Desktop',
    });
  });

  it('trims whitespace around equals sign', () => {
    expect(parseVariantSyntax('Platform = Desktop')).toEqual({
      propName: 'Platform',
      propValue: 'Desktop',
    });
  });

  it('handles value with spaces', () => {
    expect(parseVariantSyntax('Label=Some Long Text')).toEqual({
      propName: 'Label',
      propValue: 'Some Long Text',
    });
  });

  it('handles value containing equals sign', () => {
    expect(parseVariantSyntax('Formula=a=b')).toEqual({
      propName: 'Formula',
      propValue: 'a=b',
    });
  });

  it('returns null for empty string', () => {
    expect(parseVariantSyntax('')).toBeNull();
  });

  it('returns null for non-string input', () => {
    // @ts-expect-error — testing runtime guard
    expect(parseVariantSyntax(null)).toBeNull();
    // @ts-expect-error — testing runtime guard
    expect(parseVariantSyntax(undefined)).toBeNull();
    // @ts-expect-error — testing runtime guard
    expect(parseVariantSyntax(123)).toBeNull();
  });

  it('returns null for string without equals', () => {
    expect(parseVariantSyntax('NoEqualsHere')).toBeNull();
  });

  it('returns null for "=value" (empty key)', () => {
    expect(parseVariantSyntax('=value')).toBeNull();
  });

  it('returns null for "key=" (empty value)', () => {
    expect(parseVariantSyntax('key=')).toBeNull();
  });

  it('returns null for bare "="', () => {
    expect(parseVariantSyntax('=')).toBeNull();
  });

  it('returns null for whitespace-only key', () => {
    expect(parseVariantSyntax('   =value')).toBeNull();
  });
});

// ============================================================================
// detectPropertyType
// ============================================================================

describe('detectPropertyType', () => {
  it('returns VARIANT_WITH_OPTIONS when options array is non-empty', () => {
    expect(
      detectPropertyType({
        type: 'VARIANT',
        value: 'Desktop',
        options: ['Desktop', 'Touch'],
      }),
    ).toBe('VARIANT_WITH_OPTIONS');
  });

  it('returns VARIANT_NO_OPTIONS for VARIANT type without options', () => {
    expect(
      detectPropertyType({
        type: 'VARIANT',
        value: 'Desktop',
      }),
    ).toBe('VARIANT_NO_OPTIONS');
  });

  it('returns VARIANT_NO_OPTIONS for VARIANT with empty options array', () => {
    expect(
      detectPropertyType({
        type: 'VARIANT',
        value: 'Desktop',
        options: [],
      }),
    ).toBe('VARIANT_NO_OPTIONS');
  });

  it('returns BOOLEAN when value is boolean true', () => {
    expect(
      detectPropertyType({
        type: 'BOOLEAN',
        value: true,
      }),
    ).toBe('BOOLEAN');
  });

  it('returns BOOLEAN when value is boolean false', () => {
    expect(
      detectPropertyType({
        type: 'BOOLEAN',
        value: false,
      }),
    ).toBe('BOOLEAN');
  });

  it('returns UNKNOWN for null', () => {
    expect(detectPropertyType(null)).toBe('UNKNOWN');
  });

  it('returns UNKNOWN for undefined', () => {
    expect(detectPropertyType(undefined)).toBe('UNKNOWN');
  });

  it('returns UNKNOWN for non-object', () => {
    expect(detectPropertyType('string')).toBe('UNKNOWN');
    expect(detectPropertyType(42)).toBe('UNKNOWN');
  });

  it('returns UNKNOWN for unrecognized type without boolean value', () => {
    expect(
      detectPropertyType({
        type: 'TEXT',
        value: 'hello',
      }),
    ).toBe('UNKNOWN');
  });

  it('prioritizes VARIANT_WITH_OPTIONS over other checks', () => {
    // Has options AND boolean value — options win
    expect(
      detectPropertyType({
        type: 'VARIANT',
        value: true,
        options: ['true', 'false'],
      }),
    ).toBe('VARIANT_WITH_OPTIONS');
  });
});

// ============================================================================
// normalizeVariantValue
// ============================================================================

describe('normalizeVariantValue', () => {
  const options = ['Desktop', 'Touch', 'true', 'false'] as const;

  it('returns exact match when found', () => {
    expect(normalizeVariantValue('Desktop', options)).toBe('Desktop');
  });

  it('returns case-insensitive match', () => {
    expect(normalizeVariantValue('desktop', options)).toBe('Desktop');
    expect(normalizeVariantValue('DESKTOP', options)).toBe('Desktop');
    expect(normalizeVariantValue('touch', options)).toBe('Touch');
  });

  it('prefers exact match over case-insensitive', () => {
    const mixed = ['ABC', 'abc'] as const;
    expect(normalizeVariantValue('abc', mixed)).toBe('abc');
    expect(normalizeVariantValue('ABC', mixed)).toBe('ABC');
  });

  it('returns null when no match found', () => {
    expect(normalizeVariantValue('Mobile', options)).toBeNull();
  });

  it('handles boolean string "true"', () => {
    expect(normalizeVariantValue('true', options)).toBe('true');
    expect(normalizeVariantValue('True', options)).toBe('true');
    expect(normalizeVariantValue('TRUE', options)).toBe('true');
  });

  it('handles boolean string "false"', () => {
    expect(normalizeVariantValue('false', options)).toBe('false');
    expect(normalizeVariantValue('False', options)).toBe('false');
  });

  it('maps "true" to "1" when options contain "1"', () => {
    const numericOptions = ['0', '1'] as const;
    expect(normalizeVariantValue('true', numericOptions)).toBe('1');
  });

  it('maps "false" to "0" when options contain "0"', () => {
    const numericOptions = ['0', '1'] as const;
    expect(normalizeVariantValue('false', numericOptions)).toBe('0');
  });

  it('returns null for empty options array', () => {
    expect(normalizeVariantValue('Desktop', [])).toBeNull();
  });

  it('handles single-element options', () => {
    expect(normalizeVariantValue('yes', ['Yes'])).toBe('Yes');
    expect(normalizeVariantValue('no', ['Yes'])).toBeNull();
  });
});
