/**
 * Tests for image-apply — normalizeImageUrl (pure function, no Figma mocks)
 */

import { describe, it, expect } from 'vitest';
import { normalizeImageUrl } from '../../src/sandbox/image-apply';

describe('normalizeImageUrl', () => {
  it('returns https URL as-is', () => {
    expect(normalizeImageUrl('https://example.com/img.jpg')).toBe('https://example.com/img.jpg');
  });

  it('returns http URL as-is', () => {
    expect(normalizeImageUrl('http://example.com/img.jpg')).toBe('http://example.com/img.jpg');
  });

  it('prepends https: to protocol-relative URL', () => {
    expect(normalizeImageUrl('//example.com/img.jpg')).toBe('https://example.com/img.jpg');
  });

  it('returns null for empty string', () => {
    expect(normalizeImageUrl('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(normalizeImageUrl('   ')).toBeNull();
  });

  it('returns null for ftp protocol', () => {
    expect(normalizeImageUrl('ftp://example.com/file')).toBeNull();
  });

  it('returns null for data: URI (handled separately in fetchAndApplyImage)', () => {
    expect(normalizeImageUrl('data:image/png;base64,abc')).toBeNull();
  });

  it('returns null for javascript: URI', () => {
    expect(normalizeImageUrl('javascript:alert(1)')).toBeNull();
  });

  it('returns null for plain text', () => {
    expect(normalizeImageUrl('not a url')).toBeNull();
  });

  it('returns null for relative path', () => {
    expect(normalizeImageUrl('/images/photo.jpg')).toBeNull();
  });

  it('handles URL with query params', () => {
    expect(normalizeImageUrl('https://example.com/img.jpg?w=100&h=200'))
      .toBe('https://example.com/img.jpg?w=100&h=200');
  });

  it('handles protocol-relative URL with path', () => {
    expect(normalizeImageUrl('//avatars.mds.yandex.net/get-mpic/123/img/orig'))
      .toBe('https://avatars.mds.yandex.net/get-mpic/123/img/orig');
  });
});
