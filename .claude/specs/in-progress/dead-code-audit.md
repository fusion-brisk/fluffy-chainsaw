# Dead Code Audit Plan

## Scope
Monorepo: plugin, extension, relay. Code, dependencies, docs, build artifacts.

## Phase 1 — Unused Source Files (verify & delete)

Each file below needs **grep confirmation** that it's truly unreferenced before deletion.

### Plugin UI components (5 files)
| File | Status | Notes |
|------|--------|-------|
| `src/ui/components/BackButton.tsx` | candidate | not imported in any .tsx |
| `src/ui/components/Icons.tsx` | candidate | check — may have individual named imports |
| `src/ui/components/OnboardingHint.tsx` | candidate | not imported |
| `src/ui/components/StatusBar.tsx` | candidate | was replaced by CompactStrip? verify |
| `src/ui/components/WhatsNewBanner.tsx` | candidate | WhatsNewDialog exists separately — verify difference |

### Plugin utils (2 files)
| File | Status | Notes |
|------|--------|-------|
| `src/utils/notifications.ts` | candidate | Browser Notifications API, not used in Figma sandbox |
| `src/sandbox/text-handlers.ts` | candidate | loadFonts/trySetVariantProperty — verify not called |

### Extension (1 file)
| File | Status | Notes |
|------|--------|-------|
| `src/feed-parser.ts` | candidate | not in manifest entry points — but may be imported indirectly |

## Phase 2 — Unused Dependencies (verify & remove)

| Package | Workspace | Action |
|---------|-----------|--------|
| `canvas` | plugin | grep for `require('canvas')` / `from 'canvas'` |
| `icojs` | plugin | grep for `icojs` |
| `papaparse` | plugin | grep for `papaparse` — was CSV, now JSON-only? |
| `uuid` | relay | grep for `uuid` |

After verification: `npm uninstall <pkg> -w packages/<ws>`

## Phase 3 — Stale Build Artifacts in dist/

`packages/plugin/dist/` has ~27 old HTML files (ui-minimal*, ui-fixed*, ui-test, etc.).
Only `ui-embedded.html`, `ui.js`, `code.js` are production.

Action: delete all `ui-*.html` except `ui-embedded.html`. Add to `.gitignore` if not already.

## Phase 4 — Empty / Stub Directories

| Path | Content | Action |
|------|---------|--------|
| `/src/` (root) | empty | delete |
| `/examples/` | only .DS_Store | delete |
| `/shared/` | only README.md | read README — if placeholder, delete |

## Phase 5 — Docs Audit

Review for outdated/superseded docs:
- `docs/UI_REFACTOR_PLAN.md` vs `UI_REFACTOR_PLAN_V2.md` — if V2 supersedes, delete V1
- `docs/ESNIPPET_*.md` (3 files) — may be historical, check relevance
- `docs/plans/` — 8 plan files from Mar-Apr 2026, check if all still relevant
- `docs/VALIDATION-AGENT-PROMPT.md`, `WIZARD_AGENT_PROMPT.md` — agent prompts, still used?
- `docs/DOCS_AUDIT.md` — meta, check if outdated

## Phase 6 — native-host/ Directory

This appears to be a legacy pre-relay macOS app. Check:
- Is `native-host/Contentify Relay.app/` still referenced anywhere?
- Does `install-macos.sh` duplicate `tools/install-relay.sh`?
- If superseded by `tools/Contentify Installer.app`, consider deleting entire dir.

## Execution Rules

1. **Grep before delete** — never delete based on exploration alone
2. **One commit per phase** — easy to revert
3. **Run `npm run verify` after each phase** — typecheck + lint + test + build
4. **Tag before starting**: `git tag backup/pre-audit-$(date +%s)`
