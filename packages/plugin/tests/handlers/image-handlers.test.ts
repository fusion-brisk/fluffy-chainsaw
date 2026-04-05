/**
 * Tests for image handlers — handleImageType routing logic
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockInstance } from '../setup';

// Mock dependencies
vi.mock('../../src/logger', () => ({
  Logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../src/utils/node-search', () => ({
  findFirstNodeByName: vi.fn(() => null),
}));

vi.mock('../../src/sandbox/image-apply', () => ({
  fetchAndApplyImage: vi.fn(() => Promise.resolve()),
}));

import { handleImageType } from '../../src/sandbox/handlers/image-handlers';
import { findFirstNodeByName } from '../../src/utils/node-search';
import { fetchAndApplyImage } from '../../src/sandbox/image-apply';
import type { HandlerContext } from '../../src/sandbox/handlers/types';

const mockFindFirstNodeByName = vi.mocked(findFirstNodeByName);
const mockFetchAndApplyImage = vi.mocked(fetchAndApplyImage);

function createContext(containerName: string, row: Record<string, string> | null): HandlerContext {
  const container = createMockInstance(containerName);
  // handleImageType checks container.type directly
  container.type = 'INSTANCE';
  return {
    container,
    containerKey: container.id,
    row: row as HandlerContext['row'],
  };
}

describe('handleImageType', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns early when row is null', async () => {
    const ctx = createContext('ESnippet', null);

    await handleImageType(ctx);

    expect(mockFetchAndApplyImage).not.toHaveBeenCalled();
  });

  it('returns early when container is null', async () => {
    await handleImageType({
      container: null as unknown as BaseNode,
      containerKey: '',
      row: { '#imageType': 'EThumb' } as HandlerContext['row'],
    });

    expect(mockFetchAndApplyImage).not.toHaveBeenCalled();
  });

  it('applies single image when imageType is EThumb', async () => {
    const ctx = createContext('ESnippet', {
      '#imageType': 'EThumb',
      '#OrganicImage': 'https://example.com/image.jpg',
    });

    // findFirstNodeByName returns a mock layer for #OrganicImage
    const mockLayer = {
      id: 'layer-1',
      name: '#OrganicImage',
      type: 'RECTANGLE',
      fills: [],
    };
    mockFindFirstNodeByName.mockImplementation((_container, name) => {
      if (name === '#OrganicImage') return mockLayer as unknown as SceneNode;
      return null;
    });

    await handleImageType(ctx);

    expect(mockFetchAndApplyImage).toHaveBeenCalledWith(
      mockLayer,
      'https://example.com/image.jpg',
      'FIT',
      '[applySingleImage]',
    );
  });

  it('applies single image when imageType is absent (defaults to single)', async () => {
    const ctx = createContext('ESnippet', {
      '#OrganicImage': 'https://example.com/image.jpg',
    });

    const mockLayer = {
      id: 'layer-1',
      name: '#OrganicImage',
      type: 'RECTANGLE',
      fills: [],
    };
    mockFindFirstNodeByName.mockImplementation((_container, name) => {
      if (name === '#OrganicImage') return mockLayer as unknown as SceneNode;
      return null;
    });

    await handleImageType(ctx);

    expect(mockFetchAndApplyImage).toHaveBeenCalledWith(
      mockLayer,
      'https://example.com/image.jpg',
      'FIT',
      '[applySingleImage]',
    );
  });

  it('does not apply single image when imageType is EThumbGroup', async () => {
    const ctx = createContext('ESnippet', {
      '#imageType': 'EThumbGroup',
      '#OrganicImage': 'https://example.com/image.jpg',
    });

    // No image layers found — simulates EThumbGroup without #Image1/#OrganicImage
    mockFindFirstNodeByName.mockReturnValue(null);

    await handleImageType(ctx);

    // fetchAndApplyImage should NOT be called since no image layers found
    // and EThumbGroup path also found nothing
    expect(mockFetchAndApplyImage).not.toHaveBeenCalled();
  });

  it('applies thumb group images when imageType is EThumbGroup and #Image1 exists', async () => {
    const ctx = createContext('ESnippet', {
      '#imageType': 'EThumbGroup',
      '#Image1': 'https://example.com/img1.jpg',
      '#Image2': 'https://example.com/img2.jpg',
      '#Image3': 'https://example.com/img3.jpg',
    });

    const mockImage1 = {
      id: 'img1',
      name: '#Image1',
      type: 'RECTANGLE',
      fills: [],
    };
    const mockImage2 = {
      id: 'img2',
      name: '#Image2',
      type: 'RECTANGLE',
      fills: [],
    };
    const mockImage3 = {
      id: 'img3',
      name: '#Image3',
      type: 'RECTANGLE',
      fills: [],
    };

    mockFindFirstNodeByName.mockImplementation((_container, name) => {
      if (name === '#Image1') return mockImage1 as unknown as SceneNode;
      if (name === '#Image2') return mockImage2 as unknown as SceneNode;
      if (name === '#Image3') return mockImage3 as unknown as SceneNode;
      return null;
    });

    await handleImageType(ctx);

    expect(mockFetchAndApplyImage).toHaveBeenCalledTimes(3);
    expect(mockFetchAndApplyImage).toHaveBeenCalledWith(
      mockImage1,
      'https://example.com/img1.jpg',
      'FIT',
      expect.stringContaining('Image1'),
    );
    expect(mockFetchAndApplyImage).toHaveBeenCalledWith(
      mockImage2,
      'https://example.com/img2.jpg',
      'FIT',
      expect.stringContaining('Image2'),
    );
    expect(mockFetchAndApplyImage).toHaveBeenCalledWith(
      mockImage3,
      'https://example.com/img3.jpg',
      'FIT',
      expect.stringContaining('Image3'),
    );
  });

  it('does not crash when EThumb layer is not found for single image', async () => {
    const ctx = createContext('ESnippet', {
      '#imageType': 'EThumb',
      '#OrganicImage': 'https://example.com/image.jpg',
    });

    // No layers found
    mockFindFirstNodeByName.mockReturnValue(null);

    await handleImageType(ctx);

    // Should not crash, fetchAndApplyImage not called since layer not found
    expect(mockFetchAndApplyImage).not.toHaveBeenCalled();
  });

  it('skips single image when URL is empty', async () => {
    const ctx = createContext('ESnippet', {
      '#imageType': 'EThumb',
      '#OrganicImage': '',
    });

    await handleImageType(ctx);

    expect(mockFetchAndApplyImage).not.toHaveBeenCalled();
  });

  it('uses #ThumbImage as fallback when #OrganicImage is absent', async () => {
    const ctx = createContext('ESnippet', {
      '#imageType': 'EThumb',
      '#ThumbImage': 'https://example.com/thumb.jpg',
    });

    const mockLayer = {
      id: 'layer-1',
      name: '#ThumbImage',
      type: 'RECTANGLE',
      fills: [],
    };
    mockFindFirstNodeByName.mockImplementation((_container, name) => {
      if (name === '#ThumbImage') return mockLayer as unknown as SceneNode;
      return null;
    });

    await handleImageType(ctx);

    expect(mockFetchAndApplyImage).toHaveBeenCalledWith(
      mockLayer,
      'https://example.com/thumb.jpg',
      'FIT',
      '[applySingleImage]',
    );
  });

  it('uses #OrganicImage as fallback for #Image1 in EThumbGroup', async () => {
    const ctx = createContext('ESnippet', {
      '#imageType': 'EThumbGroup',
      '#OrganicImage': 'https://example.com/organic.jpg',
      // #Image1 is absent — fallback to #OrganicImage
    });

    const mockImage1 = {
      id: 'img1',
      name: '#Image1',
      type: 'RECTANGLE',
      fills: [],
    };

    mockFindFirstNodeByName.mockImplementation((_container, name) => {
      // First call checks for #Image1 (exists) — indicates EThumbGroup branch should activate
      if (name === '#Image1') return mockImage1 as unknown as SceneNode;
      // Strategy 1: return mockImage1 for exact name #Image1
      return null;
    });

    await handleImageType(ctx);

    // The fallback should use #OrganicImage URL for Image1 slot
    expect(mockFetchAndApplyImage).toHaveBeenCalledWith(
      mockImage1,
      'https://example.com/organic.jpg',
      'FIT',
      expect.stringContaining('Image1'),
    );
  });

  it('does not apply images for container types DOCUMENT or PAGE', async () => {
    const container = createMockInstance('SomePage');
    container.type = 'DOCUMENT';

    const ctx: HandlerContext = {
      container,
      containerKey: container.id,
      row: {
        '#imageType': 'EThumb',
        '#OrganicImage': 'https://example.com/image.jpg',
      } as HandlerContext['row'],
    };

    await handleImageType(ctx);

    expect(mockFetchAndApplyImage).not.toHaveBeenCalled();
  });
});
