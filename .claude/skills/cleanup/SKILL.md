# Dead Code Cleanup

Systematic dead code audit and removal workflow.

## Steps

1. **Scan** — find unused exports, components, CSS classes, and types:
   - `grep -r "export " --include="*.ts" --include="*.tsx" src/` → for each export, verify at least one import exists elsewhere
   - Check for unused CSS classes: grep class names from `.css` against `.tsx` files
   - Check for functions defined but never called

2. **Verify** — for each candidate:
   - Confirm zero imports/references across the **entire** codebase (not just current package)
   - Check git blame — if recently added, skip (might be in-progress work)
   - If re-exported from an index file, check consumers of the index too

3. **Remove** — delete in batches by category:
   - Batch 1: Unused exports/functions
   - Batch 2: Unused CSS classes/rules
   - Batch 3: Unused types/interfaces
   - After each batch: `npm run verify` (typecheck + lint + test + build)

4. **Commit** — one commit per batch:
   - Format: `chore: remove dead code — <category> (-N lines)`
   - Include file-by-file breakdown in commit body

5. **Report** — summary at the end:
   - Files changed
   - Lines removed (total)
   - Categories cleaned

## Rules

- Never remove code that has `// TODO`, `// FIXME`, or `@deprecated` annotations without confirmation
- Never remove code that is only used in tests (test helpers, fixtures)
- If unsure whether something is used, ask before removing
- Run `npm run verify` after EVERY batch, not just at the end
