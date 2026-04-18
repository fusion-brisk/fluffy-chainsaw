/**
 * tree-to-css — converts Figma node visual properties to an inline CSS string.
 *
 * Scope: sandbox (ES5 via Babel). No Figma API calls — pure transform.
 */

export interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface FigmaPaint {
  type: string;
  color?: RgbaColor;
}

export interface FigmaEffect {
  type: string;
  visible?: boolean;
  offset?: { x: number; y: number };
  radius?: number;
  color?: RgbaColor;
}

export interface FigmaTextStyle {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  lineHeightPx?: number;
  textAlignHorizontal?: string;
}

export interface FigmaBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CssNodeProps {
  layoutMode?: 'HORIZONTAL' | 'VERTICAL' | 'NONE';
  itemSpacing?: number;
  paddingTop?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  paddingRight?: number;
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  layoutSizingHorizontal?: 'FIXED' | 'HUG' | 'FILL';
  layoutSizingVertical?: 'FIXED' | 'HUG' | 'FILL';
  fills?: FigmaPaint[];
  strokes?: FigmaPaint[];
  strokeWeight?: number;
  cornerRadius?: number;
  opacity?: number;
  clipsContent?: boolean;
  effects?: FigmaEffect[];
  style?: FigmaTextStyle;
  absoluteBoundingBox?: FigmaBoundingBox;
}

function toChannel(value: number): number {
  return Math.round(value * 255);
}

function rgba(color: RgbaColor): string {
  return (
    'rgba(' +
    toChannel(color.r) +
    ', ' +
    toChannel(color.g) +
    ', ' +
    toChannel(color.b) +
    ', ' +
    color.a +
    ')'
  );
}

function mapPrimaryAxis(value: string): string {
  if (value === 'SPACE_BETWEEN') return 'space-between';
  if (value === 'CENTER') return 'center';
  if (value === 'MAX') return 'flex-end';
  return 'flex-start';
}

function mapCounterAxis(value: string): string {
  if (value === 'CENTER') return 'center';
  if (value === 'MAX') return 'flex-end';
  if (value === 'BASELINE') return 'baseline';
  return 'flex-start';
}

function mapTextAlign(value: string): string {
  if (value === 'CENTER') return 'center';
  if (value === 'RIGHT') return 'right';
  if (value === 'JUSTIFIED') return 'justify';
  return 'left';
}

/**
 * Converts a subset of Figma node properties to a semicolon-joined CSS string.
 * Returns empty string when no visual properties are present.
 */
export function nodeToCss(node: CssNodeProps): string {
  const parts: string[] = [];

  // Layout (auto-layout → flexbox)
  if (node.layoutMode === 'HORIZONTAL' || node.layoutMode === 'VERTICAL') {
    parts.push('display: flex');
    parts.push('flex-direction: ' + (node.layoutMode === 'HORIZONTAL' ? 'row' : 'column'));
    if (node.itemSpacing !== undefined) {
      parts.push('gap: ' + node.itemSpacing + 'px');
    }
  }

  // Padding
  if (
    node.paddingTop !== undefined ||
    node.paddingBottom !== undefined ||
    node.paddingLeft !== undefined ||
    node.paddingRight !== undefined
  ) {
    const top = node.paddingTop || 0;
    const bottom = node.paddingBottom || 0;
    const left = node.paddingLeft || 0;
    const right = node.paddingRight || 0;
    parts.push('padding: ' + top + 'px ' + right + 'px ' + bottom + 'px ' + left + 'px');
  }

  // Alignment (only meaningful in flex context, but emit regardless for completeness)
  if (node.primaryAxisAlignItems !== undefined) {
    parts.push('justify-content: ' + mapPrimaryAxis(node.primaryAxisAlignItems));
  }
  if (node.counterAxisAlignItems !== undefined) {
    parts.push('align-items: ' + mapCounterAxis(node.counterAxisAlignItems));
  }

  // Sizing
  if (node.layoutSizingHorizontal === 'FILL' || node.layoutSizingVertical === 'FILL') {
    parts.push('flex: 1');
  }

  // Dimensions from bounding box
  if (node.absoluteBoundingBox) {
    parts.push('width: ' + node.absoluteBoundingBox.width + 'px');
    parts.push('height: ' + node.absoluteBoundingBox.height + 'px');
  }

  // Background fill (first SOLID only)
  if (node.fills && node.fills.length > 0) {
    for (let i = 0; i < node.fills.length; i++) {
      const fill = node.fills[i];
      if (fill.type === 'SOLID' && fill.color) {
        parts.push('background-color: ' + rgba(fill.color));
        break;
      }
    }
  }

  // Border from strokes (first SOLID only)
  if (node.strokes && node.strokes.length > 0 && node.strokeWeight !== undefined) {
    for (let i = 0; i < node.strokes.length; i++) {
      const stroke = node.strokes[i];
      if (stroke.type === 'SOLID' && stroke.color) {
        parts.push('border: ' + node.strokeWeight + 'px solid ' + rgba(stroke.color));
        break;
      }
    }
  }

  // Corner radius
  if (node.cornerRadius !== undefined) {
    parts.push('border-radius: ' + node.cornerRadius + 'px');
  }

  // Opacity
  if (node.opacity !== undefined) {
    parts.push('opacity: ' + node.opacity);
  }

  // Clip content
  if (node.clipsContent) {
    parts.push('overflow: hidden');
  }

  // Drop shadow effects
  if (node.effects && node.effects.length > 0) {
    const shadows: string[] = [];
    for (let i = 0; i < node.effects.length; i++) {
      const effect = node.effects[i];
      if (
        effect.type === 'DROP_SHADOW' &&
        effect.visible !== false &&
        effect.color &&
        effect.offset
      ) {
        shadows.push(
          effect.offset.x +
            'px ' +
            effect.offset.y +
            'px ' +
            (effect.radius || 0) +
            'px ' +
            rgba(effect.color),
        );
      }
    }
    if (shadows.length > 0) {
      parts.push('box-shadow: ' + shadows.join(', '));
    }
  }

  // Text style
  if (node.style) {
    const s = node.style;
    if (s.fontFamily) {
      parts.push("font-family: '" + s.fontFamily + "', sans-serif");
    }
    if (s.fontSize !== undefined) {
      parts.push('font-size: ' + s.fontSize + 'px');
    }
    if (s.fontWeight !== undefined) {
      parts.push('font-weight: ' + s.fontWeight);
    }
    if (s.lineHeightPx !== undefined) {
      parts.push('line-height: ' + s.lineHeightPx + 'px');
    }
    if (s.textAlignHorizontal !== undefined) {
      parts.push('text-align: ' + mapTextAlign(s.textAlignHorizontal));
    }
  }

  return parts.join('; ');
}
