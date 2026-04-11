import { describe, it, expect } from 'vitest';
import { walkTree } from '../src/tree-walker';
import type { FigmaNode } from '../src/types';

describe('walkTree', () => {
  it('maps a known INSTANCE to kind=component with resolved props', () => {
    const node: FigmaNode = {
      id: '1:1',
      name: 'EProductSnippet2',
      type: 'INSTANCE',
      componentProperties: {
        type: { type: 'VARIANT', value: 'organic' },
        selected: { type: 'BOOLEAN', value: false },
      },
    };

    const result = walkTree(node);
    expect(result.kind).toBe('component');
    expect(result.mapping).toBeDefined();
    expect(result.mapping!.componentName).toBe('EProductSnippet2');
    expect(result.props).toEqual({
      type: 'organic',
      selected: false,
    });
    // Should not recurse into children for mapped instances
    expect(result.children).toEqual([]);
  });

  it('treats unmapped INSTANCE as layout and recurses into children', () => {
    const node: FigmaNode = {
      id: '2:1',
      name: 'SomeRandomComponent',
      type: 'INSTANCE',
      layoutMode: 'VERTICAL',
      itemSpacing: 8,
      children: [{ id: '2:2', name: 'Label', type: 'TEXT', characters: 'Hello' }],
    };

    const result = walkTree(node);
    expect(result.kind).toBe('layout');
    expect(result.mapping).toBeUndefined();
    expect(result.style).toEqual({
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    });
    expect(result.children).toHaveLength(1);
    expect(result.children[0].kind).toBe('text');
    expect(result.children[0].text).toBe('Hello');
  });

  it('maps TEXT node to kind=text', () => {
    const node: FigmaNode = {
      id: '3:1',
      name: 'Title',
      type: 'TEXT',
      characters: 'Yandex Market',
    };

    const result = walkTree(node);
    expect(result.kind).toBe('text');
    expect(result.text).toBe('Yandex Market');
  });

  it('maps node with IMAGE fill to kind=image', () => {
    const node: FigmaNode = {
      id: '4:1',
      name: 'ProductPhoto',
      type: 'RECTANGLE',
      fills: [{ type: 'IMAGE', imageRef: 'abc123' }],
    };

    const result = walkTree(node);
    expect(result.kind).toBe('image');
    expect(result.imageRef).toBe('abc123');
  });

  it('maps IMAGE fill with empty imageRef (not yet uploaded)', () => {
    const node: FigmaNode = {
      id: '4:2',
      name: 'PendingImage',
      type: 'RECTANGLE',
      fills: [{ type: 'IMAGE' }],
    };

    const result = walkTree(node);
    expect(result.kind).toBe('image');
    expect(result.imageRef).toBe('');
  });

  it('handles nested FRAME hierarchy with layout styles', () => {
    const node: FigmaNode = {
      id: '5:1',
      name: 'Container',
      type: 'FRAME',
      layoutMode: 'VERTICAL',
      itemSpacing: 16,
      paddingTop: 12,
      paddingBottom: 12,
      children: [
        {
          id: '5:2',
          name: 'Row',
          type: 'FRAME',
          layoutMode: 'HORIZONTAL',
          itemSpacing: 8,
          primaryAxisAlignItems: 'SPACE_BETWEEN',
          counterAxisAlignItems: 'CENTER',
          children: [
            { id: '5:3', name: 'Name', type: 'TEXT', characters: 'Item A' },
            { id: '5:4', name: 'Price', type: 'TEXT', characters: '1 500 ₽' },
          ],
        },
      ],
    };

    const result = walkTree(node);
    expect(result.kind).toBe('layout');
    expect(result.style).toEqual({
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      paddingTop: 12,
      paddingBottom: 12,
    });

    const row = result.children[0];
    expect(row.kind).toBe('layout');
    expect(row.style).toEqual({
      display: 'flex',
      flexDirection: 'row',
      gap: 8,
      justifyContent: 'space-between',
      alignItems: 'center',
    });

    expect(row.children).toHaveLength(2);
    expect(row.children[0].kind).toBe('text');
    expect(row.children[1].text).toBe('1 500 ₽');
  });

  it('maps leaf node without children to kind=unknown', () => {
    const node: FigmaNode = {
      id: '6:1',
      name: 'Divider',
      type: 'RECTANGLE',
    };

    const result = walkTree(node);
    expect(result.kind).toBe('unknown');
  });

  it('resolves variant names with slash (ESnippet/Desktop)', () => {
    const node: FigmaNode = {
      id: '7:1',
      name: 'ESnippet/Desktop',
      type: 'INSTANCE',
      componentProperties: {
        platform: { type: 'VARIANT', value: 'desktop' },
      },
    };

    const result = walkTree(node);
    expect(result.kind).toBe('component');
    expect(result.mapping!.componentName).toBe('ESnippet');
  });

  it('handles empty children array as layout (not unknown)', () => {
    const node: FigmaNode = {
      id: '8:1',
      name: 'EmptyFrame',
      type: 'FRAME',
      children: [],
    };

    // Empty children = not "has children", so it's unknown
    const result = walkTree(node);
    expect(result.kind).toBe('unknown');
  });
});
