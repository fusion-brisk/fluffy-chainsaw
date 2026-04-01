# Update Mechanism — Design Document

> Date: 2026-04-01
> Status: Approved

## Goal

Reliable, automated delivery of updates to non-technical users (designers, managers).
Plugin updates via Figma Community (already works). Relay self-updates. Extension — notification + one manual step.

## Architecture

```
Developer                          GitHub                         User machine
─────────                         ──────                         ────────────
npm run release 2.6.0
  ├─ bump 5 files
  ├─ commit + tag v2.6.0
  └─ git push --tags ──────────►  Actions:
                                    ├─ build CRX
                                    ├─ build relay arm64/x64
                                    ├─ create Release + artifacts
                                    └─ commit version.json ─────► raw.githubusercontent.com/version.json
                                                                       │
                                                                       ▼
                                                                  Relay (localhost:3847)
                                                                    ├─ every 6h: fetch version.json
                                                                    ├─ self-update binary + restart
                                                                    ├─ cache CRX at /extension.crx
                                                                    └─ GET /versions (proxy version.json)
                                                                       │
                                                                       ▼
                                                                  Figma Plugin
                                                                    ├─ GET /versions → compare
                                                                    ├─ relay outdated → "Обновить" → POST /update
                                                                    └─ extension outdated → "Скачать" → /extension.crx
```

## Components

### 1. Release Script (`scripts/release.sh`)

Single command: `npm run release [patch|minor|major]`

1. Validates: branch is `main`, worktree clean, `npm run verify` passes
2. Computes new version from argument
3. Bumps 5 files atomically:
   - `package.json` (root)
   - `packages/plugin/src/config.ts` → `PLUGIN_VERSION`
   - `packages/extension/manifest.json` → `version`
   - `packages/extension/updates.xml` → `version`
   - `packages/relay/package.json` → `version`
4. Commits `chore: release vX.Y.Z`
5. Tags `vX.Y.Z`
6. Pushes `main --tags`

### 2. GitHub Actions — Release Pipeline

Existing `release.yml` enhanced:

- Generates `version.json` with current versions and download URLs
- Commits `version.json` to `main` after release creation
- Builds: `contentify.crx`, `contentify-relay-host-arm64`, `contentify-relay-host-x64`
- Creates GitHub Release with all artifacts

`version.json` format:

```json
{
  "plugin": "2.6.0",
  "extension": "2.6.0",
  "relay": "2.6.0",
  "releasedAt": "2026-04-01T12:00:00Z",
  "extensionUrl": "https://github.com/.../releases/latest/download/contentify.crx",
  "releaseNotesUrl": "https://github.com/.../releases/latest"
}
```

### 3. Relay Self-Update — Fixes

Current mechanism exists but broken. Fixes:

1. **Fallback restart**: if `launchctl kickstart` fails → `process.exit(0)` (KeepAlive restarts). If no plist → log "update downloaded, restart relay".
2. **Version sync**: release script bumps `packages/relay/package.json` (5th file).
3. **version.json as primary source**: relay checks `version.json` first (lightweight, no rate limit), GitHub Releases API as fallback.
4. **CRX caching**: on self-update, relay also downloads CRX to `~/.contentify/contentify.crx`, serves via `GET /extension.crx`.

### 4. Plugin — Update Notification Hub

Plugin already receives `relayVersion` and `extensionVersion` on every connection/import.

1. **Fetch versions**: `GET /versions` on relay (proxies cached `version.json`)
2. **Compare**: relay version vs latest, extension version vs latest
3. **Update banner** in `ready` state:
   - Relay outdated → "Обновить" button → `POST /update`
   - Extension outdated → "Скачать" button → opens `/extension.crx`
4. **Non-blocking**: banner dismissable, shows once per session

### 5. Extension Update

Self-hosted CRX — Chrome doesn't auto-update on macOS. Strategy:

- Relay caches CRX at `~/.contentify/contentify.crx`, serves via `GET /extension.crx`
- Plugin shows banner: "Расширение устарело (1.4.0 → 2.6.0). [Скачать] → перетащите в chrome://extensions"
- Future: migrate to Chrome Web Store for true auto-update

## What's Automatic (zero friction)

- Plugin — Figma Community
- Relay — self-update via launchctl KeepAlive

## What requires one action

- Extension — download CRX + drag-n-drop (banner in plugin)

## What's for developer

- `npm run release patch` — one command, everything else is automated
