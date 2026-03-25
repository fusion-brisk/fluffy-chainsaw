---
globs: packages/plugin/src/ui/**
---

# Figma Plugin UI — CSS Rules

## Global `button` selector trap

`styles.css` has a global `button { ... }` rule (element selector) that sets
`background: transparent`, `border: 1px solid transparent`, `color: var(--figma-color-text)`.

There is also a global hover rule:
```css
button:hover:not(:disabled):not(.btn-primary):not(.btn-secondary):not(.btn-text) {
  background-color: var(--figma-color-bg-hover);
}
```

**When adding new button classes** (e.g., `.my-dialog__btn-action`):

1. The class selector overrides the element selector for non-hover states — OK.
2. The hover exclusion list only knows `.btn-primary`, `.btn-secondary`, `.btn-text`.
   Your new class is NOT excluded, so hover will apply `background-color: var(--figma-color-bg-hover)`,
   making colored buttons disappear on hover.
3. **Fix**: add your class to the `:not()` chain in the global hover rule.

## CSS variable fallbacks are mandatory

Figma injects `--figma-color-*` variables, but they may be unavailable at initial render
or in certain contexts. Always provide hardcoded fallbacks:

```css
/* BAD */
background: var(--figma-color-bg-brand);

/* GOOD */
background: var(--figma-color-bg-brand, #0d99ff);
color: var(--figma-color-text-onbrand, #fff);
```

Key fallback values:
- `--figma-color-bg-brand` → `#0d99ff`
- `--figma-color-bg-brand-hover` → `#0b88e3`
- `--figma-color-text-onbrand` → `#fff`
- `--figma-color-text-danger` → `#f24822`
- `--figma-color-text` → `#333`
- `--figma-color-text-secondary` → `#888`
- `--figma-color-border` → `#e5e5e5`

## Window size includes Figma title bar

Figma adds a ~40px title bar above the plugin iframe. `UI_SIZES` controls the
**total window** including the title bar. The actual content viewport is
`height - ~40px`. Account for this when calculating layout.

Current tiers (`types.ts`):
- compact: 320×56
- standard: 320×320 (confirming dialog)
- extended: 420×520

## `overflow: hidden` cascade

Three levels of `overflow: hidden` exist:
- `body` (line ~82)
- `#react-page` (line ~94)
- `.glass-app` (line ~370)

Dialogs use `position: fixed` to escape flow, but content that exceeds the
iframe viewport is still clipped. Keep content within viewport bounds.
