# Update Mechanism — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reliable, one-command release process + automatic update delivery to non-technical users (designers, managers).

**Architecture:** Developer runs `npm run release patch` → bumps 5 files, commits, tags, pushes → GitHub Actions builds artifacts + updates `versions.json` → relay self-updates from GitHub Releases → plugin shows update banners for outdated relay/extension.

**Tech Stack:** Bash (release script), GitHub Actions, Node.js (relay), React (plugin UI — already exists).

**What already exists:**

- `versions.json` at repo root (static, needs auto-update from Actions)
- `useVersionCheck.ts` hook — fetches `versions.json` from GitHub, compares versions
- `UpdateBanner.tsx` + CSS — renders update notifications in plugin
- `update.ts` in relay — self-update from GitHub Releases API (6h interval)
- `install-relay.sh` — one-line installer for relay + launchctl
- `release.yml` — GitHub Actions builds CRX + relay arm64 binary

---

### Task 1: Release Script

**Files:**

- Create: `scripts/release.sh`
- Modify: `package.json:24` (add `"release"` script)

**Step 1: Create scripts directory and release.sh**

```bash
#!/bin/bash
set -e

# === Config ===
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FILES_TO_BUMP=(
  "package.json"
  "packages/plugin/src/config.ts"
  "packages/extension/manifest.json"
  "packages/extension/updates.xml"
  "packages/relay/package.json"
)

# === Colors ===
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# === Parse arguments ===
BUMP_TYPE="${1:-}"

if [[ -z "$BUMP_TYPE" ]]; then
  echo -e "${RED}Usage: npm run release [patch|minor|major|X.Y.Z]${NC}"
  exit 1
fi

cd "$ROOT_DIR"

# === Pre-flight checks ===
echo "🔍 Pre-flight checks..."

# Must be on main
BRANCH=$(git branch --show-current)
if [[ "$BRANCH" != "main" ]]; then
  echo -e "${RED}✗ Must be on 'main' branch (current: $BRANCH)${NC}"
  exit 1
fi
echo "  ✓ Branch: main"

# Working tree must be clean
if [[ -n "$(git status --porcelain)" ]]; then
  echo -e "${RED}✗ Working tree is not clean. Commit or stash changes first.${NC}"
  git status --short
  exit 1
fi
echo "  ✓ Working tree clean"

# Verify passes
echo "  ⏳ Running npm run verify..."
if ! npm run verify --silent 2>&1; then
  echo -e "${RED}✗ Verify failed. Fix errors before releasing.${NC}"
  exit 1
fi
echo "  ✓ Verify passed"

# === Compute version ===
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo ""
echo "📌 Current version: $CURRENT_VERSION"

if [[ "$BUMP_TYPE" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  NEW_VERSION="$BUMP_TYPE"
else
  # Split current version
  IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"
  case "$BUMP_TYPE" in
    patch) PATCH=$((PATCH + 1)) ;;
    minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
    major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
    *)
      echo -e "${RED}Invalid bump type: $BUMP_TYPE (use patch|minor|major|X.Y.Z)${NC}"
      exit 1
      ;;
  esac
  NEW_VERSION="$MAJOR.$MINOR.$PATCH"
fi

echo -e "🆕 New version: ${GREEN}$NEW_VERSION${NC}"
echo ""

# === Bump files ===
echo "📝 Updating version files..."

# 1. package.json (root)
node -e "
  const pkg = require('./package.json');
  pkg.version = '$NEW_VERSION';
  require('fs').writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"
echo "  ✓ package.json"

# 2. packages/plugin/src/config.ts
sed -i '' "s/export const PLUGIN_VERSION = '[^']*'/export const PLUGIN_VERSION = '$NEW_VERSION'/" \
  packages/plugin/src/config.ts
echo "  ✓ packages/plugin/src/config.ts"

# 3. packages/extension/manifest.json
node -e "
  const m = require('./packages/extension/manifest.json');
  m.version = '$NEW_VERSION';
  require('fs').writeFileSync('packages/extension/manifest.json', JSON.stringify(m, null, 2) + '\n');
"
echo "  ✓ packages/extension/manifest.json"

# 4. packages/extension/updates.xml
sed -i '' "s/version='[^']*'/version='$NEW_VERSION'/" \
  packages/extension/updates.xml
echo "  ✓ packages/extension/updates.xml"

# 5. packages/relay/package.json
node -e "
  const pkg = require('./packages/relay/package.json');
  pkg.version = '$NEW_VERSION';
  require('fs').writeFileSync('packages/relay/package.json', JSON.stringify(pkg, null, 2) + '\n');
"
echo "  ✓ packages/relay/package.json"

# === Format ===
echo ""
echo "🎨 Formatting..."
npx prettier --write package.json packages/extension/manifest.json packages/relay/package.json packages/plugin/src/config.ts 2>/dev/null || true

# === Commit, tag, push ===
echo ""
echo "📦 Committing..."
git add package.json packages/plugin/src/config.ts packages/extension/manifest.json packages/extension/updates.xml packages/relay/package.json
git commit -m "chore: release v$NEW_VERSION"

echo "🏷️  Tagging v$NEW_VERSION..."
git tag "v$NEW_VERSION"

echo "🚀 Pushing to origin..."
git push origin main --tags

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Released v$NEW_VERSION${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "GitHub Actions will now build and publish artifacts."
echo "Track progress: https://github.com/fusion-brisk/fluffy-chainsaw/actions"
```

