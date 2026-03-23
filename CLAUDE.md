# Contentify — Development Rules

## 0. Mission

**Goal:** Make Figma design system a 1:1 mirror of production Yandex SERP frontend.

- **Can modify:** Figma components, plugin code, extension, relay server
- **Cannot modify:** Yandex frontend code — it is the source of truth
- **Direction:** Production → Figma (not the other way around)

> Read `.cursorrules` for project structure and concepts. This file covers **how** to work.

## 1. Golden Rules

1. **ES5 for sandbox code** — `packages/plugin/src/sandbox/` and all its imports compile to ES5 via Babel (IE11 target). Never use runtime APIs unavailable in ES5 (e.g., `Promise.allSettled`, `Object.fromEntries`, `Array.flat`). Does NOT apply to UI code (`src/ui/`), extension, or relay.
2. **Cannot modify frontend** — the Yandex SERP frontend is read-only.
3. **Single parsing path** — parsing happens only in the extension (`packages/extension/src/content.ts`). No file drop or clipboard paste.
4. **CSVFields has NO index signature** — every field is explicit in `packages/plugin/src/types/csv-fields.ts`. Never add `[key: string]: string`.
5. **Build must pass** — run `npm run build` after every TypeScript change.
6. **Tests must pass** — run `npm run test` after schema, handler, or transform changes.
7. **Verify before commit** — run `npm run typecheck && npm run lint && npm run test && npm run build`.

## 2. Architecture Decisions

1. **Schema-first** — new container properties → `packages/plugin/src/sandbox/schema/*.ts`, NOT imperative handlers. Use `PropertyMapping` modes: `hasValue`, `stringValue`, `equals`, `compute`.
2. **Cache-first** — call `buildInstanceCache(container)` once, then `getCachedInstance(cache, name)` for O(1) lookups. Never traverse the tree repeatedly.
3. **Pure transforms** — functions in `transforms.ts` must be pure: no side effects, no Figma API calls.
4. **Handler priorities** — CRITICAL(0) → VARIANTS(10) → VISIBILITY(20) → TEXT(30) → FALLBACK(40) → FINAL(50).
5. **Unified property setter** — `trySetProperty(instance, [nameVariants], value, fieldName)` is the ONLY way to set properties. For nested Line/Label: `instance.setProperties({ value })`.
6. **Visibility via booleans** — use component boolean properties (`withDelivery`, `withPromo`, etc.), NOT `instance.visible = false`.

## 3. Code Style

- **Field names** start with `#`: `#OrganicTitle`, `#ShopName`, `#FaviconImage`
- **Logging** only via `Logger` class. Never `console.log`.
- **TypeScript strict mode**. Avoid `any` — prefer `unknown` + type narrowing.
- **Property name variants** always in array: `['withButton', 'BUTTON', 'BUTTONS']`.
- **Reuse existing utils** — see `packages/plugin/src/utils/` before creating new ones.

### Workspace Commands

```bash
npm run build                        # Build all workspaces
npm run test                         # Run tests (plugin workspace)
npm run typecheck -w packages/plugin # Typecheck plugin
npm run lint -w packages/plugin      # Lint plugin
```

## 4. Commit Rules

- Format: `<type>: <subject>` — types: `refactor`, `feat`, `fix`, `test`, `docs`, `chore`
- Subject: English, imperative mood (`add`, `remove`, `simplify`)
- Body: file-by-file breakdown — what changed and why
- One logical unit per commit. Never mix refactor + feature.
- Prefer net-negative LOC in refactors. Delete dead code, never comment it out.
- AI-assisted commits include `Co-Authored-By` footer.

## 5. Anti-patterns

| Don't | Do instead |
|-------|-----------|
| Add index signature to CSVFields | Add explicit field to `csv-fields.ts` |
| `instance.visible = false` | Boolean property via `trySetProperty` |
| Empty `catch (e) {}` | `catch (e) { Logger.debug('context', e) }` |
| Traverse tree in handler body | `getCachedInstance(cache, 'Name')` |
| Imperative handler for simple mapping | Schema `PropertyMapping` |
| `console.log(...)` | `Logger.debug(...)` or `Logger.verbose(...)` |
| New util duplicating existing | Check `packages/plugin/src/utils/` first |

## 6. Testing

| Change type | Test file |
|------------|-----------|
| New transform function | `tests/schema/transforms.test.ts` |
| Schema property mapping | `tests/schema/engine.test.ts` |
| Handler registration/execution | `tests/handlers/registry.test.ts` |
| CSV row validation | `tests/types/validation.test.ts` |

Run: `npm run test` (Vitest). Test setup mocks Figma API in `tests/setup.ts`.

## 7. Navigator: Task → Document

| Task | Read this | Also useful |
|------|-----------|-------------|
| Understand architecture | `docs/ARCHITECTURE.md` | `docs/GLOSSARY.md` |
| Add container property | `docs/EXTENDING.md` §0 | `src/sandbox/schema/*.ts` |
| Add handler | `docs/EXTENDING.md` §1 | `src/sandbox/handlers/registry.ts` |
| Add CSVRow field | `docs/EXTENDING.md` §2 | `src/types/csv-fields.ts` |
| Add new component | `docs/EXTENDING.md` §3 | `docs/PAGE_BUILDER_SETUP.md` |
| Debug data filling | `.cursor/debug-guide.md` | `docs/PORT_MAP.md` |
| Work with ESnippet | `docs/ARCHITECTURE.md` §ESnippet | `src/sandbox/schema/esnippet.ts` |
| Configure MCP bridge | `docs/FIGMA_MCP_SETUP.md` | `docs/PORT_MAP.md` |
| Extension parsing | `docs/PARSING_ARCHITECTURE.md` | `docs/REMOTE_CONFIG_GUIDE.md` |
| Release process | `.cursorrules` §Релиз | `src/config.ts` |
| Module internals | `docs/STRUCTURE.md` | `docs/GLOSSARY.md` |

> **MCP Note:** When developing the Contentify plugin, do NOT run the standalone Desktop Bridge plugin.
> Contentify's embedded `bridge-ui.js` handles MCP connections on ports 9223-9232.
> Running both causes WebSocket flapping. See `docs/PORT_MAP.md`.
