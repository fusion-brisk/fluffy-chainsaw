---
globs: packages/plugin/tests/**
---

# Test Convention

## Framework

Vitest. Mock setup in `tests/setup.ts` (mocks Figma API).

## Test file mapping

| Change type                    | Test file                         |
| ------------------------------ | --------------------------------- |
| New transform function         | `tests/schema/transforms.test.ts` |
| Schema property mapping        | `tests/schema/engine.test.ts`     |
| Handler registration/execution | `tests/handlers/registry.test.ts` |
| CSV row validation             | `tests/types/validation.test.ts`  |

## Test file mapping (handlers)

Each handler file has a corresponding test file:

| Handler source                      | Test file                                      |
| ----------------------------------- | ---------------------------------------------- |
| `handlers/price-handlers.ts`        | `tests/handlers/price-handlers.test.ts`        |
| `handlers/button-handlers.ts`       | `tests/handlers/button-handlers.test.ts`       |
| `handlers/label-handlers.ts`        | `tests/handlers/label-handlers.test.ts`        |
| `handlers/delivery-handlers.ts`     | `tests/handlers/delivery-handlers.test.ts`     |
| `handlers/visibility-handlers.ts`   | `tests/handlers/visibility-handlers.test.ts`   |
| `handlers/text-content-handlers.ts` | `tests/handlers/text-content-handlers.test.ts` |
| `handlers/image-handlers.ts`        | `tests/handlers/image-handlers.test.ts`        |
| `schema/esnippet-hooks.ts`          | `tests/schema/esnippet-hooks.test.ts`          |

## Rules

1. Every new transform function needs a test
2. Every new schema mapping needs an engine test
3. **Every new handler function needs a test in the corresponding handler test file**
4. Bug fixes require a regression test
5. Tests must pass: `npm run test`
6. Use Figma API mocks from `tests/setup.ts` — don't create new mock helpers
7. **After writing tests, run `npm run lint` and fix unused imports/variables before committing**
8. Handler test pattern: `vi.mock()` dependencies → factory `createContext(name, row)` → assert `mockTrySetProperty.toHaveBeenCalledWith`
