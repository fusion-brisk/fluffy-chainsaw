# Spec: Remove @ts-nocheck from Extension

**Status:** in-progress
**Target:** `packages/extension/src/` (4 files, ~579 TS errors)

## Goal

Remove `@ts-nocheck` from all 4 extension files and fix all TypeScript errors.
No runtime behavior changes — types-only refactor.

## New file: shared-utils.ts

Extract `isYandexPage()` and `getRelayUrl()` duplicated in background.ts + popup.ts.

## Phase order

1. **shared-utils.ts** — create (no errors to fix, just extraction)
2. **options.ts** (98 LOC, ~33 errors) — DOM casts, null checks, parameter types
3. **popup.ts** (217 LOC, ~26 errors) — import shared-utils, parameter types, null checks
4. **background.ts** (694 LOC, ~48 errors) — import shared-utils, variable types, catch blocks
5. **content.ts** (3247 LOC, ~472 errors) — `Record<string, string>` rows (kills 306), param types, interfaces

## Constraints

- NO `any`, `as any`, `@ts-ignore`, `@ts-expect-error`
- `Record<string, string>` for row objects (NOT CSVFields)
- `export {};` at end of each file for module isolation
- Keep function declaration style
- Preserve all runtime behavior

## Verification per phase

```bash
npm run typecheck -w packages/extension
```

## Final verification

```bash
npm run typecheck -w packages/extension  # 0 errors
npm run build -w packages/extension      # successful
grep -r "@ts-nocheck\|@ts-ignore\|@ts-expect-error\|: any" packages/extension/src/  # 0 results
```
