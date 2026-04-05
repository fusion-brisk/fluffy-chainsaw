# Dead Code Audit Plan

## Scope

Monorepo: plugin, extension, relay. Code, dependencies, docs, build artifacts.

## Phase 1 — Unused Source Files (verify & delete)

**Status: COMPLETED** — all 8 candidate files deleted (commit not recorded separately; confirmed absent from git tree).

Each file below needs **grep confirmation** that it's truly unreferenced before deletion.

### Plugin UI components (5 files)

| File                                   | Status     | Notes                            |
| -------------------------------------- | ---------- | -------------------------------- |
| `src/ui/components/BackButton.tsx`     | ✅ deleted | not imported in any .tsx         |
| `src/ui/components/Icons.tsx`          | ✅ deleted | confirmed no imports             |
| `src/ui/components/OnboardingHint.tsx` | ✅ deleted | not imported                     |
| `src/ui/components/StatusBar.tsx`      | ✅ deleted | replaced by CompactStrip         |
| `src/ui/components/WhatsNewBanner.tsx` | ✅ deleted | WhatsNewDialog exists separately |

### Plugin utils (2 files)

| File                           | Status     | Notes                                                |
| ------------------------------ | ---------- | ---------------------------------------------------- |
| `src/utils/notifications.ts`   | ✅ deleted | Browser Notifications API, not used in Figma sandbox |
| `src/sandbox/text-handlers.ts` | ✅ deleted | loadFonts/trySetVariantProperty not called           |

### Extension (1 file)

| File                 | Status     | Notes                                             |
| -------------------- | ---------- | ------------------------------------------------- |
| `src/feed-parser.ts` | ✅ deleted | not in manifest entry points, no indirect imports |

## Phase 2 — Unused Dependencies (verify & remove)

**Status: COMPLETED** — all 4 packages removed.

| Package     | Workspace | Action                       |
| ----------- | --------- | ---------------------------- |
| `canvas`    | plugin    | ✅ removed                   |
| `icojs`     | plugin    | ✅ removed                   |
| `papaparse` | plugin    | ✅ removed (CSV → JSON-only) |
| `uuid`      | relay     | ✅ removed                   |

After verification: `npm uninstall <pkg> -w packages/<ws>`

## Phase 3 — Stale Build Artifacts in dist/

**Status: COMPLETED** — `packages/plugin/dist/` is in `.gitignore` (root `.gitignore` has `dist` entry). Only `ui-embedded.html` exists in dist at time of audit (2026-04-05). No stale HTML files (`ui-minimal*`, `ui-fixed*`, `ui-test*`) were present — they had already been cleaned up or were never committed. No git changes needed.

`packages/plugin/dist/` has ~27 old HTML files (ui-minimal*, ui-fixed*, ui-test, etc.).
Only `ui-embedded.html`, `ui.js`, `code.js` are production.

Action: delete all `ui-*.html` except `ui-embedded.html`. Add to `.gitignore` if not already.

## Phase 4 — Empty / Stub Directories

**Status: COMPLETED** — commit `a4895e2` (2026-04-05).

| Path           | Content        | Action                        |
| -------------- | -------------- | ----------------------------- |
| `/src/` (root) | empty          | ✅ deleted                    |
| `/examples/`   | only .DS_Store | ✅ deleted                    |
| `/shared/`     | only README.md | ✅ deleted (stub placeholder) |

## Phase 5 — Docs Audit

**Status: COMPLETED** — commit `a4895e2` (2026-04-05).

Remaining tracked docs (18 files) were all verified as live:

- All are referenced from `docs/README.md`, `docs/ARCHITECTURE.md`, or source code.
- `docs/VALIDATION-AGENT-PROMPT.md` and `docs/WIZARD_AGENT_PROMPT.md` — linked from `docs/README.md`, actively used as agent prompts.
- `docs/COVERAGE.md` — in `.gitignore`, auto-generated, not tracked.

Deleted in commit `a4895e2`:

- `docs/UI_REFACTOR_PLAN_v2.md` — superseded by v3 design doc
- `docs/plans/` — 9 archived implementation plans (all completed work)

Spec candidates that were already gone before audit (removed in earlier sessions):

- `docs/UI_REFACTOR_PLAN.md` (original v1) — gone
- `docs/ESNIPPET_*.md` (3 files) — gone
- `docs/DOCS_AUDIT.md` — gone

## Phase 6 — native-host/ Directory

**Status: COMPLETED** — commit `a4895e2` confirmed `native-host/` absent from git tree. Directory was removed in an earlier session as superseded by `tools/Contentify Installer.app`.

This appears to be a legacy pre-relay macOS app. Check:

- Is `native-host/Contentify Relay.app/` still referenced anywhere?
- Does `install-macos.sh` duplicate `tools/install-relay.sh`?
- If superseded by `tools/Contentify Installer.app`, consider deleting entire dir.

## Execution Rules

1. **Grep before delete** — never delete based on exploration alone
2. **One commit per phase** — easy to revert
3. **Run `npm run verify` after each phase** — typecheck + lint + test + build
4. **Tag before starting**: `git tag backup/pre-audit-$(date +%s)`
