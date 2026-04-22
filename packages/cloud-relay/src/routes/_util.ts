/**
 * Shared helpers for route handlers.
 *
 * Keep this file tiny — only utilities that are actually used by 2+ routes
 * belong here. Route-local logic stays inside its own file.
 */

import type { YcHttpEvent } from '../types';

/**
 * Parse the JSON body of an incoming request. Returns `null` if the body is
 * missing or not valid JSON — the caller decides whether that's a 400 or an
 * accepted "no body" case.
 */
export function parseBody<T>(event: YcHttpEvent): T | null {
  if (!event.body) return null;
  try {
    // API Gateway sets isBase64Encoded=true and encodes the raw bytes.
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf-8')
      : event.body;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Reject primitives / arrays — routes expect a plain object.
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as T;
  } catch {
    return null;
  }
}
