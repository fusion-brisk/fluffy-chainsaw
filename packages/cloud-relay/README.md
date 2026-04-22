# @contentify/cloud-relay

Cloud replacement for `packages/relay`. Deploys to **Yandex Cloud Functions** (Node.js 22 runtime) and serves the same HTTP API (`/push`, `/peek`, `/ack`, `/reject`, `/status`, `/clear`, `/health`) over HTTPS with session-based isolation. Persistent queue lives in **YDB** (serverless).

The full migration plan lives at [`.claude/specs/in-progress/cloud-relay.md`](../../.claude/specs/in-progress/cloud-relay.md).

## Commands

```bash
npm run build                         # tsc → dist/
npm run test                          # vitest run
npm run deploy                        # bash scripts/deploy.sh (added in Task 6)
npm run bootstrap-ydb                 # bash scripts/bootstrap-ydb.sh (added in Task 6)
```

## Runtime

- **Yandex Cloud Functions**, Node.js 22 runtime.
- Handler entry: `dist/handler.js` (compiled from `src/handler.ts`).
- No Express / CORS middleware — the function signature from YC receives the HTTP event directly.

## Dependencies

- [`ydb-sdk`](https://www.npmjs.com/package/ydb-sdk) — official Yandex Database client for Node.js. Pinned to `^5.11.1` (verified on npm at scaffold time; the spec originally guessed `^6.0.0`, but `6.x` is not yet published).

## ES5 constraint does NOT apply

Unlike `packages/plugin/src/sandbox/`, this package runs on Node.js 22 in the cloud. Modern JS (ES2022) is fine.
