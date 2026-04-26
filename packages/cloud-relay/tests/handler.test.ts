import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { YcHttpEvent } from '../src/types';

// Mock the YDB layer wholesale so the handler never touches the real driver.
// The insertEntry mock is reassigned in the 500-path test via mockRejectedValueOnce.
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
  // Heads-up mocks (Task 2 helpers)
  upsertHeadsUp: vi.fn().mockResolvedValue(undefined),
  getHeadsUp: vi.fn().mockResolvedValue(null),
  clearHeadsUp: vi.fn().mockResolvedValue(undefined),
}));

// Import AFTER vi.mock so the mocked module is bound into handler's routes.
import { handler } from '../src/handler';
import * as ydb from '../src/ydb';

function makeEvent(over: Partial<YcHttpEvent> = {}): YcHttpEvent {
  return {
    httpMethod: 'GET',
    path: '/status',
    queryStringParameters: {},
    ...over,
  };
}

describe('handler — dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('OPTIONS returns 204 with CORS headers', async () => {
    const res = await handler(makeEvent({ httpMethod: 'OPTIONS' }));
    expect(res.statusCode).toBe(204);
    expect(res.body).toBeUndefined();
    expect(res.headers?.['Access-Control-Allow-Origin']).toBe('*');
    expect(res.headers?.['Access-Control-Allow-Methods']).toContain('POST');
    expect(res.headers?.['Access-Control-Allow-Methods']).toContain('OPTIONS');
    expect(res.headers?.['Access-Control-Allow-Headers']).toContain('Content-Type');
  });

  it('GET /health returns 200 without sessionId', async () => {
    const res = await handler(
      makeEvent({ httpMethod: 'GET', path: '/health', queryStringParameters: {} }),
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body || '{}');
    expect(body.ok).toBe(true);
    expect(body.version).toBeDefined();
    expect(typeof body.timestamp).toBe('number');
    expect(res.headers?.['Access-Control-Allow-Origin']).toBe('*');
  });

  it('GET /health ignores query params entirely (no session required)', async () => {
    const res = await handler(
      makeEvent({ httpMethod: 'GET', path: '/health', queryStringParameters: undefined }),
    );
    expect(res.statusCode).toBe(200);
  });

  it('POST /push without session returns 400', async () => {
    const res = await handler(
      makeEvent({
        httpMethod: 'POST',
        path: '/push',
        queryStringParameters: {},
        body: JSON.stringify({ payload: {}, meta: {} }),
      }),
    );
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body || '{}');
    expect(body.error).toMatch(/session/i);
  });

  it('POST /push with invalid session (lowercase) returns 400', async () => {
    const res = await handler(
      makeEvent({
        httpMethod: 'POST',
        path: '/push',
        queryStringParameters: { session: 'abc123' },
        body: JSON.stringify({ payload: {}, meta: {} }),
      }),
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST /push?session=ABC123 dispatches to route and returns 200', async () => {
    const res = await handler(
      makeEvent({
        httpMethod: 'POST',
        path: '/push',
        queryStringParameters: { session: 'ABC123' },
        body: JSON.stringify({ payload: { rawRows: [{ '#query': 't' }] }, meta: {} }),
      }),
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body || '{}');
    expect(body.success).toBe(true);
    expect(body.entryId).toBeDefined();
    expect(ydb.insertEntry).toHaveBeenCalledTimes(1);
    expect(ydb.getStatus).toHaveBeenCalledWith('ABC123');
  });

  it('unknown path with valid session returns 404', async () => {
    const res = await handler(
      makeEvent({
        httpMethod: 'GET',
        path: '/nonexistent',
        queryStringParameters: { session: 'ABC123' },
      }),
    );
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body || '{}');
    expect(body.error).toBeDefined();
    // Still has CORS headers on 404.
    expect(res.headers?.['Access-Control-Allow-Origin']).toBe('*');
  });

  it('wrong method on known path returns 404 (route key is METHOD + path)', async () => {
    // /push is POST only — a GET should not match.
    const res = await handler(
      makeEvent({
        httpMethod: 'GET',
        path: '/push',
        queryStringParameters: { session: 'ABC123' },
      }),
    );
    expect(res.statusCode).toBe(404);
  });

  it('route throwing → 500 with error body', async () => {
    vi.mocked(ydb.insertEntry).mockRejectedValueOnce(new Error('ydb down'));

    const res = await handler(
      makeEvent({
        httpMethod: 'POST',
        path: '/push',
        queryStringParameters: { session: 'ABC123' },
        body: JSON.stringify({ payload: { rawRows: [] }, meta: {} }),
      }),
    );
    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body || '{}');
    expect(body.error).toBeDefined();
    // 500 still carries CORS headers so the browser surfaces the error.
    expect(res.headers?.['Access-Control-Allow-Origin']).toBe('*');
  });
});

