# Export HTML Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Export HTML" button to the Figma plugin that generates a self-contained HTML file with JSX code + visual CSS preview from the current selection.

**Architecture:** Sandbox traverses Figma selection, serializes to plain object, generates JSX (reusing jsx-emitter) + visual HTML/CSS preview, assembles single-file HTML, sends to UI iframe via postMessage, UI triggers browser download. All new sandbox code in `src/sandbox/html-export/`, ES5 constraint applies.

**Tech Stack:** TypeScript (ES5 for sandbox, modern for UI), Vitest, Figma Plugin API, Rollup + Babel

---

## File Structure

### New Files (sandbox — ES5 constraint)

| File | Responsibility |
|------|---------------|
| `src/sandbox/html-export/tree-to-css.ts` | Convert Figma node properties to CSS style string |
| `src/sandbox/html-export/tree-to-html.ts` | Convert Figma node tree to HTML string with inline styles |
| `src/sandbox/html-export/html-template.ts` | Assemble final HTML document (template + JSX + preview + highlight) |
| `src/sandbox/html-export/export-handler.ts` | Orchestrate: node to JSX + preview to assembled HTML |

### New Files (tests)

| File | Covers |
|------|--------|
| `tests/html-export/tree-to-css.test.ts` | CSS mapping for layout, colors, typography, borders, shadows |
| `tests/html-export/tree-to-html.test.ts` | HTML generation for frames, text, images, nested structures |
| `tests/html-export/html-template.test.ts` | Full HTML assembly, syntax highlighting, copy script |
| `tests/html-export/export-handler.test.ts` | Selection to postMessage flow, guards |
| `tests/html-export/integration.test.ts` | End-to-end with realistic Figma tree |

### Modified Files

| File | Change |
|------|--------|
| `src/types.ts` | Add `export-html` to UIMessage, add `export-html-result`/`export-html-error` to CodeMessage |
| `src/ui/components/CompactStrip.tsx` | Add "Export HTML" menu item with `hasSelection` condition |
| `src/ui/ui.tsx` | Add `exportHtml` case to `handleMenuAction`, add download handler |
| `src/ui/hooks/usePluginMessages.ts` | Add `onExportHtmlResult`/`onExportHtmlError` handler types + cases |
| `src/sandbox/plugin/message-router.ts` | Add `export-html` handler with node serialization and image export |
| `rollup.config.mjs` | Add alias to resolve jsx-emitter source files |

---

### Task 1: tree-to-css — Figma Node to CSS Style String

**Files:**
- Create: `packages/plugin/src/sandbox/html-export/tree-to-css.ts`
- Test: `packages/plugin/tests/html-export/tree-to-css.test.ts`

- [ ] **Step 1: Write failing tests for layout CSS**

Create `packages/plugin/tests/html-export/tree-to-css.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { nodeToCss } from '../../src/sandbox/html-export/tree-to-css';

describe('nodeToCss', () => {
  it('converts horizontal layout to flexbox', () => {
    const css = nodeToCss({
      layoutMode: 'HORIZONTAL',
      itemSpacing: 8,
    });
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
      effects: [{
        type: 'DROP_SHADOW',
        offset: { x: 0, y: 2 },
        radius: 4,
        color: { r: 0, g: 0, b: 0, a: 0.1 },
        visible: true,
      }],
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
    const css = nodeToCss({
      absoluteBoundingBox: { x: 0, y: 0, width: 320, height: 200 },
    });
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -w packages/plugin -- --run tests/html-export/tree-to-css.test.ts`
Expected: FAIL with `nodeToCss` not found

- [ ] **Step 3: Implement tree-to-css**

Create `packages/plugin/src/sandbox/html-export/tree-to-css.ts`:

