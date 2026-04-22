import { describe, expect, it } from 'vitest';

import { extractSessionId } from '../src/session';
import type { YcHttpEvent } from '../src/types';

function makeEvent(session?: string): YcHttpEvent {
  return {
    httpMethod: 'GET',
    path: '/peek',
    queryStringParameters: session !== undefined ? { session } : undefined,
  };
}

describe('extractSessionId', () => {
  it.each<[string, string, string | null]>([
    ['valid A-Z + 0-9', 'ABC123', 'ABC123'],
    ['all letters', 'ABCDEF', 'ABCDEF'],
    ['all digits', '123456', '123456'],
    ['lowercase rejected', 'abc123', null],
    ['mixed case rejected', 'AbC123', null],
    ['5 chars rejected', 'ABC12', null],
    ['7 chars rejected', 'ABC1234', null],
    ['special chars rejected', 'ABC-12', null],
    ['spaces rejected', 'ABC 12', null],
    ['empty rejected', '', null],
  ])('%s: %s -> %s', (_name, input, expected) => {
    expect(extractSessionId(makeEvent(input))).toBe(expected);
  });

  it('missing queryStringParameters returns null', () => {
    expect(extractSessionId(makeEvent())).toBeNull();
  });
});
