/**
 * Yandex Object Storage client (S3-compatible).
 *
 * Used by `routes/upload-screenshot.ts` to store SERP/feed page screenshots
 * uploaded by the extension. Screenshots bypass the 3.5 MB API Gateway body
 * limit by being uploaded directly here, then referenced by short keys in
 * the regular `/push` payload.
 *
 * Bucket lifecycle: 24-hour expiry on objects (configured on the bucket
 * itself, not in code). Keep this client lazy — when the env vars are
 * absent (e.g. local tests), `getS3Client()` throws on first use only.
 */

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

let cachedClient: S3Client | null = null;

interface S3Config {
  client: S3Client;
  bucket: string;
  publicBaseUrl: string;
}

function readEnv(): {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint: string;
  region: string;
  publicBaseUrl: string;
} {
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const bucket = process.env.S3_BUCKET;
  const endpoint = process.env.S3_ENDPOINT ?? 'https://storage.yandexcloud.net';
  const region = process.env.S3_REGION ?? 'ru-central1';
  const publicBaseUrl =
    process.env.SCREENSHOTS_PUBLIC_BASE ?? `${endpoint.replace(/\/$/, '')}/${bucket ?? ''}`;
  if (!accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      'Object Storage env missing: set S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET',
    );
  }
  return { accessKeyId, secretAccessKey, bucket, endpoint, region, publicBaseUrl };
}

function getConfig(): S3Config {
  if (cachedClient) {
    const { bucket, publicBaseUrl } = readEnv();
    return { client: cachedClient, bucket, publicBaseUrl };
  }
  const { accessKeyId, secretAccessKey, bucket, endpoint, region, publicBaseUrl } = readEnv();
  cachedClient = new S3Client({
    region,
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
  return { client: cachedClient, bucket, publicBaseUrl };
}

export interface UploadedObject {
  key: string;
  url: string;
}

/**
 * Upload a JPEG screenshot segment. Caller provides the raw bytes (already
 * base64-decoded) and a key (sessionId + segIdx + timestamp recommended).
 */
export async function uploadScreenshotSegment(
  key: string,
  body: Buffer,
  contentType = 'image/jpeg',
): Promise<UploadedObject> {
  const { client, bucket, publicBaseUrl } = getConfig();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      // No ACL header — bucket-level public-read policy is set out of band
      // (Yandex Object Storage rejects per-object ACLs in some configurations).
    }),
  );
  return {
    key,
    url: `${publicBaseUrl.replace(/\/$/, '')}/${key}`,
  };
}

/** For tests — reset the cached client. Production code never needs this. */
export function _resetClientForTests(): void {
  cachedClient = null;
}