describe('POST /push — heads-up branch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes kind=heads-up to upsertHeadsUp and returns 204', async () => {
    const res = await handler(
      makeEvent({
        httpMethod: 'POST',
        path: '/push',
        queryStringParameters: { session: 'ABC123' },
        body: JSON.stringify({
          kind: 'heads-up',
          phase: 'parsing',
        }),
      }),
    );
    expect(res.statusCode).toBe(204);
    expect(ydb.upsertHeadsUp).toHaveBeenCalledWith('ABC123', 'parsing', {
      current: null,
      total: null,
      message: null,
    });
    expect(ydb.insertEntry).not.toHaveBeenCalled();
  });

  it('forwards current/total for uploading_screenshots phase', async () => {
    const res = await handler(
      makeEvent({
        httpMethod: 'POST',
        path: '/push',
        queryStringParameters: { session: 'ABC123' },
        body: JSON.stringify({
          kind: 'heads-up',
          phase: 'uploading_screenshots',
          current: 7,
          total: 27,
        }),
      }),
    );
    expect(res.statusCode).toBe(204);
    expect(ydb.upsertHeadsUp).toHaveBeenCalledWith('ABC123', 'uploading_screenshots', {
      current: 7,
      total: 27,
      message: null,
    });
  });

  it('rejects uploading_screenshots without current/total (400)', async () => {
    const res = await handler(
      makeEvent({
        httpMethod: 'POST',
        path: '/push',
        queryStringParameters: { session: 'ABC123' },
        body: JSON.stringify({ kind: 'heads-up', phase: 'uploading_screenshots' }),
      }),
    );
    expect(res.statusCode).toBe(400);
    expect(ydb.upsertHeadsUp).not.toHaveBeenCalled();
  });

  it('rejects unknown phase (400)', async () => {
    const res = await handler(
      makeEvent({
        httpMethod: 'POST',
        path: '/push',
        queryStringParameters: { session: 'ABC123' },
        body: JSON.stringify({ kind: 'heads-up', phase: 'totally_invented' }),
      }),
    );
    expect(res.statusCode).toBe(400);
  });

  it('rejects combined payload + heads-up body (400)', async () => {
    const res = await handler(
      makeEvent({
        httpMethod: 'POST',
        path: '/push',
        queryStringParameters: { session: 'ABC123' },
        body: JSON.stringify({
          kind: 'heads-up',
          phase: 'parsing',
          payload: { rawRows: [] },
        }),
      }),
    );
    expect(res.statusCode).toBe(400);
  });

  it('truncates error message to 500 chars', async () => {
    const longMessage = 'x'.repeat(1000);
    await handler(
      makeEvent({
        httpMethod: 'POST',
        path: '/push',
        queryStringParameters: { session: 'ABC123' },
        body: JSON.stringify({ kind: 'heads-up', phase: 'error', message: longMessage }),
      }),
    );
    expect(ydb.upsertHeadsUp).toHaveBeenCalledWith(
      'ABC123',
      'error',
      expect.objectContaining({ message: 'x'.repeat(500) }),
    );
  });

  it('legacy push (no kind field) still routes to insertEntry', async () => {
    const res = await handler(
      makeEvent({
        httpMethod: 'POST',
        path: '/push',
        queryStringParameters: { session: 'ABC123' },
        body: JSON.stringify({ payload: { rawRows: [] }, meta: {} }),
      }),
    );
    expect(res.statusCode).toBe(200);
    expect(ydb.insertEntry).toHaveBeenCalled();
    expect(ydb.upsertHeadsUp).not.toHaveBeenCalled();
  });
});

describe('GET /status — headsUp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns headsUp:null when getHeadsUp returns null', async () => {
    (ydb.getHeadsUp as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const res = await handler(
      makeEvent({
        httpMethod: 'GET',
        path: '/status',
        queryStringParameters: { session: 'ABC123' },
      }),
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body || '{}');
    expect(body.headsUp).toBeNull();
  });

  it('returns serialized headsUp when present', async () => {
    const ts = new Date('2026-04-26T12:00:00Z');
    (ydb.getHeadsUp as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      sessionId: 'ABC123',
      phase: 'uploading_screenshots',
      current: 7,
      total: 27,
      message: null,
      ts,
      expiresAt: new Date(ts.getTime() + 30000),
    });
    const res = await handler(
      makeEvent({
        httpMethod: 'GET',
        path: '/status',
        queryStringParameters: { session: 'ABC123' },
      }),
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body || '{}');
    expect(body.headsUp).toEqual({
      phase: 'uploading_screenshots',
      current: 7,
      total: 27,
      ts: ts.getTime(),
    });
  });

  it('omits null fields from serialized headsUp', async () => {
    const ts = new Date('2026-04-26T12:00:00Z');
    (ydb.getHeadsUp as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      sessionId: 'ABC123',
      phase: 'parsing',
      current: null,
      total: null,
      message: null,
      ts,
      expiresAt: new Date(ts.getTime() + 30000),
    });
    const res = await handler(
      makeEvent({
        httpMethod: 'GET',
        path: '/status',
        queryStringParameters: { session: 'ABC123' },
      }),
    );
    const body = JSON.parse(res.body || '{}');
    expect(body.headsUp).toEqual({ phase: 'parsing', ts: ts.getTime() });
    expect(body.headsUp).not.toHaveProperty('current');
    expect(body.headsUp).not.toHaveProperty('total');
    expect(body.headsUp).not.toHaveProperty('message');
  });
});

describe('DELETE /clear — heads-up', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clears both queue and heads-up', async () => {
    const res = await handler(
      makeEvent({
        httpMethod: 'DELETE',
        path: '/clear',
        queryStringParameters: { session: 'ABC123' },
      }),
    );
    expect(res.statusCode).toBe(200);
    expect(ydb.clearSession).toHaveBeenCalledWith('ABC123');
    expect(ydb.clearHeadsUp).toHaveBeenCalledWith('ABC123');
  });

  it('returns cleared count from queue (heads-up does not change count)', async () => {
    (ydb.clearSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ cleared: 3 });
    const res = await handler(
      makeEvent({
        httpMethod: 'DELETE',
        path: '/clear',
        queryStringParameters: { session: 'ABC123' },
      }),
    );
    const body = JSON.parse(res.body || '{}');
    expect(body.cleared).toBe(3);
  });
});