**Step 2: Make executable and add npm script**

Run: `chmod +x scripts/release.sh`

Add to root `package.json` scripts:

```json
"release": "bash scripts/release.sh"
```

**Step 3: Test script (dry run)**

Run: `bash scripts/release.sh` (without argument — should print usage and exit)
Expected: `Usage: npm run release [patch|minor|major|X.Y.Z]`

Run: `git stash && bash -n scripts/release.sh` (syntax check)
Expected: no output (valid syntax)

**Step 4: Commit**

```bash
git add scripts/release.sh package.json
git commit -m "feat: add release script with 5-file version bump

- scripts/release.sh: pre-flight checks (branch, clean, verify),
  bumps package.json, config.ts, manifest.json, updates.xml,
  relay package.json — then commits, tags, pushes
- package.json: add 'release' npm script

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: GitHub Actions — Auto-Update `versions.json`

**Files:**

- Modify: `.github/workflows/release.yml`
- Modify: `versions.json` (format change — add `releasedAt`)

**Step 1: Update `versions.json` format**

Current format uses `latest`/`minimum`/`downloadUrl` per component — keep it, just ensure values match actual versions. The file will be auto-generated by Actions going forward.

**Step 2: Add version.json generation step to release.yml**

After the "Create Release" step, add:

```yaml
- name: Update versions.json
  run: |
    VERSION="${GITHUB_REF_NAME#v}"
    cat > versions.json << EOF
    {
      "relay": {
        "latest": "$VERSION",
        "minimum": "1.1.0",
        "downloadUrl": "https://github.com/fusion-brisk/fluffy-chainsaw/releases/latest/download/Contentify-Installer.zip"
      },
      "extension": {
        "latest": "$VERSION",
        "minimum": "1.4.0",
        "downloadUrl": "https://github.com/fusion-brisk/fluffy-chainsaw/releases/latest/download/contentify.crx"
      },
      "releasedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    }
    EOF
    npx prettier --write versions.json

- name: Commit versions.json
  run: |
    git config user.name "github-actions[bot]"
    git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
    git add versions.json
    git diff --cached --quiet || git commit -m "chore: update versions.json for ${GITHUB_REF_NAME}"
    git push origin HEAD:main
```

**Step 3: Re-enable x64 relay binary build**

Add after the arm64 build step:

```yaml
- name: Build relay binary (x64)
  run: |
    npm run build:pkg:x64
    mv pkg-dist/contentify-relay pkg-dist/contentify-relay-host-x64
    chmod +x pkg-dist/contentify-relay-host-x64
  working-directory: packages/relay
```

Update the release files list:

```yaml
files: |
  contentify.crx
  packages/relay/pkg-dist/contentify-relay-host-arm64
  packages/relay/pkg-dist/contentify-relay-host-x64
```

**Step 4: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "feat: auto-update versions.json on release + add x64 binary

- release.yml: generate versions.json with current version after
  release creation, commit to main
- release.yml: re-enable x64 relay binary build and upload

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Relay — CRX Caching + `/versions` Proxy

**Files:**

- Create: `packages/relay/src/routes/versions.ts`
- Modify: `packages/relay/src/routes/update.ts` (add CRX download on self-update)
- Modify: `packages/relay/src/index.ts` (register new routes)

**Step 1: Create `versions.ts` — proxy for versions.json**

```typescript
import { Router } from 'express';
import type { Request, Response } from 'express';

const router = Router();

const VERSIONS_URL =
  'https://raw.githubusercontent.com/fusion-brisk/fluffy-chainsaw/main/versions.json';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

let cachedVersions: unknown = null;
let lastFetchTime = 0;

async function fetchVersions(): Promise<unknown> {
  const now = Date.now();
  if (cachedVersions && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedVersions;
  }

  try {
    const res = await fetch(VERSIONS_URL, {
      headers: { 'User-Agent': 'contentify-relay' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return cachedVersions;
    cachedVersions = await res.json();
    lastFetchTime = now;
    return cachedVersions;
  } catch {
    return cachedVersions;
  }
}

/** GET /versions — proxy cached versions.json for plugin */
router.get('/versions', async (_req: Request, res: Response) => {
  const versions = await fetchVersions();
  if (versions) {
    res.json(versions);
  } else {
    res.status(503).json({ error: 'Version data unavailable' });
  }
});

export default router;
```

**Step 2: Add CRX download to relay self-update**

In `packages/relay/src/routes/update.ts`, inside `downloadAndReplace()`, after the binary replacement succeeds, add CRX download:

```typescript
// After binary replacement, also download latest CRX
try {
  const crxUrl = `https://github.com/${GITHUB_REPO}/releases/latest/download/contentify.crx`;
  const crxRes = await fetch(crxUrl, {
    headers: { 'User-Agent': 'contentify-relay' },
    signal: AbortSignal.timeout(30000),
  });
  if (crxRes.ok) {
    const crxBuffer = Buffer.from(await crxRes.arrayBuffer());
    const crxPath = path.join(process.env.HOME || '/tmp', '.contentify', 'contentify.crx');
    await fs.writeFile(crxPath, crxBuffer);
    console.log(`[update] CRX cached: ${(crxBuffer.length / 1024).toFixed(0)}KB`);
  }
} catch (crxErr) {
  console.log('[update] CRX cache failed:', crxErr instanceof Error ? crxErr.message : crxErr);
}
```

**Step 3: Add `GET /extension.crx` route to `update.ts`**

```typescript
/** GET /extension.crx — serve cached CRX for local download */
router.get('/extension.crx', async (_req: Request, res: Response) => {
  const crxPath = path.join(process.env.HOME || '/tmp', '.contentify', 'contentify.crx');
  try {
    const stat = await fs.stat(crxPath);
    res.set('Content-Type', 'application/x-chrome-extension');
    res.set('Content-Disposition', 'attachment; filename="contentify.crx"');
    res.set('Content-Length', String(stat.size));
    const data = await fs.readFile(crxPath);
    res.send(data);
  } catch {
    res.status(404).json({
      error: 'CRX not cached. Will be available after next relay update.',
      downloadUrl: `https://github.com/${GITHUB_REPO}/releases/latest/download/contentify.crx`,
    });
  }
});
```

**Step 4: Register routes in `index.ts`**

```typescript
import versionsRoutes from './routes/versions';
// ... existing imports

app.use(versionsRoutes);
```

**Step 5: Build and verify**

Run: `npm run build -w packages/relay`
Expected: no errors

Run: `npm run typecheck -w packages/relay`
Expected: no errors

**Step 6: Commit**

```bash
git add packages/relay/src/routes/versions.ts packages/relay/src/routes/update.ts packages/relay/src/index.ts
git commit -m "feat(relay): add /versions proxy and CRX caching

- routes/versions.ts: proxy versions.json with 1h cache for plugin
- routes/update.ts: download CRX alongside binary on self-update,
  serve via GET /extension.crx
- index.ts: register versions route

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Relay — `versions.json` as Primary Update Source

**Files:**

- Modify: `packages/relay/src/routes/update.ts`

Currently `checkForUpdate()` hits GitHub Releases API directly (rate-limited). Switch to:

1. Fetch `versions.json` (lightweight, no rate limit) to check if update available
2. If update available, THEN fetch GitHub Releases API for download URL

**Step 1: Refactor checkForUpdate()**

Replace the existing `checkForUpdate()` function:

```typescript
const VERSIONS_URL =
  'https://raw.githubusercontent.com/fusion-brisk/fluffy-chainsaw/main/versions.json';

interface VersionsManifest {
  relay: { latest: string; minimum: string; downloadUrl: string };
  extension: { latest: string; minimum: string; downloadUrl: string };
}

/** Check versions.json first, then GitHub Releases for download URL */
async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    // Step 1: Check versions.json (lightweight)
    const manifestRes = await fetch(VERSIONS_URL, {
      headers: { 'User-Agent': 'contentify-relay' },
      signal: AbortSignal.timeout(5000),
    });
    if (!manifestRes.ok) return await checkForUpdateGitHub(); // fallback

    const manifest = (await manifestRes.json()) as VersionsManifest;
    const latestVersion = manifest.relay?.latest;
    if (!latestVersion) return null;

    latestVersionCache = latestVersion;
    const currentVersion = getPkgVersion();

    if (compareSemver(latestVersion, currentVersion) <= 0) return null;

    // Step 2: Need update — get download URL from GitHub Releases
    return await checkForUpdateGitHub();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[update] versions.json check failed: ${msg}, trying GitHub API`);
    return await checkForUpdateGitHub();
  }
}

/** Fallback: check GitHub Releases API directly */
async function checkForUpdateGitHub(): Promise<UpdateInfo | null> {
  // ... existing checkForUpdate logic (rename, keep as-is)
}
```

**Step 2: Build and verify**

Run: `npm run build -w packages/relay && npm run typecheck -w packages/relay`
Expected: no errors

**Step 3: Commit**

```bash
git add packages/relay/src/routes/update.ts
git commit -m "refactor(relay): use versions.json as primary update source

- checkForUpdate() now checks versions.json first (no rate limit),
  falls back to GitHub Releases API for download URL
- Reduces GitHub API calls from every 6h to only when update needed

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Plugin — Switch to Relay Proxy for Version Check

**Files:**

- Modify: `packages/plugin/src/ui/hooks/useVersionCheck.ts`

Currently fetches `versions.json` directly from `raw.githubusercontent.com`. Problem: Figma plugin iframe may block external fetches. Switch to relay proxy.

**Step 1: Update VERSIONS_URL to use relay**

```typescript
// Was: const VERSIONS_URL = 'https://raw.githubusercontent.com/...';
// Now: use relay proxy (works in Figma iframe, no CORS issues)
const VERSIONS_URL_RELAY = 'http://localhost:3847/versions';
const VERSIONS_URL_GITHUB =
  'https://raw.githubusercontent.com/fusion-brisk/fluffy-chainsaw/main/versions.json';
```

**Step 2: Update fetch logic — try relay first, fall back to GitHub**

Replace the fetch inside useEffect:

```typescript
useEffect(() => {
  if (fetchedRef.current) return;
  fetchedRef.current = true;

  const fetchVersions = async () => {
    // Try relay proxy first (works in Figma iframe)
    for (const url of [VERSIONS_URL_RELAY, VERSIONS_URL_GITHUB]) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!res.ok) continue;
        const data = await res.json();
        if (data?.relay && data?.extension) {
          setManifest(data as VersionManifest);
          return;
        }
      } catch {
        // Try next URL
      }
    }
  };

  fetchVersions();
}, []);
```

**Step 3: Update relay UpdateBanner download URL for extension**

In `useVersionCheck.ts`, when returning `extensionUpdate`, override `downloadUrl` to point to local relay:

```typescript
const extensionUpdate = extensionDismissed
  ? null
  : checkVersion(extensionVersion, manifest?.extension);

// Override extension download URL to use local relay CRX cache
if (extensionUpdate) {
  extensionUpdate.downloadUrl = 'http://localhost:3847/extension.crx';
}
```

**Step 4: Build and verify**

Run: `npm run build -w packages/plugin && npm run typecheck -w packages/plugin`
Expected: no errors

**Step 5: Commit**

```bash
git add packages/plugin/src/ui/hooks/useVersionCheck.ts
git commit -m "feat(plugin): fetch versions from relay proxy, extension CRX from relay

- useVersionCheck: try relay /versions first, GitHub raw fallback
- Extension download URL points to relay /extension.crx (local)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: Relay — Fix Self-Update Restart Logic

**Files:**

- Modify: `packages/relay/src/routes/update.ts`

Current issue: `launchctl kickstart` may fail if relay wasn't started via launchctl. Add proper fallback chain.

**Step 1: Improve restart logic in downloadAndReplace()**

Replace the restart `setTimeout` block:

```typescript
setTimeout(async () => {
  const { execSync } = require('child_process') as typeof import('child_process');

  // Strategy 1: launchctl kickstart (if started via LaunchAgent)
  try {
    execSync('launchctl kickstart -k gui/$(id -u)/com.contentify.relay', {
      stdio: 'ignore',
      timeout: 5000,
    });
    return; // launchctl will restart us
  } catch {
    console.log('[update] launchctl kickstart failed, trying alternatives...');
  }

  // Strategy 2: launchctl stop + start (alternative syntax)
  try {
    execSync('launchctl stop com.contentify.relay', { stdio: 'ignore', timeout: 3000 });
    execSync('launchctl start com.contentify.relay', { stdio: 'ignore', timeout: 3000 });
    return;
  } catch {
    console.log('[update] launchctl stop/start failed');
  }

  // Strategy 3: exit with code 0 — KeepAlive in plist will restart
  // This works for any launch method (launchctl, manual, etc.)
  console.log('[update] Exiting for KeepAlive restart...');
  process.exit(0);
}, 2000);
```

**Step 2: Build and verify**

Run: `npm run build -w packages/relay`
Expected: no errors

**Step 3: Commit**

```bash
git add packages/relay/src/routes/update.ts
git commit -m "fix(relay): improve self-update restart with fallback chain

- Try launchctl kickstart first, then stop/start, then process.exit(0)
- Ensures restart works regardless of how relay was launched

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: Sync Versions + Clean Up Debug Logs

**Files:**

- Modify: `packages/relay/package.json` (version 1.1.0 → 2.5.0)
- Modify: `versions.json` (update to 2.5.0)
- Modify: `packages/extension/src/background.ts` (remove debug logs from this session)

**Step 1: Sync relay version to monorepo**

Update `packages/relay/package.json` version from `1.1.0` to `2.5.0`.

**Step 2: Update versions.json**

```json
{
  "relay": {
    "latest": "2.5.0",
    "minimum": "2.5.0",
    "downloadUrl": "https://github.com/fusion-brisk/fluffy-chainsaw/releases/latest/download/Contentify-Installer.zip"
  },
  "extension": {
    "latest": "2.5.0",
    "minimum": "1.4.0",
    "downloadUrl": "https://github.com/fusion-brisk/fluffy-chainsaw/releases/latest/download/contentify.crx"
  }
}
```

Note: extension minimum stays at 1.4.0 (current installed version is functional).

**Step 3: Remove debug logs from background.ts**

Remove the diagnostic logging added during this debugging session:

1. Remove `console.log(\`[Relay] Push payload size: ...` (line ~607)
2. Remove `if (!res.ok)` error body logging block (lines ~617-620)
3. Revert timeout from 10000 back to a reasonable 5000 (compromise — was 3000, 10000 is too generous)

Keep the code structure change (bodyStr variable) — it's cleaner.

Final state of the push block:

```typescript
try {
  const relayOk = await ensureRelayRunning();
  if (relayOk) {
    const res = await fetch(`${relayUrl}/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload, meta }),
      signal: AbortSignal.timeout(5000),
    });
    relaySuccess = res.ok;
  }
} catch (relayErr: unknown) {
  console.log('[Relay] Not available:', (relayErr as Error).message);
}
```

**Step 4: Format and build all**

Run: `npx prettier --write packages/relay/package.json versions.json packages/extension/src/background.ts`
Run: `npm run build`
Expected: all builds pass

**Step 5: Commit**

```bash
git add packages/relay/package.json versions.json packages/extension/src/background.ts
git commit -m "chore: sync relay version to 2.5.0, update versions.json, clean debug logs

