import { describe, it, expect } from 'vitest';
import { nodeToCss } from '../../src/sandbox/html-export/tree-to-css';

describe('nodeToCss', () => {
  it('converts horizontal layout to flexbox', () => {
    const css = nodeToCss({ layoutMode: 'HORIZONTAL', itemSpacing: 8 });
    expect(css).toContain('display: flex');
    expect(css).toContain('flex-direction: row');
    expect(css).toContain('gap: 8px');
  });

  it('converts vertical layout with padding', () => {
    const css = nodeToCss({
      layoutMode: 'VERTICAL',
      itemSpacing: 16,
      paddingTop: 12,
      paddingBottom: 12,
      paddingLeft: 16,
      paddingRight: 16,
    });
    expect(css).toContain('flex-direction: column');
    expect(css).toContain('gap: 16px');
    expect(css).toContain('padding: 12px 16px 12px 16px');
  });

  it('converts solid fill to background-color', () => {
    const css = nodeToCss({
      fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } }],
    });
    expect(css).toContain('background-color: rgba(255, 0, 0, 1)');
  });

  it('converts text style properties', () => {
    const css = nodeToCss({
      style: {
        fontFamily: 'Inter',
        fontSize: 14,
        fontWeight: 600,
        lineHeightPx: 20,
        textAlignHorizontal: 'CENTER',
      },
    });
    expect(css).toContain("font-family: 'Inter', sans-serif");
    expect(css).toContain('font-size: 14px');
    expect(css).toContain('font-weight: 600');
    expect(css).toContain('line-height: 20px');
    expect(css).toContain('text-align: center');
  });

  it('converts border from strokes', () => {
    const css = nodeToCss({
      strokes: [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9, a: 1 } }],
      strokeWeight: 1,
    });
    expect(css).toContain('border: 1px solid rgba(230, 230, 230, 1)');
  });

  it('converts drop shadow effect', () => {
    const css = nodeToCss({
      effects: [
        {
          type: 'DROP_SHADOW',
          offset: { x: 0, y: 2 },
          radius: 4,
          color: { r: 0, g: 0, b: 0, a: 0.1 },
          visible: true,
        },
      ],
    });
    expect(css).toContain('box-shadow: 0px 2px 4px rgba(0, 0, 0, 0.1)');
  });

  it('converts cornerRadius, opacity, clipsContent', () => {
    const css = nodeToCss({ cornerRadius: 8, opacity: 0.5, clipsContent: true });
    expect(css).toContain('border-radius: 8px');
    expect(css).toContain('opacity: 0.5');
    expect(css).toContain('overflow: hidden');
  });

  it('converts dimensions from absoluteBoundingBox', () => {
    const css = nodeToCss({ absoluteBoundingBox: { x: 0, y: 0, width: 320, height: 200 } });
    expect(css).toContain('width: 320px');
    expect(css).toContain('height: 200px');
  });

  it('converts FILL sizing to flex: 1', () => {
    const css = nodeToCss({ layoutSizingHorizontal: 'FILL' });
    expect(css).toContain('flex: 1');
  });

  it('converts alignment properties', () => {
    const css = nodeToCss({
      layoutMode: 'HORIZONTAL',
      primaryAxisAlignItems: 'SPACE_BETWEEN',
      counterAxisAlignItems: 'CENTER',
    });
    expect(css).toContain('justify-content: space-between');
    expect(css).toContain('align-items: center');
  });

  it('returns empty string for node with no visual properties', () => {
    expect(nodeToCss({})).toBe('');
  });
});
