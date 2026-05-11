import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { YcHttpEvent } from '../src/types';

// Mock object-storage so the route never tries to talk to YC bucket.
vi.mock('../src/object-storage', () => ({
  uploadScreenshotSegment: vi.fn().mockResolvedValue({
    key: 'session-A/123-00.jpg',
    url: 'https://storage.yandexcloud.net/bkt/session-A/123-00.jpg',
  }),
  _resetClientForTests: vi.fn(),
}));

// YDB mocks (handler dispatch needs them, even though the route doesn't).
vi.mock('../src/ydb', () => ({
  insertEntry: vi.fn().mockResolvedValue(undefined),
  findFirstPending: vi.fn().mockResolvedValue(null),
  markPeeked: vi.fn().mockResolvedValue(undefined),
  deleteEntry: vi.fn().mockResolvedValue({ removed: true }),
  rejectEntry: vi.fn().mockResolvedValue(undefined),
  clearSession: vi.fn().mockResolvedValue({ cleared: 0 }),
  getStatus: vi.fn().mockResolvedValue({ queueSize: 0, pendingCount: 0, firstEntry: null }),
  getDriver: vi.fn(),
  destroyDriver: vi.fn().mockResolvedValue(undefined),
  upsertHeadsUp: vi.fn().mockResolvedValue(undefined),
  getHeadsUp: vi.fn().mockResolvedValue(null),
  clearHeadsUp: vi.fn().mockResolvedValue(undefined),
}));

import { handler } from '../src/handler';
import * as objectStorage from '../src/object-storage';

function makeEvent(over: Partial<YcHttpEvent> = {}): YcHttpEvent {
  return {
    httpMethod: 'POST',
    path: '/upload-screenshot',
    queryStringParameters: { session: 'ABC123' },
    headers: { 'content-type': 'application/json' },
    ...over,
  };
}

// Smallest possible JPEG (1x1 px, validated by online tools).
const TINY_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AL+AB//Z';

describe('POST /upload-screenshot — happy path', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uploads a valid base64 JPEG segment and returns key/url', async () => {
    const res = await handler(
      makeEvent({
        body: JSON.stringify({
          segIdx: 0,
          dataBase64: TINY_JPEG_BASE64,
          contentType: 'image/jpeg',
          totalSegments: 3,
        }),
      }),
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body || '{}');
    expect(body.key).toBeDefined();
    expect(body.url).toContain('https://storage.yandexcloud.net/');
    expect(objectStorage.uploadScreenshotSegment).toHaveBeenCalledTimes(1);
    // The route generates a key from sessionId + segIdx + timestamp; check
    // the first argument (key string) the route passed to the storage call.
    const generatedKey = vi.mocked(objectStorage.uploadScreenshotSegment).mock.calls[0][0];
    expect(generatedKey).toMatch(/^ABC123\/\d+-00\.jpg$/);
  });

  it('defaults contentType to image/jpeg when not provided', async () => {
    const res = await handler(
      makeEvent({
        body: JSON.stringify({ segIdx: 1, dataBase64: TINY_JPEG_BASE64 }),
      }),
    );
    expect(res.statusCode).toBe(200);
    const callArgs = vi.mocked(objectStorage.uploadScreenshotSegment).mock.calls[0];
    expect(callArgs[2]).toBe('image/jpeg');
  });
});

