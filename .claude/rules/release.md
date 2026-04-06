---
globs: src/config.ts, package.json, packages/extension/manifest.json
---

# Release Process

## Version Bump Files

All must be updated together:

1. `package.json` → `version`
2. `packages/plugin/src/config.ts` → `PLUGIN_VERSION`
3. `packages/extension/manifest.json` → `version`
4. `packages/extension/updates.xml` → `version`

## Release Artifacts (GitHub Actions, on tag `v*`)

| Artifact                      | Description                  |
| ----------------------------- | ---------------------------- |
| `contentify.crx`              | Chrome extension (signed)    |
| `contentify-relay-host-arm64` | Relay binary (Apple Silicon) |

Relay binaries are self-installing: when run from outside `~/.contentify/`,
they auto-run setup (kill old process, copy to install dir, configure LaunchAgent, start in background).

## Steps

```bash
# 1. Bump versions in all 4 files above
# 2. Commit
git commit -m "chore: release vX.Y.Z"
# 3. Tag
git tag vX.Y.Z
# 4. Push (Actions will build artifacts)
git push origin main --tags
```
