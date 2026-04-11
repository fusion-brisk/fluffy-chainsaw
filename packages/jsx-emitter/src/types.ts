/** Minimal Figma node representation from REST API response */
export interface FigmaNode {
  id: string;
  name: string;
  type:
    | 'FRAME'
    | 'INSTANCE'
    | 'COMPONENT'
    | 'COMPONENT_SET'
    | 'TEXT'
    | 'RECTANGLE'
    | 'GROUP'
    | 'VECTOR'
    | 'ELLIPSE'
    | 'SECTION'
    | string;
  children?: FigmaNode[];

  // Layout
  layoutMode?: 'HORIZONTAL' | 'VERTICAL' | 'NONE';
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  itemSpacing?: number;

  // Size
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  layoutSizingHorizontal?: 'FIXED' | 'HUG' | 'FILL';
  layoutSizingVertical?: 'FIXED' | 'HUG' | 'FILL';

  // Instance-specific
  componentId?: string;
  componentProperties?: Record<
    string,
    {
      type: string;
      value: string | boolean;
    }
  >;

  // Text-specific
  characters?: string;
  style?: {
    fontFamily?: string;
    fontWeight?: number;
    fontSize?: number;
    lineHeightPx?: number;
    textAlignHorizontal?: string;
  };

  // Fills
  fills?: Array<{
    type: string;
    color?: { r: number; g: number; b: number; a: number };
    imageRef?: string;
  }>;
}

/** Intermediate tree produced by tree-walker */
export interface ComponentTreeNode {
  /** Node kind in JSX context */
  kind: 'component' | 'layout' | 'text' | 'image' | 'unknown';

  /** For kind=component: resolved React mapping */
  mapping?: ComponentMapping;

  /** Original Figma node name (for debug and fallback) */
  figmaName: string;
  figmaId: string;
  figmaType: string;

  /** Resolved React props */
  props: Record<string, string | boolean | number>;

  /** CSS-like styles for layout nodes */
  style?: Record<string, string | number>;

  /** Text content (for kind=text) */
  text?: string;

  /** Image reference (for kind=image) */
  imageRef?: string;

  children: ComponentTreeNode[];
}

export interface ComponentMapping {
  /** React import path */
  importPath: string;
  /** React component name */
  componentName: string;
  /** Figma prop name -> React prop name */
  propMap: Record<string, string>;
  /** Props to omit from JSX output */
  ignoredProps?: string[];
}

export interface EmitterOptions {
  /** Indent: number of spaces */
  indent?: number;
  /** Wrap output in fragment, div, or nothing */
  rootWrapper?: 'fragment' | 'div' | 'none';
  /** Include inline styles for layout nodes */
  includeStyles?: boolean;
  /** Include TODO comments for unmapped nodes */
  includeTodos?: boolean;
}
