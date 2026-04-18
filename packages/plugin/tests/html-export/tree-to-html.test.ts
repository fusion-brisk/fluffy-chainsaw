import { describe, it, expect } from 'vitest';
import { nodeToHtml } from '../../src/sandbox/html-export/tree-to-html';

describe('nodeToHtml', () => {
  it('renders TEXT node as span with styled text', () => {
    const html = nodeToHtml({
      id: '1:1',
      name: 'Title',
      type: 'TEXT',
      characters: 'Hello World',
      style: { fontSize: 16, fontWeight: 700 },
    });
    expect(html).toContain('<span');
    expect(html).toContain('Hello World');
    expect(html).toContain('font-size: 16px');
  });

  it('renders FRAME with children as nested divs', () => {
    const html = nodeToHtml({
      id: '2:1',
      name: 'Container',
      type: 'FRAME',
      layoutMode: 'VERTICAL',
      itemSpacing: 8,
      children: [
        { id: '2:2', name: 'A', type: 'TEXT', characters: 'Name' },
        { id: '2:3', name: 'B', type: 'TEXT', characters: 'Price' },
      ],
    });
    expect(html).toContain('<div');
    expect(html).toContain('flex-direction: column');
    expect(html).toContain('Name');
    expect(html).toContain('Price');
  });

  it('renders IMAGE fill with base64 from imageMap', () => {
    const html = nodeToHtml(
      {
        id: '3:1',
        name: 'Photo',
        type: 'RECTANGLE',
        fills: [{ type: 'IMAGE', imageRef: 'abc' }],
      },
      { abc: 'data:image/png;base64,AAAA' },
    );
    expect(html).toContain('src="data:image/png;base64,AAAA"');
  });

  it('renders IMAGE fill with placeholder when no imageMap', () => {
    const html = nodeToHtml({
      id: '3:2',
      name: 'Photo',
      type: 'RECTANGLE',
      fills: [{ type: 'IMAGE', imageRef: 'xyz' }],
    });
    expect(html).toContain('<img');
    expect(html).toContain('alt="Photo"');
  });

  it('escapes HTML in text content', () => {
    const html = nodeToHtml({
      id: '4:1',
      name: 'XSS',
      type: 'TEXT',
      characters: '<script>alert("xss")</script>',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders leaf node as HTML comment', () => {
    const html = nodeToHtml({ id: '5:1', name: 'Spacer', type: 'RECTANGLE' });
    expect(html).toContain('<!-- Spacer -->');
  });

  it('handles nested structure correctly', () => {
    const html = nodeToHtml({
      id: '6:1',
      name: 'Root',
      type: 'FRAME',
      children: [
        {
          id: '6:2',
          name: 'Row',
          type: 'FRAME',
          layoutMode: 'HORIZONTAL',
          children: [{ id: '6:3', name: 'A', type: 'TEXT', characters: 'AAA' }],
        },
      ],
    });
    expect(html).toContain('AAA');
    expect((html.match(/<div/g) || []).length).toBe(2);
  });
});
