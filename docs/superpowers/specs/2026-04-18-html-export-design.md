# Export HTML — Figma Selection to Standalone HTML File

## Summary

A "Export HTML" button in the Figma plugin compact strip that generates a self-contained HTML file from the current selection. The file contains a split view: JSX code with syntax highlighting on the left, visual CSS preview on the right. Zero external dependencies — the file works offline.

## User Flow

```
Designer selects a frame/instance in Figma
  → "Export HTML" button becomes active in compact strip
  → Click
  → Sandbox traverses selection tree
  → Generates: JSX code (jsx-emitter) + visual preview (Figma → CSS)
  → Assembles single-file HTML
  → Sends to UI iframe via postMessage
  → UI creates Blob → triggers <a download> click
  → Browser downloads: {frameName}.html
```

Also available via plugin context menu ("Generate HTML").

## Output: HTML File Structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>{frameName} — Contentify Export</title>
  <style>
    /* Reset, split layout, code panel, preview panel */
    /* Inline syntax highlighting (no CDN) */
  </style>
</head>
<body>
  <div class="split">
    <div class="panel-code">
      <div class="panel-header">
        <span>JSX</span>
        <button onclick="copyCode()">Copy</button>
      </div>
      <pre><code id="code">{highlighted imports + jsx}</code></pre>
    </div>
    <div class="panel-preview">
      <div class="panel-header">Preview</div>
      <div class="preview-canvas">
        {visual HTML/CSS preview of the Figma frame}
      </div>
    </div>
  </div>
  <script>
    /* ~50 LOC: copy-to-clipboard, minimal JSX syntax highlighting */
  </script>
</body>
</html>
```

### Key Constraints

- **Zero CDN dependencies** — no Prism, no Google Fonts, no external requests
- **Fully self-contained** — images embedded as base64 data URIs
- **Works offline** — opens in any browser without network
- **Inline syntax highlighting** — regex-based: JSX tags, attributes, strings, keywords, comments (~30 lines CSS + ~50 lines JS)

## Architecture

### New Files

#### Sandbox (ES5 constraint applies)

```
src/sandbox/html-export/
  ├── tree-to-css.ts      # FigmaNode → inline CSS styles
  ├── tree-to-html.ts     # FigmaNode → HTML elements with preview styles
  ├── html-template.ts    # Assemble final HTML (template + JSX + preview)
  └── export-handler.ts   # Orchestration: selection → walk → emit → postMessage
```

#### UI (no ES5 constraint)

Changes in existing files only — no new UI components needed.

### Data Flow

```
figma.currentPage.selection
  → export-handler.ts
    → walkTree(node)           # reuse jsx-emitter logic (bundled via Rollup)
    → emitJSX(tree)            # produces { jsx, imports }
    → treeToHtml(node)         # produces preview HTML string
    → treeToCss(node)          # produces preview CSS string
    → exportAsync(imageNodes)  # Figma API: images → base64
    → assembleHtml(...)        # html-template.ts: stitch everything
  → figma.ui.postMessage({ type: 'export-html', html, fileName })
    → UI: Blob → <a download> → browser saves file
