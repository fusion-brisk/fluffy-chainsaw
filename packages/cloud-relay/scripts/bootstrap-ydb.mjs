#!/usr/bin/env node
/**
 * Bootstrap: create the `queue_entries` table in the configured YDB database.
 * Idempotent — schema uses CREATE TABLE IF NOT EXISTS, safe to re-run.
 *
 * Usage (from repo root):
 *   YDB_ENDPOINT=... YDB_DATABASE=... YC_TOKEN=... \
 *     npm run bootstrap-ydb -w packages/cloud-relay
 *
 * Auth (in order of precedence):
 *   - YC_TOKEN               — a Yandex Cloud OAuth or IAM token (for local runs)
 *   - YDB_METADATA_CREDENTIALS=1  — use instance metadata (for running inside YC)
 *   - YDB_ACCESS_TOKEN_CREDENTIALS — explicit IAM token
 *
 * YDB_ENDPOINT example: grpcs://ydb.serverless.yandexcloud.net:2135
 * YDB_DATABASE example: /ru-central1/b1g.../etn...
 */

import { Driver, getCredentialsFromEnv, TokenAuthService } from 'ydb-sdk';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(__dirname, '..', 'schema', 'queue.yql');

const endpoint = process.env.YDB_ENDPOINT;
const database = process.env.YDB_DATABASE;

if (!endpoint || !database) {
  console.error('error: YDB_ENDPOINT and YDB_DATABASE env vars are required');
  console.error('  YDB_ENDPOINT=grpcs://ydb.serverless.yandexcloud.net:2135');
  console.error('  YDB_DATABASE=/ru-central1/b1g.../etn...');
  process.exit(1);
}

// Auth: prefer explicit YC_TOKEN (common local-dev case), fall back to getCredentialsFromEnv.
let authService;
if (process.env.YC_TOKEN) {
  authService = new TokenAuthService(process.env.YC_TOKEN);
} else {
  authService = getCredentialsFromEnv();
}

console.log(`Connecting to ${endpoint}${database}...`);
const driver = new Driver({ endpoint, database, authService });

const ready = await driver.ready(15_000);
if (!ready) {
  console.error(
    'error: YDB driver not ready within 15s — check endpoint, database, and credentials.',
  );
  process.exit(1);
}

try {
  const ddl = await readFile(schemaPath, 'utf8');
  console.log(`Applying DDL from ${schemaPath}...`);

  await driver.tableClient.withSession(async (session) => {
    await session.executeQuery(ddl);
  });

  console.log('OK — queue_entries table created (or already exists).');
} catch (err) {
  console.error('error applying DDL:', err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await driver.destroy();
}
