import { describe, it, expect } from 'vitest';
import { emitJSX } from '../src/jsx-emitter';
import type { ComponentTreeNode } from '../src/types';

describe('emitJSX', () => {
  it('renders single mapped component with correct import', () => {
    const tree: ComponentTreeNode = {
      kind: 'component',
      mapping: {
        importPath: '@oceania/depot/components/EProductSnippet2',
        componentName: 'EProductSnippet2',
        propMap: {},
      },
      figmaName: 'EProductSnippet2',
      figmaId: '1:1',
      figmaType: 'INSTANCE',
      props: { type: 'organic', selected: false },
      children: [],
    };

    const { jsx, imports } = emitJSX(tree, { rootWrapper: 'none' });

    expect(imports).toBe(
      "import { EProductSnippet2 } from '@oceania/depot/components/EProductSnippet2';",
    );
    expect(jsx).toContain('<EProductSnippet2');
    expect(jsx).toContain('type="organic"');
    expect(jsx).toContain('selected={false}');
    expect(jsx).toContain('/>');
  });

  it('renders layout with mixed children', () => {
    const tree: ComponentTreeNode = {
      kind: 'layout',
      figmaName: 'Container',
      figmaId: '2:1',
      figmaType: 'FRAME',
      props: {},
      style: { display: 'flex', flexDirection: 'column', gap: 8 },
      children: [
        {
          kind: 'component',
          mapping: {
            importPath: '@oceania/depot/components/EPrice',
            componentName: 'EPrice',
            propMap: {},
          },
          figmaName: 'EPrice',
          figmaId: '2:2',
          figmaType: 'INSTANCE',
          props: { size: 'l', view: 'special' },
          children: [],
        },
        {
          kind: 'text',
          figmaName: 'Description',
          figmaId: '2:3',
          figmaType: 'TEXT',
          props: {},
          text: 'Best price',
          children: [],
        },
      ],
    };

    const { jsx, imports } = emitJSX(tree, { rootWrapper: 'none', includeStyles: true });

    expect(imports).toContain("import { EPrice } from '@oceania/depot/components/EPrice';");
    expect(jsx).toContain('style={');
    expect(jsx).toContain('"flexDirection":"column"');
    expect(jsx).toContain('<EPrice');
    expect(jsx).toContain('<span>Best price</span>');
  });

  it('renders TODO comment for unknown nodes', () => {
    const tree: ComponentTreeNode = {
      kind: 'unknown',
      figmaName: 'WeirdShape',
      figmaId: '3:1',
      figmaType: 'VECTOR',
      props: {},
      children: [],
    };

    const { jsx } = emitJSX(tree, { rootWrapper: 'none', includeTodos: true });
    expect(jsx).toContain('{/* TODO: unknown node "WeirdShape" (VECTOR) */}');
  });

  it('omits TODO for unknown when includeTodos=false', () => {
    const tree: ComponentTreeNode = {
      kind: 'unknown',
      figmaName: 'WeirdShape',
      figmaId: '3:1',
      figmaType: 'VECTOR',
      props: {},
      children: [],
    };

    const { jsx } = emitJSX(tree, { rootWrapper: 'none', includeTodos: false });
    expect(jsx).toBe('');
  });

  it('renders image node with ref', () => {
    const tree: ComponentTreeNode = {
      kind: 'image',
      figmaName: 'ProductImage',
      figmaId: '4:1',
      figmaType: 'RECTANGLE',
      props: {},
      imageRef: 'img_abc123',
      children: [],
    };

    const { jsx } = emitJSX(tree, { rootWrapper: 'none' });
    expect(jsx).toContain('<img');
    expect(jsx).toContain('img_abc123');
    expect(jsx).toContain('alt="ProductImage"');
  });

  it('wraps output in fragment by default', () => {
    const tree: ComponentTreeNode = {
      kind: 'text',
      figmaName: 'Hello',
      figmaId: '5:1',
      figmaType: 'TEXT',
      props: {},
      text: 'Hello',
      children: [],
    };

    const { jsx } = emitJSX(tree);
    expect(jsx).toMatch(/^<>/);
    expect(jsx).toMatch(/<\/>$/);
  });

  it('deduplicates imports from same path', () => {
    const tree: ComponentTreeNode = {
      kind: 'layout',
      figmaName: 'List',
      figmaId: '6:1',
      figmaType: 'FRAME',
      props: {},
      children: [
        {
          kind: 'component',
          mapping: {
            importPath: '@oceania/depot/components/Line',
            componentName: 'Line',
            propMap: {},
          },
          figmaName: 'Line1',
          figmaId: '6:2',
          figmaType: 'INSTANCE',
          props: {},
          children: [],
        },
        {
          kind: 'component',
          mapping: {
            importPath: '@oceania/depot/components/Line',
            componentName: 'Line',
            propMap: {},
          },
          figmaName: 'Line2',
          figmaId: '6:3',
          figmaType: 'INSTANCE',
          props: {},
          children: [],
        },
      ],
    };

    const { imports } = emitJSX(tree, { rootWrapper: 'none' });
    // Should appear exactly once
    const lineImports = imports.split('\n').filter((l) => l.includes('Line'));
    expect(lineImports).toHaveLength(1);
  });

  it('renders boolean true prop as shorthand', () => {
    const tree: ComponentTreeNode = {
      kind: 'component',
      mapping: {
        importPath: '@oceania/depot/components/EButton',
        componentName: 'EButton',
        propMap: {},
      },
      figmaName: 'EButton',
      figmaId: '7:1',
      figmaType: 'INSTANCE',
      props: { withIcon: true },
      children: [],
    };

    const { jsx } = emitJSX(tree, { rootWrapper: 'none' });
    expect(jsx).toContain(' withIcon />');
    expect(jsx).not.toContain('withIcon={true}');
  });

  it('escapes */ in figmaName to prevent JSX comment injection', () => {
    const tree: ComponentTreeNode = {
      kind: 'unknown',
      figmaName: 'evil */} <script>alert(1)</script> {/*',
      figmaId: '8:1',
      figmaType: 'VECTOR',
      props: {},
      children: [],
    };

    const { jsx } = emitJSX(tree, { rootWrapper: 'none', includeTodos: true });
    // The injected */ must be escaped to "* /" — the only */ should be the legitimate comment close
    expect(jsx).toContain('evil * /');
    expect(jsx).not.toContain('evil */');
  });

  it('escapes */ in imageRef comment', () => {
    const tree: ComponentTreeNode = {
      kind: 'image',
      figmaName: 'ProductImage',
      figmaId: '9:1',
      figmaType: 'RECTANGLE',
      props: {},
      imageRef: 'ref */} onClick={hack()} {/*',
      children: [],
    };

    const { jsx } = emitJSX(tree, { rootWrapper: 'none' });
    expect(jsx).toContain('ref * /');
    expect(jsx).not.toContain('ref */');
  });

  it('escapes */ in layout figmaName comment', () => {
    const tree: ComponentTreeNode = {
      kind: 'layout',
      figmaName: 'Container */} <Injected /> {/*',
      figmaId: '10:1',
      figmaType: 'FRAME',
      props: {},
      children: [
        {
          kind: 'text',
          figmaName: 'Text',
          figmaId: '10:2',
          figmaType: 'TEXT',
          props: {},
          text: 'Hello',
          children: [],
        },
      ],
    };

    const { jsx } = emitJSX(tree, { rootWrapper: 'none', includeTodos: true });
    expect(jsx).toContain('Container * /');
    expect(jsx).not.toContain('Container */');
  });
});