```typescript
/**
 * Convert Figma node visual properties to an inline CSS string.
 * ES5-safe: no Object.entries, no template literals.
 */

interface FigmaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface CssNodeProps {
  layoutMode?: string;
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  itemSpacing?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  layoutSizingHorizontal?: string;
  layoutSizingVertical?: string;
  fills?: Array<{ type: string; color?: FigmaColor }>;
  strokes?: Array<{ type: string; color?: FigmaColor }>;
  strokeWeight?: number;
  effects?: Array<{
    type: string;
    visible?: boolean;
    offset?: { x: number; y: number };
    radius?: number;
    color?: FigmaColor;
  }>;
  cornerRadius?: number;
  opacity?: number;
  clipsContent?: boolean;
  style?: {
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: number;
    lineHeightPx?: number;
    textAlignHorizontal?: string;
  };
}

function rgba(c: FigmaColor): string {
  var r = Math.round(c.r * 255);
  var g = Math.round(c.g * 255);
  var b = Math.round(c.b * 255);
  var a = Math.round(c.a * 100) / 100;
  return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + a + ')';
}

export function nodeToCss(node: CssNodeProps): string {
  var parts: string[] = [];

  // Layout
  if (node.layoutMode === 'HORIZONTAL' || node.layoutMode === 'VERTICAL') {
    parts.push('display: flex');
    parts.push('flex-direction: ' + (node.layoutMode === 'HORIZONTAL' ? 'row' : 'column'));
  }
  if (node.itemSpacing) parts.push('gap: ' + node.itemSpacing + 'px');

  // Padding
  var pt = node.paddingTop || 0;
  var pr = node.paddingRight || 0;
  var pb = node.paddingBottom || 0;
  var pl = node.paddingLeft || 0;
  if (pt || pr || pb || pl) {
    parts.push('padding: ' + pt + 'px ' + pr + 'px ' + pb + 'px ' + pl + 'px');
  }

  // Alignment
  if (node.primaryAxisAlignItems === 'CENTER') parts.push('justify-content: center');
  if (node.primaryAxisAlignItems === 'MAX') parts.push('justify-content: flex-end');
  if (node.primaryAxisAlignItems === 'SPACE_BETWEEN') parts.push('justify-content: space-between');
  if (node.counterAxisAlignItems === 'CENTER') parts.push('align-items: center');
  if (node.counterAxisAlignItems === 'MAX') parts.push('align-items: flex-end');

  // Sizing
  if (node.layoutSizingHorizontal === 'FILL') parts.push('flex: 1');
  if (node.absoluteBoundingBox) {
    parts.push('width: ' + node.absoluteBoundingBox.width + 'px');
    parts.push('height: ' + node.absoluteBoundingBox.height + 'px');
  }

  // Background
  if (node.fills && node.fills.length > 0) {
    var solidFill = node.fills.filter(function (f) { return f.type === 'SOLID' && f.color; })[0];
    if (solidFill && solidFill.color) parts.push('background-color: ' + rgba(solidFill.color));
  }

  // Border
  if (node.strokes && node.strokes.length > 0 && node.strokeWeight) {
    var solidStroke = node.strokes.filter(function (s) { return s.type === 'SOLID' && s.color; })[0];
    if (solidStroke && solidStroke.color) {
      parts.push('border: ' + node.strokeWeight + 'px solid ' + rgba(solidStroke.color));
    }
  }

  // Corner radius
  if (node.cornerRadius) parts.push('border-radius: ' + node.cornerRadius + 'px');

  // Shadow
  if (node.effects) {
    var shadows = node.effects.filter(function (e) {
      return e.type === 'DROP_SHADOW' && e.visible !== false && e.color;
    });
    for (var i = 0; i < shadows.length; i++) {
      var s = shadows[i];
      var ox = s.offset ? s.offset.x : 0;
      var oy = s.offset ? s.offset.y : 0;
      parts.push('box-shadow: ' + ox + 'px ' + oy + 'px ' + (s.radius || 0) + 'px ' + rgba(s.color!));
    }
  }

  // Opacity
  if (node.opacity !== undefined && node.opacity !== 1) parts.push('opacity: ' + node.opacity);

  // Overflow
  if (node.clipsContent) parts.push('overflow: hidden');

  // Text style
  if (node.style) {
    var ts = node.style;
    if (ts.fontFamily) parts.push("font-family: '" + ts.fontFamily + "', sans-serif");
    if (ts.fontSize) parts.push('font-size: ' + ts.fontSize + 'px');
    if (ts.fontWeight) parts.push('font-weight: ' + ts.fontWeight);
    if (ts.lineHeightPx) parts.push('line-height: ' + ts.lineHeightPx + 'px');
    if (ts.textAlignHorizontal) parts.push('text-align: ' + ts.textAlignHorizontal.toLowerCase());
  }

  return parts.join('; ');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -w packages/plugin -- --run tests/html-export/tree-to-css.test.ts`
Expected: 11 tests PASS

- [ ] **Step 5: Commit**

```bash
npx prettier --write packages/plugin/src/sandbox/html-export/tree-to-css.ts packages/plugin/tests/html-export/tree-to-css.test.ts
git add packages/plugin/src/sandbox/html-export/tree-to-css.ts packages/plugin/tests/html-export/tree-to-css.test.ts
git commit -m "feat(html-export): add tree-to-css — Figma node to CSS string"
```

---

### Task 2: tree-to-html — Figma Node to Preview HTML

**Files:**
- Create: `packages/plugin/src/sandbox/html-export/tree-to-html.ts`
- Test: `packages/plugin/tests/html-export/tree-to-html.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/plugin/tests/html-export/tree-to-html.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { nodeToHtml } from '../../src/sandbox/html-export/tree-to-html';

describe('nodeToHtml', () => {
  it('renders TEXT node as span with styled text', () => {
    const html = nodeToHtml({
      id: '1:1', name: 'Title', type: 'TEXT',
      characters: 'Hello World',
      style: { fontSize: 16, fontWeight: 700 },
    });
    expect(html).toContain('<span');
    expect(html).toContain('Hello World');
    expect(html).toContain('font-size: 16px');
  });

  it('renders FRAME with children as nested divs', () => {
    const html = nodeToHtml({
      id: '2:1', name: 'Container', type: 'FRAME',
      layoutMode: 'VERTICAL', itemSpacing: 8,
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
      { id: '3:1', name: 'Photo', type: 'RECTANGLE',
        fills: [{ type: 'IMAGE', imageRef: 'abc' }] },
      { abc: 'data:image/png;base64,AAAA' },
    );
    expect(html).toContain('src="data:image/png;base64,AAAA"');
  });

  it('renders IMAGE fill with placeholder when no imageMap', () => {
    const html = nodeToHtml({
      id: '3:2', name: 'Photo', type: 'RECTANGLE',
      fills: [{ type: 'IMAGE', imageRef: 'xyz' }],
    });
    expect(html).toContain('<img');
    expect(html).toContain('alt="Photo"');
  });

  it('escapes HTML in text content', () => {
    const html = nodeToHtml({
      id: '4:1', name: 'XSS', type: 'TEXT',
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
      id: '6:1', name: 'Root', type: 'FRAME',
      children: [{
        id: '6:2', name: 'Row', type: 'FRAME', layoutMode: 'HORIZONTAL',
        children: [{ id: '6:3', name: 'A', type: 'TEXT', characters: 'AAA' }],
      }],
    });
    expect(html).toContain('AAA');
    expect((html.match(/<div/g) || []).length).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -w packages/plugin -- --run tests/html-export/tree-to-html.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement tree-to-html**

Create `packages/plugin/src/sandbox/html-export/tree-to-html.ts`:

```typescript
/**
 * Convert Figma node tree to HTML string with inline CSS for visual preview.
 * ES5-safe.
 */
