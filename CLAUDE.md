# Contentify — Development Rules

## 0. Mission

**Goal:** Make Figma design system a 1:1 mirror of production Yandex SERP frontend.

- **Can modify:** Figma components, plugin code, extension, relay server
- **Cannot modify:** Yandex frontend code — it is the source of truth
- **Direction:** Production → Figma (not the other way around). Every component property, every variant, every visibility state in Figma must match what the real frontend renders.
- **Why:** When Figma components match production exactly, building new React components becomes straightforward — designers and developers share a single source of truth.

> These rules apply to ALL agents working on this codebase. Read `.cursorrules` for project structure and concepts. This file covers **how** to work, not **what** the project is.

## 1. Golden Rules

1. **ES5 for sandbox code** — `packages/plugin/src/sandbox/` and all its imports compile to ES5 via Babel (IE11 target). Babel handles transpilation (arrow functions, const/let, async/await become ES5), but never use runtime APIs unavailable in ES5 (e.g., `Promise.allSettled`, `Object.fromEntries`, `Array.flat`). This constraint does NOT apply to UI code (`src/ui/`), extension, or relay.
2. **Cannot modify frontend** — only Figma components and plugin code. The Yandex SERP frontend is read-only.
3. **Single parsing path** — parsing happens only in the extension (`packages/extension/src/content.ts`). The plugin receives pre-parsed rows via relay. There is no file drop or clipboard paste path.
4. **CSVFields has NO index signature** — every field is explicit in `packages/plugin/src/types/csv-fields.ts`. Never add `[key: string]: string`. This prevents silent typo bugs (e.g., `row['#OragnicTitle']` would compile but return `undefined`).
5. **Build must pass** — run `npm run build` after every TypeScript change.
6. **Tests must pass** — run `npm run test` after schema, handler, or transform changes.
7. **Verify before commit** — run `npm run typecheck && npm run lint && npm run test && npm run build`. CI enforces this on every push.

## 2. Architecture Decisions

1. **Schema-first** — new container properties → `packages/plugin/src/sandbox/schema/*.ts`, NOT imperative handlers. The schema engine (`src/sandbox/schema/engine.ts`, ~90 LOC) covers 4 container types: EShopItem, EOfferItem, EProductSnippet/2, ESnippet/Snippet. Use `PropertyMapping` modes: `hasValue`, `stringValue`, `equals`, `compute`.
2. **Cache-first** — call `buildInstanceCache(container)` once, then `getCachedInstance(cache, name)` for O(1) lookups. Never traverse the component tree repeatedly per container.
3. **Pure transforms** — functions in `packages/plugin/src/sandbox/schema/transforms.ts` must be pure: no side effects, no Figma API calls. This is what makes them testable without Figma mocks.
4. **Handler priorities** — execute in strict order: CRITICAL(0) → VARIANTS(10) → VISIBILITY(20) → TEXT(30) → FALLBACK(40) → FINAL(50). New handlers must declare correct priority.
5. **Unified property setter** — `trySetProperty(instance, [nameVariants], value, fieldName)` is the ONLY way to set component properties. For nested Line/Label instances: `instance.setProperties({ value })`.
6. **Visibility via booleans** — use component boolean properties (`withDelivery`, `withFintech`, `withPromo`, etc.), NOT `instance.visible = false`. The `EmptyGroups` handler cleans up at FINAL priority.

## 3. Code Style

- **Field names** start with `#`: `#OrganicTitle`, `#ShopName`, `#FaviconImage`
- **Logging** only via `Logger` class (SILENT → ERROR → SUMMARY → VERBOSE → DEBUG). Never `console.log`.
- **TypeScript strict mode**. Avoid `any` — prefer `unknown` + type narrowing.
- **Property name variants** always in array: `['withButton', 'BUTTON', 'BUTTONS']`. Never hardcode a single name — Figma components evolve.
- **Reuse existing utils** before creating new ones:
  - `trySetProperty` — property setter with name variant fallback (`packages/plugin/src/utils/property-utils.ts`)
  - `getCachedInstance` / `getCachedInstanceByNames` — cached node lookup (`packages/plugin/src/utils/instance-cache.ts`)
  - `findFirstNodeByName` — single-node tree search (`packages/plugin/src/utils/node-search.ts`)
  - `buildInstanceCache` — full tree cache builder (`packages/plugin/src/utils/instance-cache.ts`)

### Workspace Commands

The repo uses npm workspaces. Run commands from the root:

