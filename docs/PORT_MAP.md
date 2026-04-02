# Port Allocation

All port constants are defined in `packages/plugin/src/config.ts` (`PORTS` object).

## Active Ports

| Port | Process | Started by | Protocol |
|------|---------|-----------|----------|
| 3847 | Contentify Relay Server | `npm run dev -w packages/relay` | HTTP + WebSocket |

## MCP Servers (external, not managed by plugin)

| Server | Purpose | How to use |
|--------|---------|------------|
| **figma-remote** (official) | Design ops: tokens, components, screenshots, `use_figma` | OAuth via `.mcp.json` |
| **figma-console** (npm) | Plugin debugging: console logs, `figma_execute` | Requires Desktop Bridge plugin in Figma |

## Port conflict: relay 3847

If another process uses 3847, relay fails with EADDRINUSE.

**Fix:** `lsof -i :3847` to find the conflicting process. Kill it or change PORT env var:
`PORT=3848 npm run dev -w packages/relay` (update `PORTS.RELAY` in config.ts too).

## enablePrivatePluginApi

`manifest.json` includes `enablePrivatePluginApi: true`, which unlocks extended async Figma API methods for variables and components.
