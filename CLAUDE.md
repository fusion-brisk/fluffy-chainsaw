# Contentify — Figma Plugin for Yandex SERP

> **ES5 for sandbox code. Build must pass. Tests must pass. Never modify Yandex frontend.**

## What

Figma-плагин: автозаполнение макетов данными из поисковой выдачи Яндекса.
npm workspaces monorepo: `plugin` (Figma), `extension` (Chrome), `relay` (localhost server).

## Architecture

```
Browser Extension → POST /push → Relay :3847 → GET /pull → Figma Plugin
  (парсит DOM)        (очередь)                   (schema engine → Figma API)
```

Direction: **Production Yandex → Figma** (never the other way).

## Commands

```bash
npm run build                        # Build all
npm run test                         # Vitest (plugin)
npm run typecheck -w packages/plugin # TS check
npm run lint -w packages/plugin      # ESLint
npm run verify                       # typecheck + lint + test + build (before commit)
```

## Golden Rules

1. **ES5 sandbox** — `packages/plugin/src/sandbox/` compiles to ES5 via Babel. No `Promise.allSettled`, `Object.fromEntries`, `Array.flat`. Does NOT apply to UI, extension, relay.
2. **Schema-first** — new properties → `packages/plugin/src/sandbox/schema/*.ts`, not handlers. Use `PropertyMapping` modes: `hasValue`, `stringValue`, `equals`, `compute`.
3. **Cache-first** — `buildInstanceCache()` once, then `getCachedInstance()`. Never traverse tree repeatedly.
4. **CSVFields has NO index signature** — every field explicit in `packages/plugin/src/types/csv-fields.ts`.
5. **Visibility via booleans, NEVER `.visible` on boolean-controlled frames** — `trySetProperty(instance, ['withDelivery'], value)`, NOT `instance.visible = false`. Figma bidirectionally syncs boolean properties with layer visibility: `frame.visible = true` silently flips the parent's boolean property back to `true`, undoing schema engine work. Use `safeSetVisible(frame, value, container)` from `visibility-handlers.ts` — it detects the side effect and auto-reverts.
6. **Logger only** — never `console.log`. Use `Logger.debug()` / `Logger.verbose()`.
7. **Pure transforms** — `transforms.ts` functions: no side effects, no Figma API.
8. **CSS fallbacks** — always provide hardcoded fallback for `--figma-color-*` variables. New button classes must be added to the global `button:hover:not(...)` exclusion list in `styles.css`.

## Investigation Rule

Never speculate about code you have not opened. Read referenced files BEFORE answering.
Check `packages/plugin/src/utils/` before creating new utils.

## Commits

Format: `<type>: <subject>` — types: `refactor|feat|fix|test|docs|chore`
English, imperative mood. Body: file-by-file breakdown. One logical unit per commit.
AI commits: add `Co-Authored-By: Claude <noreply@anthropic.com>`.

## Navigator

| Task | Read first |
|------|-----------|
| Architecture overview | `docs/ARCHITECTURE.md`, `docs/GLOSSARY.md` |
| Add container property | `docs/EXTENDING.md` §0 |
| Add handler | `docs/EXTENDING.md` §1 |
| Add CSVRow field | `docs/EXTENDING.md` §2, `src/types/csv-fields.ts` |
| Extension parsing | `docs/PARSING_ARCHITECTURE.md` |
| Figma MCP setup | `docs/FIGMA_MCP_SETUP.md`, `docs/PORT_MAP.md` |
| Page builder | `docs/PAGE_BUILDER_SETUP.md` |
| Release | `.claude/rules/release.md` |
| Module internals | `docs/STRUCTURE.md`, `docs/GLOSSARY.md` |
| UI hooks/state | `src/ui/hooks/`, `docs/STRUCTURE.md` §UI Hooks |
| UI CSS pitfalls | `.claude/rules/ui-css.md` |

## Specs Workflow

Before implementing features, create a plan: `.claude/specs/in-progress/<name>.md`.
On completion, move to `.claude/specs/done/`. To resume: "Continue spec in `.claude/specs/in-progress/`".

## Git & Merges