describe('POST /upload-screenshot — validation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects missing body (400)', async () => {
    const res = await handler(makeEvent({ body: undefined }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body || '{}').error).toMatch(/body/i);
  });

  it('rejects negative segIdx (400)', async () => {
    const res = await handler(
      makeEvent({ body: JSON.stringify({ segIdx: -1, dataBase64: TINY_JPEG_BASE64 }) }),
    );
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body || '{}').error).toMatch(/segIdx/);
  });

  it('rejects segIdx >= 30 (400)', async () => {
    const res = await handler(
      makeEvent({ body: JSON.stringify({ segIdx: 30, dataBase64: TINY_JPEG_BASE64 }) }),
    );
    expect(res.statusCode).toBe(400);
  });

  it('rejects empty dataBase64 (400)', async () => {
    const res = await handler(makeEvent({ body: JSON.stringify({ segIdx: 0, dataBase64: '' }) }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body || '{}').error).toMatch(/dataBase64/);
  });

  it('rejects payloads larger than 4MB raw (413)', async () => {
    // 5 MB of zero bytes → 6.67 MB base64
    const big = Buffer.alloc(5 * 1024 * 1024).toString('base64');
    const res = await handler(makeEvent({ body: JSON.stringify({ segIdx: 0, dataBase64: big }) }));
    expect(res.statusCode).toBe(413);
    const body = JSON.parse(res.body || '{}');
    expect(body.maxBytes).toBeDefined();
  });

  it('rejects unknown contentType, falls back to jpeg', async () => {
    const res = await handler(
      makeEvent({
        body: JSON.stringify({
          segIdx: 0,
          dataBase64: TINY_JPEG_BASE64,
          contentType: 'application/octet-stream',
        }),
      }),
    );
    expect(res.statusCode).toBe(200);
    const callArgs = vi.mocked(objectStorage.uploadScreenshotSegment).mock.calls[0];
    expect(callArgs[2]).toBe('image/jpeg');
  });
});

describe('POST /upload-screenshot — storage failure', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 502 when object storage upload throws', async () => {
    vi.mocked(objectStorage.uploadScreenshotSegment).mockRejectedValueOnce(
      new Error('S3 unreachable'),
    );
    const res = await handler(
      makeEvent({ body: JSON.stringify({ segIdx: 0, dataBase64: TINY_JPEG_BASE64 }) }),
    );
    expect(res.statusCode).toBe(502);
    const body = JSON.parse(res.body || '{}');
    expect(body.error).toMatch(/storage/i);
    expect(body.detail).toBe('S3 unreachable');
  });
});

describe('POST /push — meta.screenshotKeys validation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('accepts well-formed screenshotKeys + Urls + Meta', async () => {
    const res = await handler(
      makeEvent({
        path: '/push',
        body: JSON.stringify({
          payload: { rawRows: [] },
          meta: {
            screenshotKeys: ['ABC123/1-00.jpg', 'ABC123/1-01.jpg'],
            screenshotUrls: [
              'https://storage.yandexcloud.net/bkt/ABC123/1-00.jpg',
              'https://storage.yandexcloud.net/bkt/ABC123/1-01.jpg',
            ],
            screenshotMeta: {
              totalHeight: 5294,
              viewportHeight: 900,
              viewportWidth: 1440,
              devicePixelRatio: 2,
              count: 2,
            },
          },
        }),
      }),
    );
    expect(res.statusCode).toBe(200);
  });

  it('rejects screenshotKeys/Urls length mismatch (400)', async () => {
    const res = await handler(
      makeEvent({
        path: '/push',
        body: JSON.stringify({
          payload: { rawRows: [] },
          meta: {
            screenshotKeys: ['k1'],
            screenshotUrls: ['https://x/a', 'https://x/b'],
          },
        }),
      }),
    );
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body || '{}').error).toMatch(/length mismatch/);
  });

  it('rejects non-https screenshotUrls (400)', async () => {
    const res = await handler(
      makeEvent({
        path: '/push',
        body: JSON.stringify({
          payload: { rawRows: [] },
          meta: { screenshotUrls: ['http://insecure'] },
        }),
      }),
    );
    expect(res.statusCode).toBe(400);
  });

  it('rejects screenshotMeta with zero totalHeight (400)', async () => {
    const res = await handler(
      makeEvent({
        path: '/push',
        body: JSON.stringify({
          payload: { rawRows: [] },
          meta: {
            screenshotMeta: {
              totalHeight: 0,
              viewportHeight: 900,
              viewportWidth: 1440,
              devicePixelRatio: 2,
              count: 1,
            },
          },
        }),
      }),
    );
    expect(res.statusCode).toBe(400);
  });

  it('passes through when no screenshot fields are present (back-compat)', async () => {
    const res = await handler(
      makeEvent({
        path: '/push',
        body: JSON.stringify({ payload: { rawRows: [] }, meta: { extensionVersion: '3.1.2' } }),
      }),
    );
    expect(res.statusCode).toBe(200);
  });
});
