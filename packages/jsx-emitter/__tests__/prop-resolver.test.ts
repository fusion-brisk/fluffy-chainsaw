import { describe, it, expect } from 'vitest';
import { resolveProps, stripHashSuffix, toCamelCase } from '../src/prop-resolver';
import type { ComponentMapping } from '../src/types';

describe('stripHashSuffix', () => {
  it('strips Figma hash suffix', () => {
    expect(stripHashSuffix('withButton#123:0')).toBe('withButton');
    expect(stripHashSuffix('Dot indicator#6083:11')).toBe('Dot indicator');
  });

  it('returns name as-is if no suffix', () => {
    expect(stripHashSuffix('Platform')).toBe('Platform');
    expect(stripHashSuffix('withDelivery')).toBe('withDelivery');
  });

  it('strips hash suffix with non-digit characters', () => {
    expect(stripHashSuffix('withButton#abc:0')).toBe('withButton');
    expect(stripHashSuffix('Favorite#9399:7')).toBe('Favorite');
  });
});

describe('toCamelCase', () => {
  it('lowercases first letter', () => {
    expect(toCamelCase('Platform')).toBe('platform');
  });

  it('handles space-separated words', () => {
    expect(toCamelCase('Grid | List Control')).toBe('gridListControl');
  });

  it('keeps already camelCase', () => {
    expect(toCamelCase('withButton')).toBe('withButton');
  });

  it('handles hyphens and underscores', () => {
    expect(toCamelCase('some-prop_name')).toBe('somePropName');
  });
});

describe('resolveProps', () => {
  it('resolves boolean props and strips hash suffix', () => {
    const figmaProps = {
      'withButton#123:0': { type: 'BOOLEAN', value: true },
      'withDelivery#456:1': { type: 'BOOLEAN', value: false },
    };

    const result = resolveProps(figmaProps, undefined);
    expect(result).toEqual({
      withButton: true,
      withDelivery: false,
    });
  });

  it('resolves variant props', () => {
    const figmaProps = {
      Platform: { type: 'VARIANT', value: 'Desktop' },
      Size: { type: 'VARIANT', value: 'M' },
    };

    const result = resolveProps(figmaProps, undefined);
    expect(result).toEqual({
      platform: 'Desktop',
      size: 'M',
    });
  });

  it('resolves text props', () => {
    const figmaProps = {
      organicTitle: { type: 'TEXT', value: 'Hello World' },
    };

    const result = resolveProps(figmaProps, undefined);
    expect(result).toEqual({
      organicTitle: 'Hello World',
    });
  });

  it('uses propMap to rename props', () => {
    const mapping: ComponentMapping = {
      importPath: '@oceania/depot/components/Foo',
      componentName: 'Foo',
      propMap: { withBtn: 'hasButton', Size: 'size' },
    };

    const figmaProps = {
      withBtn: { type: 'BOOLEAN', value: true },
      Size: { type: 'VARIANT', value: 'L' },
    };

    const result = resolveProps(figmaProps, mapping);
    expect(result).toEqual({
      hasButton: true,
      size: 'L',
    });
  });

  it('skips ignored props', () => {
    const mapping: ComponentMapping = {
      importPath: '@oceania/depot/components/Foo',
      componentName: 'Foo',
      propMap: {},
      ignoredProps: ['Platform'],
    };

    const figmaProps = {
      Platform: { type: 'VARIANT', value: 'Desktop' },
      size: { type: 'VARIANT', value: 'M' },
    };

    const result = resolveProps(figmaProps, mapping);
    expect(result).toEqual({ size: 'M' });
    expect(result).not.toHaveProperty('platform');
  });

  it('returns empty object for undefined input', () => {
    expect(resolveProps(undefined, undefined)).toEqual({});
  });

  it('skips INSTANCE_SWAP type props', () => {
    const figmaProps = {
      icon: { type: 'INSTANCE_SWAP', value: '123:456' as unknown as boolean },
    };
    const result = resolveProps(figmaProps, undefined);
    expect(result).toEqual({});
  });
});