import { nodeToCss } from './tree-to-css';
import type { CssNodeProps } from './tree-to-css';

interface HtmlNode extends CssNodeProps {
  id: string;
  name: string;
  type: string;
  children?: HtmlNode[];
  characters?: string;
  fills?: Array<{ type: string; imageRef?: string; color?: { r: number; g: number; b: number; a: number } }>;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Convert a Figma node to an HTML string for visual preview.
 * @param node Figma node (serialized from Plugin API)
 * @param imageMap Optional map of imageRef to base64 data URI
 */
export function nodeToHtml(node: HtmlNode, imageMap?: Record<string, string>): string {
  // TEXT
  if (node.type === 'TEXT') {
    var css = nodeToCss(node);
    var styleAttr = css ? ' style="' + css + '"' : '';
    return '<span' + styleAttr + '>' + escapeHtml(node.characters || '') + '</span>';
  }

  // IMAGE fill
  var imageFill = node.fills && node.fills.filter(function (f) { return f.type === 'IMAGE'; })[0];
  if (imageFill) {
    var css = nodeToCss(node);
    var ref = imageFill.imageRef || '';
    var src = (imageMap && ref && imageMap[ref])
      ? imageMap[ref]
      : 'data:image/svg+xml,' + encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#e5e5e5"/></svg>',
        );
    var imgStyle = css ? ' style="display: block; ' + css + '"' : ' style="display: block"';
    return '<img src="' + src + '" alt="' + escapeHtml(node.name) + '"' + imgStyle + ' />';
  }

  // Container with children
  if (node.children && node.children.length > 0) {
    var css = nodeToCss(node);
    var styleAttr = css ? ' style="' + css + '"' : '';
    var childrenHtml = '';
    for (var i = 0; i < node.children.length; i++) {
      childrenHtml += nodeToHtml(node.children[i], imageMap);
    }
    return '<div' + styleAttr + '>' + childrenHtml + '</div>';
  }

