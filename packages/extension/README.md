# @contentify/extension

Chrome extension for parsing Yandex SERP data and sending to Figma plugin via relay.

## Development

npm run build # Build with esbuild (IIFE bundles)
npm run build:watch # Watch mode
npm run typecheck # TypeScript check

## Architecture

- `src/content.ts` — Content script injected into Yandex pages (3246 LOC)
- `src/background.ts` — Service worker for relay coordination
- `src/popup.ts` — Extension popup UI
- `src/options.ts` — Extension settings
- `dist/` — Bundled output (single files for Chrome MV3)
