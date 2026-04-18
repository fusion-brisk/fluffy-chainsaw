import { describe, it, expect } from 'vitest';
import { buildExportHtml } from '../../src/sandbox/html-export/export-handler';

describe('HTML Export integration', () => {
  it('produces complete HTML from a realistic Figma tree', () => {
    const result = buildExportHtml({
      id: '1:1',
      name: 'EShopItem Card',
      type: 'FRAME',
      layoutMode: 'VERTICAL',
      itemSpacing: 12,
      paddingTop: 16,
      paddingRight: 16,
      paddingBottom: 16,
      paddingLeft: 16,
      cornerRadius: 8,
      fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 } }],
      children: [
        {
          id: '1:2',
          name: 'Header',
          type: 'FRAME',
          layoutMode: 'HORIZONTAL',
          itemSpacing: 8,
          counterAxisAlignItems: 'CENTER',
          children: [
            {
              id: '1:3',
              name: 'ShopName',
              type: 'TEXT',
              characters: 'Ozon',
              style: { fontFamily: 'Inter', fontSize: 14, fontWeight: 600 },
            },
            {
              id: '1:4',
              name: 'ELabelRating',
              type: 'INSTANCE',
              componentProperties: {
                size: { type: 'VARIANT', value: 'xs' },
                view: { type: 'VARIANT', value: 'white' },
                value: { type: 'TEXT', value: '4.5' },
              },
              children: [],
            },
          ],
        },
        {
          id: '1:5',
          name: 'Title',
          type: 'TEXT',
          characters: 'Samsung Galaxy S25 Ultra 256GB',
          style: { fontFamily: 'Inter', fontSize: 16, fontWeight: 400 },
        },
        {
          id: '1:6',
          name: 'Price',
          type: 'TEXT',
          characters: '89 990 \u20BD',
          style: { fontFamily: 'Inter', fontSize: 20, fontWeight: 700 },
        },
      ],
    });

    // File name
    expect(result.fileName).toBe('EShopItem-Card.html');

    // Structure
    expect(result.html).toContain('<!DOCTYPE html>');
    expect(result.html).toContain('panel-code');
    expect(result.html).toContain('panel-preview');

    // JSX panel has imports + component
    expect(result.html).toContain('ELabelRating');
    expect(result.html).toContain('@oceania/depot');

    // Preview panel has visual content
    expect(result.html).toContain('Ozon');
    expect(result.html).toContain('Samsung Galaxy S25 Ultra');

    // Self-contained (no external URLs)
    expect(result.html).not.toMatch(/https?:\/\//);

    // Has syntax highlighting and copy
    expect(result.html).toContain('.kw');
    expect(result.html).toContain('copyCode');
  });
});