  // Leaf node
  return '<!-- ' + escapeHtml(node.name) + ' -->';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -w packages/plugin -- --run tests/html-export/tree-to-html.test.ts`
Expected: 7 tests PASS

- [ ] **Step 5: Commit**

```bash
npx prettier --write packages/plugin/src/sandbox/html-export/tree-to-html.ts packages/plugin/tests/html-export/tree-to-html.test.ts
git add packages/plugin/src/sandbox/html-export/tree-to-html.ts packages/plugin/tests/html-export/tree-to-html.test.ts
git commit -m "feat(html-export): add tree-to-html — Figma node to preview HTML"
```

---

### Task 3: html-template — Assemble Final HTML Document

**Files:**
- Create: `packages/plugin/src/sandbox/html-export/html-template.ts`
- Test: `packages/plugin/tests/html-export/html-template.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/plugin/tests/html-export/html-template.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { assembleHtml } from '../../src/sandbox/html-export/html-template';

describe('assembleHtml', () => {
  it('produces valid HTML document with all sections', () => {
    const html = assembleHtml({
      title: 'TestFrame',
      jsxCode: 'import { Line } from "@oceania/depot/components/Line";\n\n<Line />',
      previewHtml: '<div><span>Hello</span></div>',
    });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<title>TestFrame');
    expect(html).toContain('panel-code');
    expect(html).toContain('panel-preview');
    expect(html).toContain('Hello');
  });

  it('includes copy button with clipboard script', () => {
    const html = assembleHtml({ title: 'T', jsxCode: '<A />', previewHtml: '<div/>' });
    expect(html).toContain('copyCode');
    expect(html).toContain('navigator.clipboard');
  });

  it('includes inline syntax highlight CSS and JS', () => {
    const html = assembleHtml({ title: 'T', jsxCode: '<A />', previewHtml: '<div/>' });
    expect(html).toContain('.kw');
    expect(html).toContain('.tag');
    expect(html).toContain('.str');
    expect(html).toContain('highlightJsx');
  });

  it('escapes JSX code for safe HTML embedding', () => {
    const html = assembleHtml({
      title: 'T',
      jsxCode: '<Component prop="value & more" />',
      previewHtml: '<div/>'
    });
    expect(html).toContain('&lt;Component');
  });

  it('has no external URLs', () => {
    const html = assembleHtml({ title: 'T', jsxCode: '<A />', previewHtml: '<div/>' });
    expect(html).not.toMatch(/https?:\/\//);
  });

  it('stores raw JSX for copy in a script tag', () => {
    const html = assembleHtml({ title: 'T', jsxCode: '<Foo bar="baz" />', previewHtml: '<div/>' });
    expect(html).toContain('id="jsx-raw"');
    expect(html).toContain('<Foo bar="baz" />');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -w packages/plugin -- --run tests/html-export/html-template.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement html-template**

Create `packages/plugin/src/sandbox/html-export/html-template.ts`:

```typescript
/**
 * Assemble a self-contained HTML document with JSX code + visual preview.
 * Zero external dependencies — works offline.
 * ES5-safe.
 */

interface HtmlTemplateInput {
  title: string;
  jsxCode: string;
  previewHtml: string;
}

function escapeForHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

var STYLES = [
  '*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }',
  'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #1e1e1e; color: #d4d4d4; }',
  '.split { display: flex; height: 100vh; }',
  '.panel-code { flex: 1; display: flex; flex-direction: column; border-right: 1px solid #333; background: #1e1e1e; min-width: 0; }',
  '.panel-preview { flex: 1; display: flex; flex-direction: column; background: #fff; min-width: 0; }',
  '.panel-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 16px; background: #2d2d2d; border-bottom: 1px solid #333; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #999; }',
  '.panel-preview .panel-header { background: #f5f5f5; border-bottom: 1px solid #e5e5e5; color: #666; }',
  '.copy-btn { background: #0d99ff; color: #fff; border: none; border-radius: 4px; padding: 4px 12px; font-size: 11px; font-weight: 600; cursor: pointer; transition: background 0.15s; }',
  '.copy-btn:hover { background: #0b88e3; }',
  '.copy-btn.copied { background: #1bc47d; }',
  'pre { flex: 1; overflow: auto; padding: 16px; margin: 0; font-size: 13px; line-height: 1.6; }',
  'code { font-family: "SF Mono", "Fira Code", "Cascadia Code", Menlo, monospace; white-space: pre; }',
  '.preview-canvas { flex: 1; overflow: auto; padding: 24px; }',
  '.kw { color: #c678dd; }',
  '.tag { color: #e06c75; }',
  '.attr { color: #d19a66; }',
  '.str { color: #98c379; }',
  '.cmt { color: #5c6370; font-style: italic; }',
  '.bool { color: #d19a66; }',
  '.punct { color: #abb2bf; }',
].join('\n');

var SCRIPT = [
  'function copyCode() {',
  '  var code = document.getElementById("jsx-raw").textContent;',
  '  navigator.clipboard.writeText(code).then(function() {',
  '    var btn = document.querySelector(".copy-btn");',
  '    btn.textContent = "Copied!";',
  '    btn.classList.add("copied");',
  '    setTimeout(function() { btn.textContent = "Copy"; btn.classList.remove("copied"); }, 2000);',
  '  });',
  '}',
  '',
  'function highlightJsx(code) {',
  '  return code',
  '    .replace(/(\\/\\/[^\\n]*)/g, \'<span class="cmt">$1</span>\')',
  '    .replace(/("[^"]*")/g, \'<span class="str">$1</span>\')',
  '    .replace(/(\'[^\']*\')/g, \'<span class="str">$1</span>\')',
  '    .replace(/\\b(import|from|export|const|let|var|return|function)\\b/g, \'<span class="kw">$1</span>\')',
  '    .replace(/\\b(true|false|null|undefined)\\b/g, \'<span class="bool">$1</span>\')',
  '    .replace(/(&lt;\\/?)([A-Z][a-zA-Z0-9.]*)/g, \'$1<span class="tag">$2</span>\')',
  '    .replace(/\\s([a-zA-Z][a-zA-Z0-9]*)=/g, \' <span class="attr">$1</span>=\')',
  '    .replace(/(\\/&gt;|&gt;)/g, \'<span class="punct">$1</span>\');',
  '}',
  '',
  'document.addEventListener("DOMContentLoaded", function() {',
  '  var el = document.getElementById("jsx-display");',
  '  if (el) { el.innerHTML = highlightJsx(el.innerHTML); }',
  '});',
].join('\n');

export function assembleHtml(input: HtmlTemplateInput): string {
  var escapedJsx = escapeForHtml(input.jsxCode);
  var title = escapeForHtml(input.title);

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<title>' + title + ' — Contentify Export</title>',
    '<style>',
    STYLES,
    '</style>',
    '</head>',
    '<body>',
    '<div class="split">',
    '  <div class="panel-code">',
    '    <div class="panel-header">',
    '      <span>JSX</span>',
    '      <button class="copy-btn" onclick="copyCode()">Copy</button>',
    '    </div>',
    '    <pre><code id="jsx-display">' + escapedJsx + '</code></pre>',
    '    <script type="text/plain" id="jsx-raw">' + input.jsxCode + '<\/script>',
    '  </div>',
    '  <div class="panel-preview">',
    '    <div class="panel-header">Preview</div>',
    '    <div class="preview-canvas">' + input.previewHtml + '</div>',
    '  </div>',
    '</div>',
    '<script>',
    SCRIPT,
    '<\/script>',
    '</body>',
    '</html>',
  ].join('\n');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -w packages/plugin -- --run tests/html-export/html-template.test.ts`
Expected: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
npx prettier --write packages/plugin/src/sandbox/html-export/html-template.ts packages/plugin/tests/html-export/html-template.test.ts
git add packages/plugin/src/sandbox/html-export/html-template.ts packages/plugin/tests/html-export/html-template.test.ts
git commit -m "feat(html-export): add html-template — assemble self-contained HTML"
```

---

### Task 4: export-handler — Orchestration (Pure Function)

**Files:**
- Create: `packages/plugin/src/sandbox/html-export/export-handler.ts`
- Test: `packages/plugin/tests/html-export/export-handler.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/plugin/tests/html-export/export-handler.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildExportHtml } from '../../src/sandbox/html-export/export-handler';

describe('buildExportHtml', () => {
  it('produces valid HTML from a simple frame', () => {
    var result = buildExportHtml({
      id: '1:1', name: 'TestCard', type: 'FRAME',
      children: [{ id: '1:2', name: 'Title', type: 'TEXT', characters: 'Product Name' }],
    });
    expect(result.html).toContain('<!DOCTYPE html>');
    expect(result.html).toContain('TestCard');
    expect(result.html).toContain('Product Name');
    expect(result.fileName).toBe('TestCard.html');
  });

  it('includes JSX imports for mapped components', () => {
    var result = buildExportHtml({
      id: '2:1', name: 'Card', type: 'FRAME',
      children: [{
        id: '2:2', name: 'EProductSnippet2', type: 'INSTANCE',
        componentProperties: { type: { type: 'VARIANT', value: 'organic' } },
      }],
    });
    expect(result.html).toContain('EProductSnippet2');
    expect(result.html).toContain('@oceania/depot');
  });

  it('includes both code and preview panels', () => {
    var result = buildExportHtml({
      id: '3:1', name: 'Layout', type: 'FRAME',
      children: [{ id: '3:2', name: 'L', type: 'TEXT', characters: 'Hello' }],
    });
    expect(result.html).toContain('panel-code');
    expect(result.html).toContain('panel-preview');
  });

  it('sanitizes file name', () => {
    var result = buildExportHtml({
      id: '4:1', name: 'My Frame / Slashes & Stuff!', type: 'FRAME',
      children: [{ id: '4:2', name: 'T', type: 'TEXT', characters: 'x' }],
    });
    expect(result.fileName).toBe('My-Frame---Slashes---Stuff-.html');
  });

  it('embeds base64 images from imageMap', () => {
    var result = buildExportHtml(
      {
        id: '5:1', name: 'WithImage', type: 'FRAME',
        children: [{
          id: '5:2', name: 'Img', type: 'RECTANGLE',
          fills: [{ type: 'IMAGE', imageRef: 'ref1' }],
        }],
      },
      { ref1: 'data:image/png;base64,AAAA' },
    );
    expect(result.html).toContain('data:image/png;base64,AAAA');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -w packages/plugin -- --run tests/html-export/export-handler.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement export-handler**

Create `packages/plugin/src/sandbox/html-export/export-handler.ts`:

```typescript
/**
 * Orchestrate HTML export: serialized node to JSX + preview to assembled HTML.
 * Pure function — no Figma API calls. Image export handled by caller.
 * ES5-safe.
 */
import { nodeToHtml } from './tree-to-html';
import { assembleHtml } from './html-template';
import { walkTree } from '../../../../packages/jsx-emitter/src/tree-walker';
import { emitJSX } from '../../../../packages/jsx-emitter/src/jsx-emitter';

interface ExportResult {
  html: string;
  fileName: string;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-. ]/g, '-') + '.html';
}

/**
 * Build a self-contained HTML file from a serialized Figma node.
 * @param node Root node (serialized plain object, not a live Figma reference)
 * @param imageMap Optional imageRef to base64 data URI map
 */
export function buildExportHtml(
  node: Record<string, unknown>,
  imageMap?: Record<string, string>,
): ExportResult {
  // 1. Generate JSX via jsx-emitter
  var tree = walkTree(node as any);
  var emitted = emitJSX(tree, {
    rootWrapper: 'none',
    includeStyles: false,
    includeTodos: true,
  });
  var jsxCode = emitted.imports
    ? emitted.imports + '\n\n' + emitted.jsx
    : emitted.jsx;

  // 2. Generate preview HTML
  var previewHtml = nodeToHtml(node as any, imageMap);

  // 3. Assemble
  var html = assembleHtml({
    title: (node.name as string) || 'Export',
    jsxCode: jsxCode,
    previewHtml: previewHtml,
  });

  return {
    html: html,
    fileName: sanitizeFileName((node.name as string) || 'export'),
  };
}
```

Note: The relative import path `../../../../packages/jsx-emitter/src/...` will be resolved by Rollup alias (Task 5). For tests, vitest resolves it directly since both packages are in the same repo.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -w packages/plugin -- --run tests/html-export/export-handler.test.ts`
Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
npx prettier --write packages/plugin/src/sandbox/html-export/export-handler.ts packages/plugin/tests/html-export/export-handler.test.ts
git add packages/plugin/src/sandbox/html-export/export-handler.ts packages/plugin/tests/html-export/export-handler.test.ts
git commit -m "feat(html-export): add export-handler — orchestrate JSX + preview to HTML"
```

---

### Task 5: Rollup Config — Resolve jsx-emitter in Sandbox Bundle

**Files:**
- Modify: `packages/plugin/rollup.config.mjs`

- [ ] **Step 1: Read current rollup config**

```bash
cat packages/plugin/rollup.config.mjs
```

- [ ] **Step 2: Add path resolution for jsx-emitter**

Add to the code bundle (IE11/ES5 bundle) plugins array an alias or adjustment so the relative import from `export-handler.ts` resolves to `packages/jsx-emitter/src/`. The simplest approach: ensure Rollup's `@rollup/plugin-node-resolve` can follow the relative path. If it cannot, install `@rollup/plugin-alias`:

```bash
npm install -D @rollup/plugin-alias -w packages/plugin
```

Then add to the code bundle config:

```javascript
import alias from '@rollup/plugin-alias';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// In code bundle plugins (before resolve()):
alias({
  entries: [
    {
      find: /^\.\.\/\.\.\/\.\.\/\.\.\/packages\/jsx-emitter\/src\/(.*)/,
      replacement: resolve(__dirname, '../jsx-emitter/src/$1'),
    },
  ],
}),
```

- [ ] **Step 3: Verify build**

Run: `npm run build -w packages/plugin`
Expected: Both `dist/ui.js` and `dist/code.js` built successfully

- [ ] **Step 4: Commit**

```bash
git add packages/plugin/rollup.config.mjs packages/plugin/package.json package-lock.json
git commit -m "chore: add jsx-emitter path alias to plugin rollup config"
```

---

### Task 6: Message Types

**Files:**
- Modify: `packages/plugin/src/types.ts`

- [ ] **Step 1: Add UIMessage type for export-html**

In `packages/plugin/src/types.ts`, find the `UIMessage` type union and add:

```typescript
  // === HTML EXPORT ===
  | { type: 'export-html' }
```

- [ ] **Step 2: Add CodeMessage types for result and error**

In the `CodeMessage` type union, add:

```typescript
  | { type: 'export-html-result'; html: string; fileName: string }
  | { type: 'export-html-error'; message: string }
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck -w packages/plugin`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
npx prettier --write packages/plugin/src/types.ts
git add packages/plugin/src/types.ts
git commit -m "feat(html-export): add export-html message types"
```

---

### Task 7: Sandbox Handler — Process export-html Command

**Files:**
- Modify: `packages/plugin/src/sandbox/plugin/message-router.ts`

- [ ] **Step 1: Add import at top of message-router.ts**

```typescript
import { buildExportHtml } from '../html-export/export-handler';
```

- [ ] **Step 2: Add handler block**

In `handleSimpleMessage`, add before the final `return false`:

```typescript
  if (type === 'export-html') {
    var selection = figma.currentPage.selection;
    if (selection.length === 0) {
      figma.ui.postMessage({
        type: 'export-html-error',
        message: 'Выберите фрейм для экспорта',
      });
      return true;
    }

    var rootNode = selection[0];
    Logger.debug('Export HTML: ' + rootNode.name + ' (' + rootNode.type + ')');

    try {
      var nodeCount = countExportNodes(rootNode);
      if (nodeCount > 100) {
        figma.ui.postMessage({
          type: 'export-html-error',
          message: 'Слишком большой выбор (' + nodeCount + ' нод). Максимум 100.',
        });
        return true;
      }

      // Collect and export images
      var imageEntries = collectExportImages(rootNode);
      var imageMap: Record<string, string> = {};
      var limit = Math.min(imageEntries.length, 20);
      for (var i = 0; i < limit; i++) {
        try {
          var bytes = await imageEntries[i].node.exportAsync({
            format: 'PNG',
            constraint: { type: 'SCALE', value: 2 },
          });
          imageMap[imageEntries[i].imageRef] = 'data:image/png;base64,' + figma.base64Encode(bytes);
        } catch (imgErr) {
          Logger.debug('Image export failed: ' + imageEntries[i].imageRef);
        }
      }

      var serialized = serializeExportNode(rootNode);
      var result = buildExportHtml(serialized, imageMap);

      figma.ui.postMessage({
        type: 'export-html-result',
        html: result.html,
        fileName: result.fileName,
      });
      figma.notify('HTML exported: ' + result.fileName);
    } catch (e) {
      Logger.error('Export HTML error:', e);
      figma.ui.postMessage({
        type: 'export-html-error',
        message: 'Ошибка экспорта: ' + String(e),
      });
    }
    return true;
  }
```

- [ ] **Step 3: Add helper functions at bottom of file**

```typescript
function countExportNodes(node: SceneNode): number {
  var count = 1;
  if ('children' in node) {
    var ch = (node as FrameNode).children;
    for (var i = 0; i < ch.length; i++) { count += countExportNodes(ch[i]); }
  }
  return count;
}

function collectExportImages(node: SceneNode): Array<{ node: SceneNode; imageRef: string }> {
  var results: Array<{ node: SceneNode; imageRef: string }> = [];
  if ('fills' in node) {
    var fills = (node as GeometryMixin).fills;
    if (Array.isArray(fills)) {
      for (var i = 0; i < fills.length; i++) {
        if (fills[i].type === 'IMAGE' && (fills[i] as ImagePaint).imageHash) {
          results.push({ node: node, imageRef: (fills[i] as ImagePaint).imageHash! });
          break;
        }
      }
    }
  }
  if ('children' in node) {
    var ch = (node as FrameNode).children;
    for (var i = 0; i < ch.length; i++) {
      results = results.concat(collectExportImages(ch[i]));
    }
  }
  return results;
}

function serializeExportNode(node: SceneNode): Record<string, unknown> {
  var obj: Record<string, unknown> = { id: node.id, name: node.name, type: node.type };

  if ('layoutMode' in node) {
    var f = node as FrameNode;
    obj.layoutMode = f.layoutMode;
    obj.primaryAxisAlignItems = f.primaryAxisAlignItems;
    obj.counterAxisAlignItems = f.counterAxisAlignItems;
    obj.itemSpacing = f.itemSpacing;
    obj.paddingTop = f.paddingTop;
    obj.paddingRight = f.paddingRight;
    obj.paddingBottom = f.paddingBottom;
    obj.paddingLeft = f.paddingLeft;
    obj.clipsContent = f.clipsContent;
  }

  obj.absoluteBoundingBox = { x: node.x, y: node.y, width: node.width, height: node.height };

  if ('layoutSizingHorizontal' in node) {
    obj.layoutSizingHorizontal = (node as FrameNode).layoutSizingHorizontal;
    obj.layoutSizingVertical = (node as FrameNode).layoutSizingVertical;
  }
  if ('fills' in node && Array.isArray((node as GeometryMixin).fills)) obj.fills = (node as GeometryMixin).fills;
  if ('strokes' in node) { obj.strokes = (node as GeometryMixin).strokes; obj.strokeWeight = (node as GeometryMixin).strokeWeight; }
  if ('effects' in node) obj.effects = (node as BlendMixin).effects;
  if ('cornerRadius' in node) obj.cornerRadius = (node as RectangleNode).cornerRadius;
  if ('opacity' in node) obj.opacity = (node as BlendMixin).opacity;

  if (node.type === 'TEXT') {
    var t = node as TextNode;
    obj.characters = t.characters;
    obj.style = {
      fontFamily: typeof t.fontName !== 'symbol' ? (t.fontName as FontName).family : undefined,
      fontSize: typeof t.fontSize === 'number' ? t.fontSize : undefined,
      fontWeight: typeof t.fontWeight === 'number' ? t.fontWeight : undefined,
      lineHeightPx: typeof t.lineHeight !== 'symbol' && (t.lineHeight as LineHeight).unit === 'PIXELS'
        ? (t.lineHeight as LineHeight).value : undefined,
      textAlignHorizontal: t.textAlignHorizontal,
    };
  }

  if (node.type === 'INSTANCE') obj.componentProperties = (node as InstanceNode).componentProperties;

  if ('children' in node) {
    var children: Record<string, unknown>[] = [];
    var ch = (node as FrameNode).children;
    for (var i = 0; i < ch.length; i++) {
      if (ch[i].visible !== false) children.push(serializeExportNode(ch[i]));
    }
    obj.children = children;
  }

  return obj;
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build -w packages/plugin`
Expected: Builds successfully

- [ ] **Step 5: Commit**

```bash
npx prettier --write packages/plugin/src/sandbox/plugin/message-router.ts
git add packages/plugin/src/sandbox/plugin/message-router.ts
git commit -m "feat(html-export): add export-html handler in message-router"
```

---

### Task 8: UI — Menu Item + Download Handler

**Files:**
- Modify: `packages/plugin/src/ui/components/CompactStrip.tsx`
- Modify: `packages/plugin/src/ui/ui.tsx`
- Modify: `packages/plugin/src/ui/hooks/usePluginMessages.ts`

- [ ] **Step 1: Add hasSelection to CompactStripProps**

In `packages/plugin/src/ui/components/CompactStrip.tsx`, add to `CompactStripProps` (line ~37):

```typescript
hasSelection?: boolean;
```

Destructure it in the component function parameters.

- [ ] **Step 2: Add Export HTML menu item**

In the `menuItems` array (line ~100), add before the danger zone comment:

```typescript
{
  id: 'exportHtml',
  label: 'Экспортировать HTML',
  icon: '\u2913',
  condition: !!hasSelection,
},
```

- [ ] **Step 3: Pass hasSelection from ui.tsx**

In `packages/plugin/src/ui/ui.tsx`, find the `<CompactStrip` JSX (around line 488) and add:

```tsx
hasSelection={hasSelection}
```

- [ ] **Step 4: Add handleMenuAction case in ui.tsx**

In `handleMenuAction` switch (around line 363), add:

```typescript
case 'exportHtml':
  sendMessageToPlugin({ type: 'export-html' });
  break;
```

- [ ] **Step 5: Add handler types in usePluginMessages.ts**

In `packages/plugin/src/ui/hooks/usePluginMessages.ts`, add to the handlers interface:

```typescript
onExportHtmlResult?: (data: { html: string; fileName: string }) => void;
onExportHtmlError?: (data: { message: string }) => void;
```

Add cases in the switch statement:

```typescript
case 'export-html-result':
  if (h.onExportHtmlResult) h.onExportHtmlResult(msg as any);
  break;
case 'export-html-error':
  if (h.onExportHtmlError) h.onExportHtmlError(msg as any);
  break;
```

- [ ] **Step 6: Add download + error handlers in ui.tsx**

In the `usePluginMessages` call in `ui.tsx`, add handlers:

```typescript
onExportHtmlResult: (data) => {
  const blob = new Blob([data.html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = data.fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
},
onExportHtmlError: (data) => {
  // Use existing notification mechanism
  Logger.error('Export HTML error: ' + data.message);
},
```

- [ ] **Step 7: Verify lint + build**

Run: `npm run lint -w packages/plugin && npm run build -w packages/plugin`
Expected: Clean

- [ ] **Step 8: Commit**

```bash
npx prettier --write packages/plugin/src/ui/components/CompactStrip.tsx packages/plugin/src/ui/ui.tsx packages/plugin/src/ui/hooks/usePluginMessages.ts
git add packages/plugin/src/ui/components/CompactStrip.tsx packages/plugin/src/ui/ui.tsx packages/plugin/src/ui/hooks/usePluginMessages.ts
git commit -m "feat(html-export): add Export HTML menu item + download handler"
```

---

### Task 9: Integration Test + Full Verification

**Files:**
- Create: `packages/plugin/tests/html-export/integration.test.ts`

- [ ] **Step 1: Write integration test**

Create `packages/plugin/tests/html-export/integration.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildExportHtml } from '../../src/sandbox/html-export/export-handler';

describe('HTML Export integration', () => {
  it('produces complete HTML from a realistic Figma tree', () => {
    var result = buildExportHtml({
      id: '1:1', name: 'EShopItem Card', type: 'FRAME',
      layoutMode: 'VERTICAL', itemSpacing: 12,
      paddingTop: 16, paddingRight: 16, paddingBottom: 16, paddingLeft: 16,
      cornerRadius: 8,
      fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 } }],
      children: [
        {
          id: '1:2', name: 'Header', type: 'FRAME',
          layoutMode: 'HORIZONTAL', itemSpacing: 8,
          counterAxisAlignItems: 'CENTER',
          children: [
            { id: '1:3', name: 'ShopName', type: 'TEXT', characters: 'Ozon',
              style: { fontFamily: 'Inter', fontSize: 14, fontWeight: 600 } },
            { id: '1:4', name: 'ELabelRating', type: 'INSTANCE',
              componentProperties: {
                size: { type: 'VARIANT', value: 'xs' },
                view: { type: 'VARIANT', value: 'white' },
                value: { type: 'TEXT', value: '4.5' },
              }, children: [] },
          ],
        },
        { id: '1:5', name: 'Title', type: 'TEXT',
          characters: 'Samsung Galaxy S25 Ultra 256GB',
          style: { fontFamily: 'Inter', fontSize: 16, fontWeight: 400 } },
        { id: '1:6', name: 'Price', type: 'TEXT',
          characters: '89 990 \u20BD',
          style: { fontFamily: 'Inter', fontSize: 20, fontWeight: 700 } },
      ],
    });

    expect(result.fileName).toBe('EShopItem-Card.html');
    expect(result.html).toContain('<!DOCTYPE html>');
    expect(result.html).toContain('panel-code');
    expect(result.html).toContain('panel-preview');
    expect(result.html).toContain('ELabelRating');
    expect(result.html).toContain('@oceania/depot');
    expect(result.html).toContain('Ozon');
    expect(result.html).toContain('Samsung Galaxy S25 Ultra');
    expect(result.html).not.toMatch(/https?:\/\//);
    expect(result.html).toContain('.kw');
    expect(result.html).toContain('copyCode');
  });
});
```

- [ ] **Step 2: Run all html-export tests**

Run: `npm run test -w packages/plugin -- --run tests/html-export/`
Expected: All tests pass (tree-to-css + tree-to-html + html-template + export-handler + integration)

- [ ] **Step 3: Run full test suite**

Run: `npm run test -w packages/plugin`
Expected: All 465 existing + new html-export tests pass

- [ ] **Step 4: Run lint**

Run: `npm run lint -w packages/plugin`
Expected: Clean

- [ ] **Step 5: Commit**

```bash
npx prettier --write packages/plugin/tests/html-export/integration.test.ts
git add packages/plugin/tests/html-export/integration.test.ts
git commit -m "test(html-export): add integration test with realistic Figma tree"
```

---

## Task Summary

| Task | What | Tests |
|------|------|-------|
| 1 | tree-to-css: Figma props to CSS string | 11 |
| 2 | tree-to-html: Figma tree to preview HTML | 7 |
| 3 | html-template: assemble full HTML doc | 6 |
| 4 | export-handler: orchestration (pure) | 5 |
| 5 | Rollup config: bundle jsx-emitter | build verify |
| 6 | Message types: UIMessage + CodeMessage | typecheck |
| 7 | Sandbox handler: serialize + export | build verify |
| 8 | UI: menu item + download handler | lint + build |
| 9 | Integration test + full verification | 1 + full suite |
