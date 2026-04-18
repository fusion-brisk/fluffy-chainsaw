import { describe, it, expect } from 'vitest';
import { buildExportHtml } from '../../src/sandbox/html-export/export-handler';

describe('buildExportHtml', () => {
  it('produces valid HTML from a simple frame', () => {
    var result = buildExportHtml({
      id: '1:1',
      name: 'TestCard',
      type: 'FRAME',
      children: [{ id: '1:2', name: 'Title', type: 'TEXT', characters: 'Product Name' }],
    });
    expect(result.html).toContain('<!DOCTYPE html>');
    expect(result.html).toContain('TestCard');
    expect(result.html).toContain('Product Name');
    expect(result.fileName).toBe('TestCard.html');
  });

  it('includes JSX imports for mapped components', () => {
    var result = buildExportHtml({
      id: '2:1',
      name: 'Card',
      type: 'FRAME',
      children: [
        {
          id: '2:2',
          name: 'EProductSnippet2',
          type: 'INSTANCE',
          componentProperties: { type: { type: 'VARIANT', value: 'organic' } },
        },
      ],
    });
    expect(result.html).toContain('EProductSnippet2');
    expect(result.html).toContain('@oceania/depot');
  });

  it('includes both code and preview panels', () => {
    var result = buildExportHtml({
      id: '3:1',
      name: 'Layout',
      type: 'FRAME',
      children: [{ id: '3:2', name: 'L', type: 'TEXT', characters: 'Hello' }],
    });
    expect(result.html).toContain('panel-code');
    expect(result.html).toContain('panel-preview');
  });

  it('sanitizes file name', () => {
    var result = buildExportHtml({
      id: '4:1',
      name: 'My Frame / Slashes & Stuff!',
      type: 'FRAME',
      children: [{ id: '4:2', name: 'T', type: 'TEXT', characters: 'x' }],
    });
    expect(result.fileName).toBe('My-Frame---Slashes---Stuff-.html');
  });

  it('embeds base64 images from imageMap', () => {
    var result = buildExportHtml(
      {
        id: '5:1',
        name: 'WithImage',
        type: 'FRAME',
        children: [
          {
            id: '5:2',
            name: 'Img',
            type: 'RECTANGLE',
            fills: [{ type: 'IMAGE', imageRef: 'ref1' }],
          },
        ],
      },
      { ref1: 'data:image/png;base64,AAAA' },
    );
    expect(result.html).toContain('data:image/png;base64,AAAA');
  });
});
