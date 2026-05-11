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
or in certain contexts. **Every** `var(--figma-color-*)` must have a hardcoded fallback:

```css
/* BAD */
background: var(--figma-color-bg-brand);

/* GOOD */
background: var(--figma-color-bg-brand, #0d99ff);
color: var(--figma-color-text-onbrand, #fff);
```

**Verification:** After editing styles.css, grep for bare vars:

```bash
grep -n 'var(--figma-color-[^,)]*)'  packages/plugin/src/ui/styles.css | grep -v ','
```

This must return 0 lines.

Key fallback values:

- `--figma-color-bg` → `#ffffff`
- `--figma-color-bg-brand` → `#0d99ff`
- `--figma-color-bg-brand-hover` → `#0b88e3`
- `--figma-color-bg-hover` → `#f5f5f5`
- `--figma-color-bg-pressed` → `#ebebeb`
- `--figma-color-bg-secondary` → `#f5f5f5`
- `--figma-color-bg-selected` → `#e8f4fd`
- `--figma-color-text` → `#333`
- `--figma-color-text-secondary` → `#888`
- `--figma-color-text-tertiary` → `#b3b3b3`
- `--figma-color-text-onbrand` → `#fff`
- `--figma-color-text-danger` → `#f24822`
- `--figma-color-text-success` → `#1bc47d`
- `--figma-color-border` → `#e5e5e5`
- `--figma-color-border-brand` → `#0d99ff`
- `--figma-color-icon-secondary` → `#888`

## CSS variables Figma does NOT inject

These look like Figma color tokens but aren't actually provided by the
Plugin API. Their fallbacks are always what renders. Verified May 2026:

- `--figma-color-text-warning` — use fallback `#c4841d` (warm orange).
  Past bug: two sites used fallback `#f24822` (red), giving inconsistent
  warning UI. Always use `#c4841d` unless intentionally signaling error
  (which has its own `--figma-color-text-danger` Figma token).
- `--figma-color-border-strong` — does not exist. Use
  `--figma-color-border` or `--figma-color-icon-secondary` instead.

If you find another `--figma-color-*` that doesn't render correctly,
add it here so the next agent doesn't have to rediscover.

## `color-mix()` requires a static fallback above it

`color-mix()` is Chromium 111+ (March 2023). Figma on iPad may run an
older WebView where the entire `color-mix()` declaration becomes
invalid → background goes transparent → banner becomes invisible.

Always pair `color-mix()` with a static `rgba()` line on the SAME
property, just above:

```css
background: rgba(196, 132, 29, 0.12); /* fallback for color-mix */
background: color-mix(in srgb, var(--figma-color-text-warning, #c4841d) 12%, var(--figma-color-bg, #ffffff));
```

Older browsers ignore the unknown `color-mix()` line and keep the
static value; newer browsers apply `color-mix()` since it comes last.

## Font-size fallbacks must match `:root` values

Current `:root`:

- `--font-size-xs: 10px`
- `--font-size-sm: 11px`
- `--font-size-base: 11px`
- `--font-size-lg: 13px`
- `--font-size-xl: 14px`

Bad: `font-size: var(--font-size-sm, 12px);` — fallback is wishful, the
real declared value is 11px. If `--font-size-sm` is unset (Figma weird
context), the rendered font goes to 12px instead of 11 — invisible
inconsistency.

Good: fallback always matches `:root`:
`font-size: var(--font-size-sm, 11px);`

## Measure dynamic heights, don't hardcode

Banner heights, menu heights, and any text-wrapping content depend on
font scale and content. Use `useMeasuredHeight` from
`packages/plugin/src/ui/hooks/useMeasuredHeight.ts`:

```tsx
const [bannerRef, bannerHeight] = useMeasuredHeight<HTMLDivElement>();
return (
  <>
    {visible && (
      <div ref={bannerRef}>
        <Banner />
      </div>
    )}
    {/* bannerHeight is measured live via ResizeObserver, 0 when ref detaches */}
  </>
);
```

Hardcoded heights (e.g. `cloudUnreachableBannerHeight = visible ? 110 : 0`)
will lie when text wraps, when system font scales up, or when the
banner adds a new line of content.

## Shadow tokens

Use design tokens from `:root` — never inline `rgba()` in box-shadow:

- `--shadow-sm`, `--shadow-md`, `--shadow-lg` — neutral shadows
- `--shadow-brand` — brand-colored glow for primary buttons

## Window size includes Figma title bar

Figma adds a ~40px title bar above the plugin iframe. `UI_SIZES` controls the
**total window** including the title bar. The actual content viewport is
`height - ~40px`. Account for this when calculating layout.

Current tiers (`types.ts`):

- compact: 320×56
- standard: 320×220 (confirming dialog)
- extended: 420×520

## `overflow: hidden` cascade

Three levels of `overflow: hidden` exist:

- `body` (line ~82)
- `#react-page` (line ~94)
- `.glass-app` (line ~370)

Dialogs use `position: fixed` to escape flow, but content that exceeds the
iframe viewport is still clipped. Keep content within viewport bounds.
