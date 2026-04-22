#!/usr/bin/env bash
# One-time bootstrap: create the queue_entries table in the configured YDB
# database. Run this after provisioning the serverless database in YC Console.
#
# Usage:
#   YDB_PROFILE=my-profile ./scripts/bootstrap-ydb.sh
#
# Requires the `ydb` CLI (https://ydb.tech/docs/en/reference/ydb-cli/install)
# with a pre-configured profile. The profile's endpoint + database are used —
# no need to pass them explicitly.

set -euo pipefail

# Move to package root so relative paths work regardless of where the script
# is invoked from (e.g. `npm run bootstrap-ydb` from the monorepo root).
cd "$(dirname "$0")/.."

YDB_PROFILE="${YDB_PROFILE:-default}"
SCHEMA_FILE="schema/queue.yql"

if ! command -v ydb >/dev/null 2>&1; then
  echo "error: ydb CLI not found on PATH" >&2
  echo "install from https://ydb.tech/docs/en/reference/ydb-cli/install" >&2
  exit 1
fi

if [ ! -f "$SCHEMA_FILE" ]; then
  echo "error: schema file not found: $SCHEMA_FILE" >&2
  exit 1
fi

echo "Applying $SCHEMA_FILE with profile '$YDB_PROFILE'..."
if ydb -p "$YDB_PROFILE" yql -f "$SCHEMA_FILE"; then
  echo "OK — queue_entries table created (or already exists)."
else
  echo "error: ydb yql failed — check profile, endpoint, and database." >&2
  exit 1
fi