- Always run `npx prettier --write` on changed files before committing. If a commit fails due to formatting, fix and retry automatically.
- For git merges: never checkout a different branch inside a worktree. Use `git merge` from the correct branch, or create a PR. If the user says 'merge', ask which strategy (merge commit, rebase, squash) only once, then proceed.
- Default merge strategy: squash merge via PR to main. After merge — delete source branch locally and on remote, pull main, confirm clean state.
- Before any git operation, run `git worktree list` and `git status` to understand current state. Never assume.
- Before any destructive git operation (branch delete, force push, reset), create a backup tag: `git tag backup/<branch>-$(date +%s)`.
- At session start, if branch state is unclear, run `git branch -a && git worktree list && git status` and show a compact summary before doing anything.

## Debugging

- When debugging, do NOT assume the root cause. Always gather evidence first (logs, HTML output, actual vs expected) before proposing a fix.
- If the first fix doesn't work, re-examine assumptions from scratch rather than iterating on the same theory.
- For complex bugs: list 2-3 possible root causes with evidence for/against each. Present hypotheses BEFORE making any code changes. Only proceed after user confirms which to investigate.
- For cross-system bugs (extension → relay → plugin), identify WHICH system the bug is in before changing code. Trace the data flow step by step.
- **Build-vs-source mismatch**: When a bug defies code analysis, check `dist/` build dates vs source modification times. The running code is what's in `dist/`, not `src/`. Run `ls -la packages/*/dist/*.js | head` and compare with `git diff --stat HEAD` to detect stale builds.

## Figma Plugin Development

- Figma plugin iframe sandbox has strict constraints:
  - No dynamic imports (causes SyntaxError in sandbox)
  - No `new URL()` for validation (rejected in sandbox) — use regex or try/catch
  - CSS class names may not match — always verify selector hierarchy against actual rendered DOM
- Data flow: Chrome extension → relay server → Figma plugin. JSON only, no CSV, no CORS fetches from plugin.
- Always test that changes actually render in the plugin iframe — don't assume DOM operations succeed.
- Port conflicts: relay uses port 3847. Before starting relay, check `lsof -i :3847` and kill conflicting processes.
- **Figma component key updates**: When the designer updates a published component (renames properties, restructures layers), the component key changes. Check `component-map.ts` keys against actual library keys. Boolean property names must match between schema code and Figma component (`withDeliveryBnpl` not `withEcomMeta`).
- **DOM selectors must handle both LI and DIV serp-items**: Yandex wraps standard results in `li.serp-item` but carousel/gallery blocks in `div.serp-item` inside `.main__carousel-item`. All DOM-walking functions (like `getSerpItemId`) must check `.serp-item` class, not tag name.
- **Boolean↔Visibility bidirectional sync**: Figma boolean properties (e.g., `withPromo`) are bidirectionally bound to the controlled layer's `.visible`. Setting `layer.visible = true` **silently flips** the boolean property to `true` on the parent instance. **NEVER** set `.visible` directly on a frame whose visibility is governed by a boolean property — always use `trySetProperty` on the parent instance, or `safeSetVisible()` which detects and auto-reverts boolean side effects. This applies to ALL handlers that toggle `.visible`, especially `EmptyGroups`.

## Build Discipline

- **After editing any source file, always rebuild that package** before testing or asking the user to test. Source edits without rebuild = stale runtime.
- Extension: `npm run build -w packages/extension` after ANY change to `packages/extension/src/`.
- Plugin: `npm run build -w packages/plugin` (or root `npm run build`) after sandbox/UI changes.
- After rebuild, remind the user to **reload the extension** in Chrome (chrome://extensions → Reload) and **reopen the Figma plugin**.
- `npm run verify` before commit — catches typecheck + lint + test + build in one pass.

## Refactoring

- After any refactor, run lint/typecheck AND verify no unused props, imports, or dead references remain. Clean up in the same commit.
- Before starting a refactor, enumerate ALL affected call sites and present the list. Don't start changing files until the scope is confirmed.

## Code Style & Dependencies

- Do NOT use libraries that aren't already in package.json. Check package.json before importing new dependencies.
- Before implementing, review existing component patterns in the codebase and list any assumptions about available libraries or utilities.

> **ES5 for sandbox. Build must pass. Tests must pass. Read files before answering.**