```

### jsx-emitter Integration (ES5 solution)

The `@contentify/jsx-emitter` package targets ES2020. The Figma sandbox requires ES5.

**Solution:** Include `packages/jsx-emitter/src/` in the plugin's Rollup bundle. Babel (already configured for sandbox) will downcompile to ES5 automatically. No code duplication needed.

Rollup config change:
```js
// rollup.config.mjs — add jsx-emitter to external resolution
// resolve jsx-emitter sources directly (not as node_module)
```

### Figma → CSS Mapping (MVP)

| Figma Property | CSS Output |
|---|---|
| `layoutMode: HORIZONTAL/VERTICAL` | `display: flex; flex-direction: row/column` |
| `itemSpacing` | `gap: {n}px` |
| `paddingTop/Right/Bottom/Left` | `padding: ...` |
| `fills[0].color {r,g,b,a}` | `background-color: rgba(...)` |
| `fills[0].type=IMAGE` | `<img src="data:image/png;base64,...">` via `exportAsync()` |
| `absoluteBoundingBox` | `width: {w}px; height: {h}px` |
| `cornerRadius` | `border-radius: {n}px` |
| `strokes[0] + strokeWeight` | `border: {w}px solid rgba(...)` |
| `effects[type=DROP_SHADOW]` | `box-shadow: {x}px {y}px {r}px rgba(...)` |
| `characters + style.*` | `font-family, font-size, font-weight, line-height, text-align` |
| `opacity` | `opacity: {n}` |
| `clipsContent` | `overflow: hidden` |
| `layoutSizingHorizontal: FILL` | `flex: 1` |
| `layoutSizingVertical: HUG` | `height: auto` (default) |

**Not supported in MVP:** gradients, blur effects, masks, rotation, blend modes, individual corner radii (uses first), vector paths.

### Image Export

For nodes with IMAGE fills:
1. Call `node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 2 } })`
2. Convert `Uint8Array` → base64 string
3. Embed as `<img src="data:image/png;base64,..." />`

Limit: max 20 images per export to avoid memory issues. Additional images get a placeholder.

### Syntax Highlighting (inline, no dependencies)

Regex-based highlighting for JSX:

```css
.kw { color: #c678dd; }  /* import, from, const, export */
.tag { color: #e06c75; } /* <Component, </Component>, /> */
.attr { color: #d19a66; } /* propName= */
.str { color: #98c379; }  /* "string values" */
.cmt { color: #5c6370; font-style: italic; } /* {/* comments */} */
.bool { color: #d19a66; } /* true, false */
```

JS highlighter: ~50 lines, runs once on page load, wraps tokens in `<span class="...">`.

## UI Integration

### Compact Strip Button

- Location: in the kebab menu (alongside existing items like "Logs", "Inspector")
- Label: "Export HTML"
- Icon: download/export icon (inline SVG)
- Disabled state: when `figma.currentPage.selection` is empty or contains no FRAME/INSTANCE/COMPONENT nodes
- Tooltip when disabled: "Select a frame to export"

### Selection Change Listener

Already exists (`figma.on('selectionchange')`). Add a flag `canExportHtml` that the UI reads to enable/disable the button. Set to `true` when selection contains at least one exportable node (FRAME, INSTANCE, COMPONENT, COMPONENT_SET).

### Context Menu

Register via `figma.ui.relaunch` or plugin menu parameters:
```json
{
  "menu": [
    { "name": "Generate HTML", "command": "export-html" }
  ]
}
```

### Download Mechanism (UI side)

```typescript
window.addEventListener('message', (event) => {
  if (event.data.pluginMessage?.type === 'export-html') {
    const { html, fileName } = event.data.pluginMessage;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }
});
```

## Error Handling

| Scenario | Behavior |
|---|---|
| Empty selection | Button disabled (prevented at UI level) |
| Selection too large (>100 nodes) | Toast: "Selection too large. Select a smaller frame." |
| Image export fails | Replace with gray placeholder rectangle |
| No mapped components found | JSX panel shows comment: `// No mapped components found. Layout exported as divs.` |
| Export takes >5s | Show progress indicator in compact strip |

## Testing

| Module | Test File | Cases |
|---|---|---|
| `tree-to-css.ts` | `tests/html-export/tree-to-css.test.ts` | Flexbox, colors, typography, borders, shadows, padding, sizing |
| `tree-to-html.ts` | `tests/html-export/tree-to-html.test.ts` | Nested frames, text nodes, image placeholders, INSTANCE mapping |
| `html-template.ts` | `tests/html-export/html-template.test.ts` | Complete HTML output, syntax highlight tokens, copy button script |
| `export-handler.ts` | `tests/html-export/export-handler.test.ts` | Selection → postMessage flow, empty selection guard, image limit |

## Scope Exclusions

- No live React rendering (Scenario 2 — future work)
- No editable props in the preview
- No Figma → CSS for gradients, blur, masks, rotation, blend modes
- No font embedding (uses system font stack fallback)
- No multi-page export (single selection only)
- No persistent settings for export options
