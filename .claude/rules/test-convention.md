---
globs: packages/plugin/tests/**
---

# Test Convention

## Framework

Vitest. Mock setup in `tests/setup.ts` (mocks Figma API).

## Test file mapping

| Change type | Test file |
|------------|-----------|
| New transform function | `tests/schema/transforms.test.ts` |
| Schema property mapping | `tests/schema/engine.test.ts` |
| Handler registration/execution | `tests/handlers/registry.test.ts` |
| CSV row validation | `tests/types/validation.test.ts` |

## Rules

1. Every new transform function needs a test
2. Every new schema mapping needs an engine test
3. Bug fixes require a regression test
4. Tests must pass: `npm run test`
5. Use Figma API mocks from `tests/setup.ts` — don't create new mock helpers
