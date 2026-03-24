---
globs: packages/plugin/src/sandbox/**
---

# ES5 Sandbox Constraint

All code in `packages/plugin/src/sandbox/` compiles to ES5 via Babel (IE11 target).

## Forbidden APIs

Never use these runtime APIs — they don't exist in ES5:
- `Promise.allSettled()`, `Promise.any()`
- `Object.fromEntries()`, `Object.entries()` (use polyfilled alternatives)
- `Array.flat()`, `Array.flatMap()`
- `String.matchAll()`, `String.replaceAll()`
- `globalThis`
- Optional chaining (`?.`) and nullish coalescing (`??`) — Babel transforms these, but avoid deep chains
- `async/await` — Babel transforms but adds regenerator runtime overhead

## Safe patterns

- `Object.keys()`, `Object.values()` — OK (ES5 polyfilled)
- `Array.map/filter/reduce/forEach` — OK
- `Promise` (basic) — OK (polyfilled)
- `var` not required — Babel downcompiles `const`/`let`

## Scope

This constraint does NOT apply to:
- `src/ui/` (React, modern browsers)
- `packages/extension/` (Chrome, modern JS)
- `packages/relay/` (Node.js)