- packages/relay/package.json: 1.1.0 → 2.5.0
- versions.json: update relay/extension latest versions
- background.ts: remove temporary debug logging, set push timeout to 5s

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: Fix Relay Push Payload Size Limit

**Files:**

- Modify: `packages/relay/src/routes/push.ts`

The 413 bug from this session — already fixed (1MB → 5MB), but needs a proper commit.

**Step 1: Verify the fix is in place**

Check that line 46 in `push.ts` reads:

```typescript
const MAX_PAYLOAD_SIZE = 5 * 1024 * 1024; // 5MB
```

**Step 2: Build**

Run: `npm run build -w packages/relay`

**Step 3: Commit** (if not already committed)

```bash
git add packages/relay/src/routes/push.ts
git commit -m "fix(relay): increase rawRows payload limit from 1MB to 5MB

Pages with aside filters + many snippets exceed 1MB. Express body
parser already accepts 10MB — align the application-level check.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: End-to-End Verification

**Step 1: Build all packages**

Run: `npm run verify`
Expected: typecheck + lint + test + build all pass

**Step 2: Verify release script syntax**

Run: `bash -n scripts/release.sh`
Expected: no output (valid syntax)

**Step 3: Test relay routes locally**

Start relay: `node packages/relay/dist/index.js &`

```bash
# Test /versions proxy
curl -s http://localhost:3847/versions | jq .