```bash
npm run build                        # Build all workspaces
npm run test                         # Run tests (plugin workspace)
npm run typecheck -w packages/plugin # Typecheck plugin
npm run lint -w packages/plugin      # Lint plugin
npm run build -w packages/extension  # Build extension only
npm run build -w packages/relay      # Build relay only
```

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
| Add index signature to CSVFields | Add explicit field to `packages/plugin/src/types/csv-fields.ts` |
| `instance.visible = false` | Boolean property: `trySetProperty(inst, ['withX'], false, ...)` |
| Empty `catch (e) {}` | `catch (e) { Logger.debug('context', e) }` |
| Traverse tree in handler body | `getCachedInstance(cache, 'Name')` |
| Imperative handler for simple mapping | Schema `PropertyMapping` (hasValue/stringValue/equals/compute) |
| Debug code without marker | `// TEMP: <reason>` + removal plan |
| New util duplicating existing | Check `packages/plugin/src/utils/` — e.g., `findLayerDeep` was duplicate of `findFirstNodeByName` |
| `console.log(...)` | `Logger.debug(...)` or `Logger.verbose(...)` |

## 6. Testing

| Change type | Test file |
|------------|-----------|
| New transform function | `packages/plugin/tests/schema/transforms.test.ts` |
| Schema property mapping | `packages/plugin/tests/schema/engine.test.ts` |
| Handler registration/execution | `packages/plugin/tests/handlers/registry.test.ts` |
| CSV row validation | `packages/plugin/tests/types/validation.test.ts` |

Run: `npm run test` (Vitest, 106+ tests). Test setup mocks Figma API in `packages/plugin/tests/setup.ts`.

## 7. Key Files

```
packages/plugin/
  src/sandbox/code.ts              — Figma sandbox entry point
  src/sandbox/schema/engine.ts     — applySchema() core (~90 LOC)
  src/sandbox/schema/transforms.ts — 25 pure compute functions
  src/sandbox/schema/esnippet.ts   — ESnippet schema (21 properties, largest)
  src/sandbox/schema/esnippet-hooks.ts — structural hooks (sitelinks, promo, EThumb)
  src/sandbox/handlers/registry.ts — handler registration + execution engine
  src/sandbox/handlers/price-handlers.ts — EPriceGroup (most complex handler)
  src/ui/ui.tsx                    — React UI entry point
  src/types/csv-fields.ts         — 200+ explicit CSV fields
  src/utils/yandex-shared.ts      — single source of truth for shared parsing
  src/utils/instance-cache.ts     — buildInstanceCache, getCachedInstance
  src/utils/property-utils.ts     — trySetProperty, property warning aggregation
  src/config.ts                   — version, URLs, container names
  tests/                          — Vitest tests with Figma API mocks

packages/extension/
  src/content.ts                  — Yandex DOM parser (extension side, 3246 LOC)
  src/background.ts               — Service worker for relay coordination

packages/relay/
  src/index.ts                    — Express + WebSocket server entry
  src/queue.ts                    — Data queue with file persistence
  src/routes/                     — API endpoints
```

## 8. Design & Figma Workflow

- Always use Figma MCP to read design context before implementing UI
- Use `generate_figma_design` (Figma Remote MCP) to push completed UI back to Figma
- Use `figma-console` MCP for plugin sandbox debugging (console capture, variable batch ops)
- Use `talk-to-figma` MCP for component instance manipulation (swap overrides, property changes)
- When reverse-engineering production UI:
  1. Playwright → get accessibility tree + computed styles
  2. Extract component structure → map to design system tokens
  3. Generate Figma components via talk-to-figma or figma-console
- Use Context7 to fetch current docs before using any library API
- Follow `/interface-design` system tokens if `.interface-design/system.md` exists
- Run `/interface-design:audit` before committing UI changes
- Use `frontend-design` skill for all new UI components to avoid generic aesthetics
- Run `web-design-guidelines` audit on all user-facing pages

## 9. Component Development

- Extract design tokens from Figma variables before building components
- Use composition patterns (compound components, explicit variants) over boolean props
- Check WCAG 2.1 AA compliance for all interactive elements
- Use Playwright MCP for visual QA after building UI components
- Follow react-best-practices rules (45 rules) for all React components
- Follow next-js-best-practices for all Next.js pages and API routes

## 10. Figma MCP Selection Guide

| Task | Use this MCP |
|------|-------------|
| Read design context for code gen | figma-remote (`mcp.figma.com`) |
| Push new designs to Figma | figma-remote → `generate_figma_design` |
| Debug Contentify plugin sandbox | figma-console → console capture |
| Batch export/import variables | figma-console → variable tools |
| Swap component instances | talk-to-figma → WebSocket API |
| Modify text/properties in bulk | talk-to-figma → text replacement |
| Get live file structure | Local Dev Mode (`127.0.0.1:3845`) |
