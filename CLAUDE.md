# Contentify — Development Rules

## 0. Mission

**Goal:** Make Figma design system a 1:1 mirror of production Yandex SERP frontend.

- **Can modify:** Figma components, plugin code, extension, relay server
- **Cannot modify:** Yandex frontend code — it is the source of truth
- **Direction:** Production → Figma (not the other way around). Every component property, every variant, every visibility state in Figma must match what the real frontend renders.
- **Why:** When Figma components match production exactly, building new React components becomes straightforward — designers and developers share a single source of truth.

> These rules apply to ALL agents working on this codebase. Read `.cursorrules` for project structure and concepts. This file covers **how** to work, not **what** the project is.

## 1. Golden Rules

1. **ES5 for sandbox code** — `src/code.ts` and all its imports compile to ES5 via Babel (IE11 target). Babel handles transpilation (arrow functions, const/let, async/await become ES5), but never use runtime APIs unavailable in ES5 (e.g., `Promise.allSettled`, `Object.fromEntries`, `Array.flat`).
2. **Cannot modify frontend** — only Figma components and plugin code. The Yandex SERP frontend is read-only.
3. **Dual parsing** — parsing logic exists in TWO places that must stay in sync:
   - `extension/content.js` — primary path (parses Yandex DOM in browser)
   - `src/utils/snippet-parser.ts` + `src/parsing-rules.ts` — fallback (file drop/paste)
   - When changing selectors or field extraction, update BOTH.
4. **CSVFields has NO index signature** — every field is explicit in `src/types/csv-fields.ts`. Never add `[key: string]: string`. This prevents silent typo bugs (e.g., `row['#OragnicTitle']` would compile but return `undefined`).
5. **Build must pass** — run `npm run build` after every TypeScript change.
6. **Tests must pass** — run `npm run test` after schema, handler, or transform changes.
7. **Verify before commit** — run `npm run typecheck && npm run lint && npm run test && npm run build`. CI enforces this on every push.

## 2. Architecture Decisions

1. **Schema-first** — new container properties → `src/schema/*.ts`, NOT imperative handlers. The schema engine (`src/schema/engine.ts`, ~90 LOC) covers 4 container types: EShopItem, EOfferItem, EProductSnippet/2, ESnippet/Snippet. Use `PropertyMapping` modes: `hasValue`, `stringValue`, `equals`, `compute`.
2. **Cache-first** — call `buildInstanceCache(container)` once, then `getCachedInstance(cache, name)` for O(1) lookups. Never traverse the component tree repeatedly per container.
3. **Pure transforms** — functions in `src/schema/transforms.ts` must be pure: no side effects, no Figma API calls. This is what makes them testable without Figma mocks.
4. **Handler priorities** — execute in strict order: CRITICAL(0) → VARIANTS(10) → VISIBILITY(20) → TEXT(30) → FALLBACK(40) → FINAL(50). New handlers must declare correct priority.
5. **Unified property setter** — `trySetProperty(instance, [nameVariants], value, fieldName)` is the ONLY way to set component properties. For nested Line/Label instances: `instance.setProperties({ value })`.
6. **Visibility via booleans** — use component boolean properties (`withDelivery`, `withFintech`, `withPromo`, etc.), NOT `instance.visible = false`. The `EmptyGroups` handler cleans up at FINAL priority.

## 3. Code Style

- **Field names** start with `#`: `#OrganicTitle`, `#ShopName`, `#FaviconImage`
- **Logging** only via `Logger` class (SILENT → ERROR → SUMMARY → VERBOSE → DEBUG). Never `console.log`.
- **TypeScript strict mode**. Avoid `any` — prefer `unknown` + type narrowing.
- **Property name variants** always in array: `['withButton', 'BUTTON', 'BUTTONS']`. Never hardcode a single name — Figma components evolve.
- **Reuse existing utils** before creating new ones:
  - `trySetProperty` — property setter with name variant fallback (`src/utils/property-utils.ts`)
  - `getCachedInstance` / `getCachedInstanceByNames` — cached node lookup (`src/utils/instance-cache.ts`)
  - `findFirstNodeByName` — single-node tree search (`src/utils/node-search.ts`)
  - `buildInstanceCache` — full tree cache builder (`src/utils/instance-cache.ts`)

## 4. Commit Rules

- Format: `<type>: <subject>` — types: `refactor`, `feat`, `fix`, `test`, `docs`, `chore`
- Subject: English, imperative mood (`add`, `remove`, `simplify` — not `added`, `removed`)
- Body: file-by-file breakdown — what changed and why
- One logical unit per commit. Never mix refactor + feature.
- Prefer net-negative LOC in refactors. Delete dead code immediately, never comment it out.
- AI-assisted commits include `Co-Authored-By` footer.

## 5. Anti-patterns

| Don't | Do instead |
|-------|-----------|
| Add index signature to CSVFields | Add explicit field to `src/types/csv-fields.ts` |
| `instance.visible = false` | Boolean property: `trySetProperty(inst, ['withX'], false, ...)` |
| Empty `catch (e) {}` | `catch (e) { Logger.debug('context', e) }` |
| Traverse tree in handler body | `getCachedInstance(cache, 'Name')` |
| Imperative handler for simple mapping | Schema `PropertyMapping` (hasValue/stringValue/equals/compute) |
| Debug code without marker | `// TEMP: <reason>` + removal plan |
| New util duplicating existing | Check `src/utils/` — e.g., `findLayerDeep` was duplicate of `findFirstNodeByName` |
| `console.log(...)` | `Logger.debug(...)` or `Logger.verbose(...)` |

## 6. Testing

| Change type | Test file |
|------------|-----------|
| New transform function | `tests/schema/transforms.test.ts` |
| Schema property mapping | `tests/schema/engine.test.ts` |
| Handler registration/execution | `tests/handlers/registry.test.ts` |
| CSV row validation | `tests/types/validation.test.ts` |

Run: `npm run test` (Vitest, 119+ tests). Test setup mocks Figma API in `tests/setup.ts`.

## 7. Key Files

```
src/schema/engine.ts           — applySchema() core (~90 LOC)
src/schema/transforms.ts       — 25 pure compute functions
src/schema/esnippet.ts         — ESnippet schema (21 properties, largest)
src/schema/esnippet-hooks.ts   — structural hooks (sitelinks, promo, EThumb)
src/handlers/registry.ts       — handler registration + execution engine
src/handlers/price-handlers.ts — EPriceGroup (most complex handler)
src/types/csv-fields.ts        — 200+ explicit CSV fields
src/utils/yandex-shared.ts     — single source of truth for shared parsing
src/utils/instance-cache.ts    — buildInstanceCache, getCachedInstance
src/utils/property-utils.ts    — trySetProperty, property warning aggregation
src/code.ts                    — Figma sandbox entry point
src/ui.tsx                     — React UI entry point
src/config.ts                  — version, URLs, container names
extension/content.js           — Yandex DOM parser (extension side)
```