# Test /extension.crx (should 404 — no CRX cached yet)
curl -s http://localhost:3847/extension.crx | jq .

# Test /health (verify version is 2.5.0)
curl -s http://localhost:3847/health | jq .version
```

Kill relay: `kill %1`

**Step 4: Verify versions match across all files**

```bash
echo "Root:      $(node -p 'require("./package.json").version')"
echo "Plugin:    $(grep PLUGIN_VERSION packages/plugin/src/config.ts | grep -o '[0-9.]*')"
echo "Extension: $(node -p 'require("./packages/extension/manifest.json").version')"
echo "Relay:     $(node -p 'require("./packages/relay/package.json").version')"
echo "versions:  $(node -p 'JSON.parse(require("fs").readFileSync("versions.json","utf8")).relay.latest')"
```

Expected: all show `2.5.0`

---

### Task 10: Update Documentation

**Files:**

- Modify: `.claude/rules/release.md`

**Step 1: Update release.md with new process**

```markdown
# Release Process

## One Command

\`\`\`bash
npm run release [patch|minor|major|X.Y.Z]
\`\`\`

The script handles everything:

1. Pre-flight: branch=main, clean worktree, `npm run verify`
2. Bumps 5 version files (see below)
3. Commits, tags, pushes
4. GitHub Actions builds artifacts + updates `versions.json`

## Version Files (auto-bumped by script)

1. `package.json` → `version`
2. `packages/plugin/src/config.ts` → `PLUGIN_VERSION`
3. `packages/extension/manifest.json` → `version`
4. `packages/extension/updates.xml` → `version`
5. `packages/relay/package.json` → `version`

## Update Delivery

| Component | Mechanism                                   |
| --------- | ------------------------------------------- |
| Plugin    | Figma Community (automatic)                 |
| Relay     | Self-update from GitHub Releases (every 6h) |
| Extension | Notification in plugin UI → download CRX    |

## Release Artifacts (GitHub Actions, on tag `v*`)

| Artifact                      | Description                               |
| ----------------------------- | ----------------------------------------- |
| `contentify.crx`              | Chrome extension (signed CRX)             |
| `contentify-relay-host-arm64` | Relay binary (Apple Silicon)              |
| `contentify-relay-host-x64`   | Relay binary (Intel)                      |
| `versions.json`               | Version manifest (auto-committed to main) |

## Manual Release (if script fails)

\`\`\`bash

# 1. Bump versions in all 5 files above

# 2. Commit

git commit -m "chore: release vX.Y.Z"

# 3. Tag

git tag vX.Y.Z

# 4. Push (Actions will build artifacts)

git push origin main --tags
\`\`\`
```

**Step 2: Commit**

```bash
git add .claude/rules/release.md
git commit -m "docs: update release process with new script and delivery mechanisms

Co-Authored-By: Claude <noreply@anthropic.com>"
```
