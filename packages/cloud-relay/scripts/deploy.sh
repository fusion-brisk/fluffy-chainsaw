#!/usr/bin/env bash
# Deploy cloud-relay to Yandex Cloud Functions.
#
# Prerequisites:
#   - yc CLI authenticated: `yc config list` must succeed.
#   - YDB database provisioned + schema applied (npm run bootstrap-ydb).
#   - Required env vars (export or put in packages/cloud-relay/.env):
#       SA_ID          — service account id (must have ydb.editor role)
#       YDB_ENDPOINT   — grpcs://ydb.serverless.yandexcloud.net:2135
#       YDB_DATABASE   — /ru-central1/b1g.../etn...
#   - Optional env vars:
#       FUNCTION_NAME  (default: contentify-relay)
#       RUNTIME        (default: nodejs22)
#       ENTRYPOINT     (default: handler.handler)
#       MEMORY         (default: 256MB)
#       TIMEOUT        (default: 30s)
#
# Usage:
#   npm run deploy -w packages/cloud-relay

set -euo pipefail

cd "$(dirname "$0")/.."

# Load .env if present (gitignored per package .gitignore)
if [ -f ".env" ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

# Locate yc: prefer PATH, fall back to the standard install location.
YC="${YC:-yc}"
if ! command -v "$YC" >/dev/null 2>&1; then
  if [ -x "$HOME/yandex-cloud/bin/yc" ]; then
    YC="$HOME/yandex-cloud/bin/yc"
  else
    echo "error: yc CLI not found. Install from https://cloud.yandex.com/docs/cli/quickstart" >&2
    exit 1
  fi
fi

# Required env
: "${SA_ID:?SA_ID (service account id with ydb.editor role) must be set}"
: "${YDB_ENDPOINT:?YDB_ENDPOINT must be set (e.g. grpcs://ydb.serverless.yandexcloud.net:2135)}"
: "${YDB_DATABASE:?YDB_DATABASE must be set (e.g. /ru-central1/b1g.../etn...)}"

FUNCTION_NAME="${FUNCTION_NAME:-contentify-relay}"
RUNTIME="${RUNTIME:-nodejs22}"
ENTRYPOINT="${ENTRYPOINT:-handler.handler}"
MEMORY="${MEMORY:-256MB}"
TIMEOUT="${TIMEOUT:-30s}"

# Check auth
if ! "$YC" config list >/dev/null 2>&1; then
  echo "error: yc not authenticated. Run 'yc config set token <your-token>' or 'yc init'." >&2
  exit 1
fi

# 1. Build (produces dist/handler.js etc.)
echo "==> Building..."
npm run build

if [ ! -f "dist/handler.js" ]; then
  echo "error: dist/handler.js not produced by build. Did Tasks 3-5 of the plan complete?" >&2
  exit 1
fi

# 2. Stage a deploy package: flat structure with handler.js at root.
echo "==> Staging deploy bundle..."
STAGE_DIR=$(mktemp -d -t contentify-relay-deploy.XXXXXX)
trap 'rm -rf "$STAGE_DIR"' EXIT

cp -R dist/. "$STAGE_DIR/"
cp package.json "$STAGE_DIR/"

# 3. Ensure function container exists
if ! "$YC" serverless function get --name "$FUNCTION_NAME" >/dev/null 2>&1; then
  echo "==> Creating function '$FUNCTION_NAME'..."
  "$YC" serverless function create \
    --name "$FUNCTION_NAME" \
    --description "Contentify cloud relay (replaces local HTTP relay)"
fi

# 4. Upload new version
echo "==> Creating new version..."
"$YC" serverless function version create \
  --function-name "$FUNCTION_NAME" \
  --runtime "$RUNTIME" \
  --entrypoint "$ENTRYPOINT" \
  --memory "$MEMORY" \
  --execution-timeout "$TIMEOUT" \
  --source-path "$STAGE_DIR" \
  --service-account-id "$SA_ID" \
  --environment "YDB_ENDPOINT=$YDB_ENDPOINT,YDB_DATABASE=$YDB_DATABASE,YDB_METADATA_CREDENTIALS=1"

# 5. Make function publicly invokable (idempotent)
echo "==> Enabling unauthenticated invoke..."
"$YC" serverless function allow-unauthenticated-invoke --name "$FUNCTION_NAME" >/dev/null || true

# 6. Resolve invoke URL
FUNC_ID=$("$YC" serverless function get --name "$FUNCTION_NAME" --format json | awk -F'"' '/"id":/ {print $4; exit}')

echo ""
echo "==> Deploy complete."
echo "    Function:   $FUNCTION_NAME"
echo "    Function ID: $FUNC_ID"
echo ""
if [ -n "${GATEWAY_URL:-}" ]; then
  echo "    Gateway URL: $GATEWAY_URL"
  echo ""
  echo "    Save this URL to CLOUD_RELAY_URL in:"
  echo "      packages/plugin/src/config.ts"
  echo "      packages/extension/src/config.ts"
  echo ""
  echo "    Smoke test:"
  echo "      curl $GATEWAY_URL/health"
else
  echo "    (GATEWAY_URL not set — create API Gateway once via:"
  echo "      yc serverless api-gateway create --name contentify-gateway --spec=openapi.yaml"
  echo "     then put the returned domain into .env as GATEWAY_URL.)"
fi
echo ""
echo "    Note: direct function URL (https://functions.yandexcloud.net/$FUNC_ID)"
echo "    does NOT support path-based routing — always use the Gateway URL."
