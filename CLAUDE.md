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
5. **Visibility via booleans** — `trySetProperty(instance, ['withDelivery'], value)`, NOT `instance.visible = false`.
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
| MCP bridge setup | `docs/FIGMA_MCP_SETUP.md`, `docs/PORT_MAP.md` |
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

## Debugging

- When debugging, do NOT assume the root cause. Always gather evidence first (logs, HTML output, actual vs expected) before proposing a fix.
- If the first fix doesn't work, re-examine assumptions from scratch rather than iterating on the same theory.
- For complex bugs: list 2-3 possible root causes with evidence for/against each. Present hypotheses BEFORE making any code changes. Only proceed after user confirms which to investigate.

## Refactoring

- After any refactor, run lint/typecheck AND verify no unused props, imports, or dead references remain. Clean up in the same commit.
- Before starting a refactor, enumerate ALL affected call sites and present the list. Don't start changing files until the scope is confirmed.

## Code Style & Dependencies

- Do NOT use libraries that aren't already in package.json. Check package.json before importing new dependencies.
- Before implementing, review existing component patterns in the codebase and list any assumptions about available libraries or utilities.

> **ES5 for sandbox. Build must pass. Tests must pass. Read files before answering.**
