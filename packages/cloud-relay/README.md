# @contentify/cloud-relay

Cloud replacement for `packages/relay`. Deploys to **Yandex Cloud Functions** (Node.js 22 runtime) and serves the same HTTP API (`/push`, `/peek`, `/ack`, `/reject`, `/status`, `/clear`, `/health`) over HTTPS with session-based isolation. Persistent queue lives in **YDB** (serverless).

The full migration plan lives at [`.claude/specs/in-progress/cloud-relay.md`](../../.claude/specs/in-progress/cloud-relay.md).

## Commands

```bash
npm run build                         # tsc → dist/
npm run test                          # vitest run
npm run bootstrap-ydb                 # node scripts/bootstrap-ydb.mjs — applies schema once
npm run deploy                        # bash scripts/deploy.sh — deploys to YC Functions
```

## Runtime

- **Yandex Cloud Functions**, Node.js 22 runtime.
- Handler entry: `dist/handler.js` (compiled from `src/handler.ts`).
- No Express / CORS middleware — the function receives the HTTP event from YC and returns a response object directly.

## Dependencies

- [`ydb-sdk`](https://www.npmjs.com/package/ydb-sdk) — official Yandex Database client for Node.js. Pinned to `^5.11.1` (verified on npm at scaffold time; the plan originally guessed `^6.0.0`, but `6.x` is not yet published).
- [`@yandex-cloud/nodejs-sdk`](https://www.npmjs.com/package/@yandex-cloud/nodejs-sdk) — **required peer** for `ydb-sdk`'s metadata-token auth used inside Cloud Functions. Pinned to `^2.9.3` because `ydb-sdk@5.11.1` declares `peerOptional @yandex-cloud/nodejs-sdk@^2.0.0` — installing `3.x` fails `npm install` inside the function build.

## ES5 constraint does NOT apply

Unlike `packages/plugin/src/sandbox/`, this package runs on Node.js 22 in the cloud. Modern JS (ES2022) is fine.

---

## Deploy workflow

### One-time YC setup

1. **Install `yc` CLI** — https://cloud.yandex.com/docs/cli/quickstart.
2. **Authenticate** — `yc config set token <your-oauth-token>` (or `yc init` for interactive OAuth). Also set `cloud-id` + `folder-id` in the yc config, or pass `--folder-id` on each command.
3. **Create a Service Account** with role `ydb.editor` in your folder:
   ```bash
   yc iam service-account create --name contentify-relay-sa
   yc resource-manager folder add-access-binding <folder-id> \
     --service-account-id <sa-id> \
     --role ydb.editor
   ```
4. **Create a serverless YDB database**:
   ```bash
   yc ydb database create contentify-ydb --serverless --sls-storage-size 10GB
   ```
   Record its `endpoint` and the database path (shown in `yc ydb database get contentify-ydb`).
5. **Create an API Gateway** (one-time — gives the stable public URL used by the extension/plugin). The `openapi.yaml` in this package has a catch-all `/{proxy+}` route that forwards every request to the function:
   ```bash
   # After the function exists (see "Deploy a new version" below, run once):
   yc serverless api-gateway create --name contentify-gateway --spec=openapi.yaml
   ```
   Record the returned `domain`.
   > Direct-invoke URL (`https://functions.yandexcloud.net/<function-id>`) does **not** support path-based routing. The API Gateway is what preserves `/health`, `/push`, `/peek`, etc. in `event.path`-like fields.
6. **Put secrets in `packages/cloud-relay/.env`** (gitignored):
   ```env
   FOLDER_ID=b1g...
   SA_ID=aj...
   YDB_ENDPOINT=grpcs://ydb.serverless.yandexcloud.net:2135
   YDB_DATABASE=/ru-central1/b1g.../etn...
   FUNCTION_ID=d4e...
   GATEWAY_ID=d5d...
   GATEWAY_URL=https://d5d....628pfjdx.apigw.yandexcloud.net
   # For bootstrap-ydb run from your laptop (not used by the deployed function):
   YC_TOKEN=y0__your_oauth_or_iam_token
   ```

### Bootstrap the schema (once per database)

```bash
# From repo root
npm run bootstrap-ydb -w packages/cloud-relay
```

The script reads `YDB_ENDPOINT`, `YDB_DATABASE`, and `YC_TOKEN` from `.env` (or the environment) and applies `schema/queue.yql`. Idempotent — schema uses `CREATE TABLE IF NOT EXISTS`.

### Deploy a new version

```bash
# From repo root
npm run deploy -w packages/cloud-relay
```

The script:

1. Builds with `tsc`.
2. Stages `dist/ + package.json` into a temp dir.
3. Creates the function container on first run (`yc serverless function create`).
4. Uploads a new version with env vars `YDB_ENDPOINT`, `YDB_DATABASE`, `YDB_METADATA_CREDENTIALS=1`.
5. Makes the function publicly invokable (`allow-unauthenticated-invoke`).
6. Prints the invoke URL — paste it into `packages/plugin/src/config.ts` and `packages/extension/src/config.ts` as `CLOUD_RELAY_URL`.

### Smoke test after deploy

```bash
BASE_URL=https://functions.yandexcloud.net/<function-id>
SESSION=TEST01

curl "$BASE_URL/health"
curl "$BASE_URL/status?session=$SESSION"
curl -X POST "$BASE_URL/push?session=$SESSION" \
  -H 'Content-Type: application/json' \
  -d '{"payload":{"rawRows":[{"#query":"test"}]},"meta":{}}'
curl "$BASE_URL/peek?session=$SESSION"
```

Expected: `health` returns `{ok:true}`, `push` returns an `entryId`, `peek` returns the same payload.

### Monitoring

- Function logs: YC Console → Functions → `contentify-relay` → Logs
- YDB data browser: YC Console → YDB → your-db → Navigation → `queue_entries`
- Metrics: YC Console → Monitoring
