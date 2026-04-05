# @contentify/plugin

Figma plugin for auto-filling design mockups with production Yandex SERP data.

## Development

npm run build # Build plugin (Rollup + Babel)
npm run test # Run tests (Vitest, 119 tests)
npm run typecheck # TypeScript check
npm run lint # ESLint

## Architecture

- `src/sandbox/` — Figma sandbox code (compiled to ES5 via Babel/IE11 target)
- `src/ui/` — React UI iframe (modern browsers)
- `src/types/` — Shared type definitions (CSVFields, validation)
- `src/utils/` — Shared utilities
- `tests/` — Vitest tests with Figma API mocks

## ES5 Constraints (sandbox only)

Code in `src/sandbox/` is compiled through Babel with IE11 target.
Cannot use: `Promise.allSettled`, `Object.fromEntries`, `Array.flat`, `??`, `?.`
Babel handles syntax transpilation (arrow functions, const/let, async/await).
