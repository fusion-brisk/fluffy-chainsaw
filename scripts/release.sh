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
echo "Pre-flight checks..."

# Must be on main
BRANCH=$(git branch --show-current)
if [[ "$BRANCH" != "main" ]]; then
  echo -e "${RED}Must be on 'main' branch (current: $BRANCH)${NC}"
  exit 1
fi
echo "  Branch: main"

# Working tree must be clean
if [[ -n "$(git status --porcelain)" ]]; then
  echo -e "${RED}Working tree is not clean. Commit or stash changes first.${NC}"
  git status --short
  exit 1
fi
echo "  Working tree clean"

# Verify passes
echo "  Running npm run verify..."
if ! npm run verify --silent 2>&1; then
  echo -e "${RED}Verify failed. Fix errors before releasing.${NC}"
  exit 1
fi
echo "  Verify passed"

# === Compute version ===
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo ""
echo "Current version: $CURRENT_VERSION"

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

echo -e "New version: ${GREEN}$NEW_VERSION${NC}"
echo ""

# === Bump files ===
echo "Updating version files..."

# 1. package.json (root)
node -e "
  const pkg = require('./package.json');
  pkg.version = '$NEW_VERSION';
  require('fs').writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"
echo "  package.json"

# 2. packages/plugin/src/config.ts
sed -i '' "s/export const PLUGIN_VERSION = '[^']*'/export const PLUGIN_VERSION = '$NEW_VERSION'/" \
  packages/plugin/src/config.ts
echo "  packages/plugin/src/config.ts"

# 3. packages/extension/manifest.json
node -e "
  const m = require('./packages/extension/manifest.json');
  m.version = '$NEW_VERSION';
  require('fs').writeFileSync('packages/extension/manifest.json', JSON.stringify(m, null, 2) + '\n');
"
echo "  packages/extension/manifest.json"

# 4. packages/extension/updates.xml
sed -i '' "s/version='[^']*'/version='$NEW_VERSION'/" \
  packages/extension/updates.xml
echo "  packages/extension/updates.xml"

# 5. packages/relay/package.json
node -e "
  const pkg = require('./packages/relay/package.json');
  pkg.version = '$NEW_VERSION';
  require('fs').writeFileSync('packages/relay/package.json', JSON.stringify(pkg, null, 2) + '\n');
"
echo "  packages/relay/package.json"

# === Format ===
echo ""
echo "Formatting..."
npx prettier --write package.json packages/extension/manifest.json packages/relay/package.json packages/plugin/src/config.ts 2>/dev/null || true

# === Commit, tag, push ===
echo ""
echo "Committing..."
git add package.json packages/plugin/src/config.ts packages/extension/manifest.json packages/extension/updates.xml packages/relay/package.json
git commit -m "chore: release v$NEW_VERSION"

echo "Tagging v$NEW_VERSION..."
git tag "v$NEW_VERSION"

echo "Pushing to origin..."
git push origin main --tags

echo ""
echo -e "${GREEN}Released v$NEW_VERSION${NC}"
echo ""
echo "GitHub Actions will now build and publish artifacts."
echo "Track progress: https://github.com/fusion-brisk/fluffy-chainsaw/actions"
