# DOM Extraction (Extension Content Script)

Rules for writing selectors and parsers for Yandex SERP (or any external site)
in `packages/extension/src/content.ts`. Each rule is backed by a concrete bug
from the v3.x sessions — ignoring any of them costs a full build + reload +
live-test cycle per iteration.

## 1. Get the real DOM before writing selectors

**Never guess the structure of a third-party site.** Ask the user to copy
`outerHTML` of the target element from Chrome DevTools (Inspect → right-click →
Copy → outerHTML) and use that as a fixture for unit tests.

Guessing costs three rebuild cycles minimum: you land on a plausible shape,
the real DOM diverges, symptoms don't tell you how, you iterate. A single
paste from the user's browser eliminates the loop.

**Workflow:**

1. User provides a task that needs DOM parsing.
2. First ask: "please paste `outerHTML` of `.TargetSelector` from a live
   Yandex page for me to write selectors against." Don't write selectors yet.
3. Build a jsdom fixture from that HTML, write the extractor, assert exact
   expected output.
4. Ship.

If the user can't provide real HTML, write the extractor with very loose
fallbacks (see §4) and ship behind a feature flag so regressions are visible.

## 2. `aria-hidden="true"` is NOT "hidden from user"

It tells screen readers to skip an element. **Visually, the element is
usually rendered.** Yandex uses this pattern heavily:

```html
<div class="EProductSnippet2-Deliveries">
  <span aria-hidden="true">Курьер</span>
  <!-- VISIBLE badge -->
  <span aria-hidden="true">Из магазина</span>
  <!-- VISIBLE badge -->
  <span class="A11yHidden">Курьер Из магазина …</span>
  <!-- hidden SR duplicate -->
</div>
```

The `aria-hidden` badges are what the sighted user sees. The `A11yHidden`
sibling exists so screen readers get the aggregated version without reading
each pill separately.

**Rules:**

- Do **not** treat `aria-hidden="true"` as a skip signal when extracting
  visible content.
- **Do** treat these as skip signals for hidden content:
  - Class token `A11yHidden` (Yandex)
  - Class token `sr-only` (Tailwind / Bootstrap)
  - Class token `visually-hidden` (common a11y convention)
  - `role="tooltip"` (tooltip wrapper)
  - CSS `display: none` (if you can read it — we usually can't in content
    scripts without computed styles)

Real-world regression: inverting aria-hidden semantics caused "sourceMeta
везде false" on every card, flipping the entire component off.

## 3. Class-token matching, not substring

Class names often contain dash/underscore modifiers that mimic forbidden words
as substrings:

| Real class               | Substring match               | What it actually is                                                 |
| ------------------------ | ----------------------------- | ------------------------------------------------------------------- |
| `EDeliveryGroup_tooltip` | `/tooltip/i` — false positive | Root modifier for the delivery-group variant, not a tooltip wrapper |
| `HelperText`             | `/Hint/i` — false positive    | Form helper text (often the thing we want)                          |
| `DeliveryPopupText`      | `/Popup/i` — TRUE match       | Actually a popup                                                    |

**Rule:** match against whole class tokens, not substring of the whole
className. Compare each space-separated token with equality, or
`startsWith(word + '-')`, or `endsWith('-' + word)`, etc.

```ts
// WRONG — substring match, catches `_tooltip` inside valid classes
if (/Tooltip|Popup|Hint/i.test(className)) return true;

// RIGHT — token-based match
function hasClassToken(className: string, words: string[]): boolean {
  const tokens = className.split(/\s+/);
  for (const t of tokens.map((s) => s.toLowerCase())) {
    for (const w of words.map((s) => s.toLowerCase())) {
      if (t === w) return true;
      if (t.startsWith(w + '-') || t.startsWith(w + '_')) return true;
      if (t.endsWith('-' + w) || t.endsWith('_' + w)) return true;
    }
  }
  return false;
}
```

## 4. Cascade fallback when a `hasValue` boolean depends on extraction

If the extraction result feeds a schema `hasValue` mapping (which drives a
Figma BOOLEAN component property), the extractor **must not return `''` when
source text exists** — otherwise one DOM shape change silently turns
visibility off on every card.

Required fallback ladder:

1. **Clean path**: targeted selectors + filters → ideal output
2. **Structural fallback**: walk the tree and take direct text nodes → decent
   output for unknown structure
3. **Raw fallback**: trimmed `textContent`, truncated to ~50 chars with
   ellipsis → ugly but non-empty, keeps the component visible

Regression: removing strategy 3 once caused the `sourceMeta` boolean to flip
to false on every card with a delivery block but unexpected DOM.

## 5. Direct text via `childNodes`, not `textContent`

`textContent` aggregates text from the whole subtree. For a badge like:

```html
<div class="Delivery">
  <svg class="Icon">…</svg>
  Курьер
  <!-- direct text node -->
  <span class="A11yHidden">Курьер подсказка</span>
</div>
```

`div.textContent` = `"Курьер Курьер подсказка"` (concatenated). What you want
is just the direct text node `"Курьер"`.

```ts
function getDirectText(el: Element): string {
  let text = '';
  for (const n of el.childNodes) {
    if (n.nodeType === 3 /* TEXT_NODE */) text += n.textContent || '';
  }
  return text;
}
```

Use this when the site puts badge text directly inside a wrapper that also
contains decorative SVGs or a11y duplicates.

## 6. Never skip the entry element

When a user-provided root element is passed into a tree-walking extractor,
**do not apply the "skip tooltip subtree" filter to the root itself** — the
root often has modifier classes (e.g. `EDeliveryGroup_tooltip`) that would
accidentally terminate the walk before it starts.

```ts
function walk(el: Element, isRoot: boolean) {
  if (!isRoot && shouldSkipElement(el)) return; // guard: only children
  // … process …
  for (const child of el.children) walk(child, false);
}
walk(rootEl, true);
```

## 7. Positional index arithmetic → `endsWith` / `startsWith`

Do not write substring checks like:

```ts
// WRONG — when s.length === 5, `s.indexOf('-popup') === -1` and
// `s.length - 'popup'.length - 1 === -1` both equal −1 → false positive
s.indexOf('-popup') === s.length - 'popup'.length - 1;
```

Use `s.endsWith('-popup')` instead. Positional arithmetic on `indexOf()` is a
known footgun — `-1 === -1` false positives when the token and word happen
to be the same length.

## 8. Testing strategy for extractors

Since the extension package has no test runner of its own:

1. Write the extractor in `content.ts` (source of truth).
2. **Mirror** it in a jsdom-enabled test file under
   `packages/plugin/tests/extension/` with `/** @vitest-environment jsdom */`
   at the top.
3. Add a **source contract** section: read the extension file via `fs`, assert
   with regex that the published version still uses the same approach
   (e.g. `expect(source).toContain('getDirectText')`). This catches divergence
   between the mirror and the real extractor.
4. Add at least one test with the user's actual real-world HTML as fixture
   — literal copy from DevTools.

Example: `packages/plugin/tests/extension/delivery-badges.test.ts`.
