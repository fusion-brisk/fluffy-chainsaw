/**
 * Tests for text-content-handlers — filling text layers with CSV data
 *
 * Covers all 7 exported functions:
 * 1. handleESnippetOrganicTextFallback
 * 2. handleESnippetOrganicHostFromFavicon
 * 3. handleShopInfoUgcAndEReviewsShopText
 * 4. handleOfficialShop
 * 5. handleQuoteText
 * 6. handleOrganicPath
 * 7. handleShopOfflineRegion
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockInstance, createMockTextNode } from '../setup';

// ── Mock dependencies ──────────────────────────────────────────────

vi.mock('../../src/logger', () => ({
  Logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    verbose: vi.fn(),
  },
}));

vi.mock('../../src/sandbox/property-utils', () => ({
  trySetProperty: vi.fn(() => true),
}));

vi.mock('../../src/utils/node-search', () => ({
  findTextLayerByName: vi.fn(() => null),
  findFirstNodeByName: vi.fn(() => null),
  findFirstTextByPredicate: vi.fn(() => null),
  safeSetTextNode: vi.fn(),
}));

vi.mock('../../src/utils/instance-cache', () => ({
  getCachedInstance: vi.fn(() => null),
  getCachedInstanceByNames: vi.fn(() => null),
}));

vi.mock('../../src/sandbox/image-apply', () => ({
  fetchAndApplyImage: vi.fn(),
}));

// ── Imports (after mocks) ──────────────────────────────────────────

import {
  handleESnippetOrganicTextFallback,
  handleESnippetOrganicHostFromFavicon,
  handleShopInfoUgcAndEReviewsShopText,
  handleOfficialShop,
  handleQuoteText,
  handleOrganicPath,
  handleShopOfflineRegion,
} from '../../src/sandbox/handlers/text-content-handlers';

import { trySetProperty } from '../../src/sandbox/property-utils';
import {
  findTextLayerByName,
  findFirstNodeByName,
  findFirstTextByPredicate,
  safeSetTextNode,
} from '../../src/utils/node-search';
import { getCachedInstance } from '../../src/utils/instance-cache';
import { fetchAndApplyImage } from '../../src/sandbox/image-apply';
import type { HandlerContext } from '../../src/sandbox/handlers/types';

// ── Typed mocks ────────────────────────────────────────────────────

const mockFindTextLayerByName = vi.mocked(findTextLayerByName);
const mockFindFirstNodeByName = vi.mocked(findFirstNodeByName);
const mockFindFirstTextByPredicate = vi.mocked(findFirstTextByPredicate);
const mockSafeSetTextNode = vi.mocked(safeSetTextNode);
const mockTrySetProperty = vi.mocked(trySetProperty);
const mockGetCachedInstance = vi.mocked(getCachedInstance);
const mockFetchAndApplyImage = vi.mocked(fetchAndApplyImage);

// ── Helpers ────────────────────────────────────────────────────────

function mockCache() {
  return {
    instances: new Map(),
    textNodes: new Map(),
    groups: new Map(),
    allTextNodes: [],
    stats: { nodeCount: 0, instanceCount: 0, textCount: 0, groupCount: 0, buildTime: 0 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function createContext(containerName: string, row: Record<string, string> | null): HandlerContext {
  const container = createMockInstance(containerName);
  return {
    container,
    containerKey: container.id,
    row: row as HandlerContext['row'],
    instanceCache: mockCache(),
  };
}

// ── 1. handleESnippetOrganicTextFallback ───────────────────────────

describe('handleESnippetOrganicTextFallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns early when row is null', async () => {
    const ctx = createContext('ESnippet', null);
    await handleESnippetOrganicTextFallback(ctx);
    expect(mockSafeSetTextNode).not.toHaveBeenCalled();
  });

  it('returns early when container is null', async () => {
    await handleESnippetOrganicTextFallback({
      container: null as unknown as BaseNode,
      containerKey: '',
      row: {} as HandlerContext['row'],
    });
    expect(mockSafeSetTextNode).not.toHaveBeenCalled();
  });

  it('returns early when container is not ESnippet or Snippet', async () => {
    const ctx = createContext('EShopItem', { '#OrganicText': 'Some text' });
    await handleESnippetOrganicTextFallback(ctx);
    expect(mockSafeSetTextNode).not.toHaveBeenCalled();
  });

  it('sets text on named #OrganicText layer when #OrganicText field present', async () => {
    const ctx = createContext('ESnippet', { '#OrganicText': 'Description text' });
    const textNode = createMockTextNode('#OrganicText', '');
    mockFindTextLayerByName.mockReturnValue(textNode as unknown as TextNode);

    await handleESnippetOrganicTextFallback(ctx);

    expect(mockSafeSetTextNode).toHaveBeenCalledWith(textNode, 'Description text');
  });

  it('falls back to #OrganicTitle when #OrganicText is empty', async () => {
    const ctx = createContext('ESnippet', { '#OrganicText': '', '#OrganicTitle': 'Title text' });
    const textNode = createMockTextNode('#OrganicText', '');
    mockFindTextLayerByName.mockReturnValue(textNode as unknown as TextNode);

    await handleESnippetOrganicTextFallback(ctx);

    expect(mockSafeSetTextNode).toHaveBeenCalledWith(textNode, 'Title text');
  });

  it('reads title from Figma when both fields empty', async () => {
    const ctx = createContext('ESnippet', { '#OrganicText': '', '#OrganicTitle': '' });

    const titleTextNode = createMockTextNode('Title', 'Figma title text');
    const titleBlock = createMockInstance('OrganicTitle');
    // findFirstNodeByName returns the title block for OrganicTitle lookup
    mockFindFirstNodeByName.mockImplementation((_container, name) => {
      if (name === 'Block / Snippet-staff / OrganicTitle' || name === 'OrganicTitle') {
        return titleBlock as unknown as SceneNode;
      }
      return null;
    });
    // findFirstTextByPredicate returns the text inside title block
    mockFindFirstTextByPredicate.mockImplementation((node) => {
      if (node === titleBlock) return titleTextNode as unknown as TextNode;
      return null;
    });
    // Named layer exists for #OrganicText
    const namedLayer = createMockTextNode('#OrganicText', '');
    mockFindTextLayerByName.mockReturnValue(namedLayer as unknown as TextNode);

    await handleESnippetOrganicTextFallback(ctx);

    expect(mockSafeSetTextNode).toHaveBeenCalledWith(namedLayer, 'Figma title text');
  });

  it('falls back to OrganicContentItem when named layer not found', async () => {
    const ctx = createContext('ESnippet', { '#OrganicText': 'Fallback text' });
    // No named layer
    mockFindTextLayerByName.mockReturnValue(null);

    const contentTextNode = createMockTextNode('ContentText', 'old');
    const contentItem = createMockInstance('OrganicContentItem');

    mockFindFirstNodeByName.mockImplementation((_container, name) => {
      if (name === 'Block / Snippet-staff / OrganicContentItem' || name === 'OrganicContentItem') {
        return contentItem as unknown as SceneNode;
      }
      return null;
    });
    mockFindFirstTextByPredicate.mockImplementation((node) => {
      if (node === contentItem) return contentTextNode as unknown as TextNode;
      return null;
    });

    await handleESnippetOrganicTextFallback(ctx);

    expect(mockSafeSetTextNode).toHaveBeenCalledWith(contentTextNode, 'Fallback text');
  });

  it('returns silently when no text data and no Figma title', async () => {
    const ctx = createContext('ESnippet', { '#OrganicText': '', '#OrganicTitle': '' });
    mockFindFirstNodeByName.mockReturnValue(null);
    mockFindTextLayerByName.mockReturnValue(null);

    await handleESnippetOrganicTextFallback(ctx);

    expect(mockSafeSetTextNode).not.toHaveBeenCalled();
  });

  it('works for Snippet container name', async () => {
    const ctx = createContext('Snippet', { '#OrganicText': 'Text' });
    const textNode = createMockTextNode('#OrganicText', '');
    mockFindTextLayerByName.mockReturnValue(textNode as unknown as TextNode);

    await handleESnippetOrganicTextFallback(ctx);

    expect(mockSafeSetTextNode).toHaveBeenCalledWith(textNode, 'Text');
  });
});

// ── 2. handleESnippetOrganicHostFromFavicon ────────────────────────

describe('handleESnippetOrganicHostFromFavicon', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns early when row is null', async () => {
    const ctx = createContext('ESnippet', null);
    await handleESnippetOrganicHostFromFavicon(ctx);
    expect(mockFindFirstNodeByName).not.toHaveBeenCalled();
  });

  it('returns early for non-ESnippet container', async () => {
    const ctx = createContext('EOfferItem', { '#OrganicHost': 'example.com' });
    await handleESnippetOrganicHostFromFavicon(ctx);
    expect(mockFindFirstNodeByName).not.toHaveBeenCalled();
  });

  it('uses #OrganicHost directly when present', async () => {
    const ctx = createContext('ESnippet', { '#OrganicHost': 'shop.ru' });

    const pathBlock = createMockInstance('Path');
    const hostTextNode = createMockTextNode('host', 'old-host.ru');

    mockFindFirstNodeByName.mockImplementation((_container, name) => {
      if (name === 'Block / Snippet-staff / Path' || name === 'Path') {
        return pathBlock as unknown as SceneNode;
      }
      return null;
    });
    mockFindFirstTextByPredicate.mockImplementation((node) => {
      if (node === pathBlock) return hostTextNode as unknown as TextNode;
      return null;
    });

    await handleESnippetOrganicHostFromFavicon(ctx);

    expect(mockSafeSetTextNode).toHaveBeenCalledWith(hostTextNode, 'shop.ru');
  });

  it('extracts host from favicon URL when #OrganicHost empty', async () => {
    const ctx = createContext('ESnippet', {
      '#OrganicHost': '',
      '#FaviconImage': 'https://yastatic.net/favicon/v2/example.com?size=32',
    });

    const pathBlock = createMockInstance('Path');
    const hostTextNode = createMockTextNode('host', 'old-host.ru');

    mockFindFirstNodeByName.mockImplementation((_container, name) => {
      if (name === 'Block / Snippet-staff / Path' || name === 'Path') {
        return pathBlock as unknown as SceneNode;
      }
      return null;
    });
    mockFindFirstTextByPredicate.mockImplementation((node) => {
      if (node === pathBlock) return hostTextNode as unknown as TextNode;
      return null;
    });

    await handleESnippetOrganicHostFromFavicon(ctx);

    // Host extracted from favicon URL should be "example.com"
    expect(mockSafeSetTextNode).toHaveBeenCalledWith(hostTextNode, 'example.com');
    // Also updates the row
    expect(ctx.row!['#OrganicHost']).toBe('example.com');
  });

  it('strips www. prefix from extracted host', async () => {
    const ctx = createContext('ESnippet', {
      '#OrganicHost': '',
      '#FaviconImage': 'https://yastatic.net/favicon/v2/www.example.com?size=32',
    });

    const pathBlock = createMockInstance('Path');
    const hostTextNode = createMockTextNode('host', 'old.com');

    mockFindFirstNodeByName.mockImplementation((_container, name) => {
      if (name === 'Block / Snippet-staff / Path' || name === 'Path') {
        return pathBlock as unknown as SceneNode;
      }
      return null;
    });
    mockFindFirstTextByPredicate.mockImplementation((node) => {
      if (node === pathBlock) return hostTextNode as unknown as TextNode;
      return null;
    });

    await handleESnippetOrganicHostFromFavicon(ctx);

    expect(mockSafeSetTextNode).toHaveBeenCalledWith(hostTextNode, 'example.com');
  });

  it('returns early when no host and no favicon URL', async () => {
    const ctx = createContext('ESnippet', { '#OrganicHost': '' });
    await handleESnippetOrganicHostFromFavicon(ctx);
    expect(mockSafeSetTextNode).not.toHaveBeenCalled();
  });

  it('returns early when favicon URL has no valid host', async () => {
    const ctx = createContext('ESnippet', {
      '#OrganicHost': '',
      '#FaviconImage': 'https://yastatic.net/some-other-path',
    });
    await handleESnippetOrganicHostFromFavicon(ctx);
    expect(mockSafeSetTextNode).not.toHaveBeenCalled();
  });

  it('does nothing when Path block not found', async () => {
    const ctx = createContext('ESnippet', { '#OrganicHost': 'test.ru' });
    mockFindFirstNodeByName.mockReturnValue(null);

    await handleESnippetOrganicHostFromFavicon(ctx);

    expect(mockSafeSetTextNode).not.toHaveBeenCalled();
  });
});

// ── 3. handleShopInfoUgcAndEReviewsShopText ────────────────────────

describe('handleShopInfoUgcAndEReviewsShopText', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns early when row is null', async () => {
    const ctx = createContext('EShopItem', null);
    await handleShopInfoUgcAndEReviewsShopText(ctx);
    expect(mockSafeSetTextNode).not.toHaveBeenCalled();
  });

  it('returns early when both rating and reviews empty', async () => {
    const ctx = createContext('EShopItem', { '#ShopInfo-Ugc': '', '#EReviews_shopText': '' });
    await handleShopInfoUgcAndEReviewsShopText(ctx);
    expect(mockSafeSetTextNode).not.toHaveBeenCalled();
  });

  it('sets rating on Line instances inside EReviewsLabel', async () => {
    const ctx = createContext('EShopItem', {
      '#ShopInfo-Ugc': '4.7',
      '#EReviews_shopText': '123 отзыва',
    });

    const lineInstance0 = createMockInstance('Line');
    const lineInstance1 = createMockInstance('Line');

    const reviewsLabel = createMockInstance('EReviewsLabel');
    reviewsLabel.findAll = vi.fn(() => [lineInstance0, lineInstance1]);

    mockFindFirstNodeByName.mockImplementation((_container, name) => {
      if (name === 'EReviewsLabel') return reviewsLabel as unknown as SceneNode;
      return null;
    });

    await handleShopInfoUgcAndEReviewsShopText(ctx);

    // Rating formatted to one decimal with comma: "4,7"
    expect(lineInstance0.setProperties).toHaveBeenCalledWith({ value: '4,7' });
    // Reviews text passed as-is
    expect(lineInstance1.setProperties).toHaveBeenCalledWith({ value: '123 отзыва' });
  });

  it('formats rating with comma separator', async () => {
    const ctx = createContext('EShopItem', {
      '#ShopInfo-Ugc': '4.5',
      '#EReviews_shopText': '',
    });

    const lineInstance0 = createMockInstance('Line');
    const reviewsLabel = createMockInstance('EReviewsLabel');
    reviewsLabel.findAll = vi.fn(() => [lineInstance0]);

    mockFindFirstNodeByName.mockImplementation((_container, name) => {
      if (name === 'EReviewsLabel') return reviewsLabel as unknown as SceneNode;
      return null;
    });

    await handleShopInfoUgcAndEReviewsShopText(ctx);

    expect(lineInstance0.setProperties).toHaveBeenCalledWith({ value: '4,5' });
  });

  it('rejects rating > 5', async () => {
    const ctx = createContext('EShopItem', {
      '#ShopInfo-Ugc': '6.2',
      '#EReviews_shopText': '',
    });

    // formatRatingOneDecimal returns '' for out-of-range → both fields empty → early return
    await handleShopInfoUgcAndEReviewsShopText(ctx);

    expect(mockSafeSetTextNode).not.toHaveBeenCalled();
  });

  it('falls back to named text layers when no Line instances', async () => {
    const ctx = createContext('EShopItem', {
      '#ShopInfo-Ugc': '3.8',
      '#EReviews_shopText': '50 отзывов',
    });

    // EReviewsLabel not found
    mockFindFirstNodeByName.mockReturnValue(null);

    const ratingNode = createMockTextNode('#ShopInfo-Ugc', '');
    const reviewsNode = createMockTextNode('#EReviews_shopText', '');

    mockFindTextLayerByName.mockImplementation((_container, name) => {
      if (name === '#ShopInfo-Ugc') return ratingNode as unknown as TextNode;
      if (name === '#EReviews_shopText') return reviewsNode as unknown as TextNode;
      return null;
    });

    await handleShopInfoUgcAndEReviewsShopText(ctx);

    expect(mockSafeSetTextNode).toHaveBeenCalledWith(ratingNode, '3,8');
    expect(mockSafeSetTextNode).toHaveBeenCalledWith(reviewsNode, '50 отзывов');
  });

  it('falls back to predicate search in EReviewsLabel group', async () => {
    const ctx = createContext('EShopItem', {
      '#ShopInfo-Ugc': '4.2',
      '#EReviews_shopText': '10 отзывов',
    });

    // EReviewsLabel exists but not INSTANCE type (FRAME fallback)
    const reviewsLabelGroup = createMockInstance('EReviewsLabel');
    // Override type so it skips the Line-instance path
    (reviewsLabelGroup as Record<string, unknown>).type = 'FRAME';

    mockFindFirstNodeByName.mockImplementation((_container, name) => {
      if (name === 'EReviewsLabel') return reviewsLabelGroup as unknown as SceneNode;
      return null;
    });
    mockFindTextLayerByName.mockReturnValue(null);

    const ratingNode = createMockTextNode('rating', '4,0');
    const reviewsNode = createMockTextNode('reviews', 'отзывы');

    let predicateCallCount = 0;
    mockFindFirstTextByPredicate.mockImplementation((_node, _predicate) => {
      predicateCallCount++;
      // First call: rating predicate (looking for "X,X" pattern)
      if (predicateCallCount === 1) return ratingNode as unknown as TextNode;
      // Second call: reviews predicate (looking for text containing "отзыв")
      if (predicateCallCount === 2) return reviewsNode as unknown as TextNode;
      return null;
    });

    await handleShopInfoUgcAndEReviewsShopText(ctx);

    expect(mockSafeSetTextNode).toHaveBeenCalledWith(ratingNode, '4,2');
    expect(mockSafeSetTextNode).toHaveBeenCalledWith(reviewsNode, '10 отзывов');
  });

  it('handles comma-formatted rating input', async () => {
    const ctx = createContext('EShopItem', {
      '#ShopInfo-Ugc': '4,9',
      '#EReviews_shopText': '',
    });

    const lineInstance0 = createMockInstance('Line');
    const reviewsLabel = createMockInstance('EReviewsLabel');
    reviewsLabel.findAll = vi.fn(() => [lineInstance0]);

    mockFindFirstNodeByName.mockImplementation((_container, name) => {
      if (name === 'EReviewsLabel') return reviewsLabel as unknown as SceneNode;
      return null;
    });

    await handleShopInfoUgcAndEReviewsShopText(ctx);

    expect(lineInstance0.setProperties).toHaveBeenCalledWith({ value: '4,9' });
  });
});

// ── 4. handleOfficialShop ──────────────────────────────────────────

describe('handleOfficialShop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns early when row is null', () => {
    const ctx = createContext('EShopItem', null);
    handleOfficialShop(ctx);
    expect(mockTrySetProperty).not.toHaveBeenCalled();
  });

  it('returns early when container is null', () => {
    handleOfficialShop({
      container: null as unknown as BaseNode,
      containerKey: '',
      row: {} as HandlerContext['row'],
      instanceCache: mockCache(),
    });
    expect(mockTrySetProperty).not.toHaveBeenCalled();
  });

  it('sets isOfficial=true when #OfficialShop is "true"', () => {
    const ctx = createContext('EShopItem', { '#OfficialShop': 'true' });
    const shopNameInst = createMockInstance('EShopName');
    mockGetCachedInstance.mockReturnValue(shopNameInst as unknown as InstanceNode);

    handleOfficialShop(ctx);

    expect(mockGetCachedInstance).toHaveBeenCalledWith(ctx.instanceCache, 'EShopName');
    expect(mockTrySetProperty).toHaveBeenCalledWith(
      shopNameInst,
      ['isOfficial'],
      true,
      '#OfficialShop',
    );
  });

  it('sets isOfficial=false when #OfficialShop is not "true"', () => {
    const ctx = createContext('EShopItem', { '#OfficialShop': 'false' });
    const shopNameInst = createMockInstance('EShopName');
    mockGetCachedInstance.mockReturnValue(shopNameInst as unknown as InstanceNode);

    handleOfficialShop(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      shopNameInst,
      ['isOfficial'],
      false,
      '#OfficialShop',
    );
  });

  it('sets isOfficial=false when field is missing', () => {
    const ctx = createContext('EShopItem', {});
    const shopNameInst = createMockInstance('EShopName');
    mockGetCachedInstance.mockReturnValue(shopNameInst as unknown as InstanceNode);

    handleOfficialShop(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      shopNameInst,
      ['isOfficial'],
      false,
      '#OfficialShop',
    );
  });

  it('does nothing when EShopName instance not found', () => {
    const ctx = createContext('EShopItem', { '#OfficialShop': 'true' });
    mockGetCachedInstance.mockReturnValue(null);

    handleOfficialShop(ctx);

    expect(mockTrySetProperty).not.toHaveBeenCalled();
  });
});

// ── 5. handleQuoteText ─────────────────────────────────────────────

describe('handleQuoteText', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns early when row is null', async () => {
    const ctx = createContext('ESnippet', null);
    await handleQuoteText(ctx);
    expect(mockSafeSetTextNode).not.toHaveBeenCalled();
  });

  it('hides Line / EQuote when no quote data', async () => {
    const ctx = createContext('ESnippet', { '#QuoteText': '', '#withQuotes': '' });

    const eQuoteLayer = createMockInstance('Line / EQuote');
    mockFindFirstNodeByName.mockImplementation((_container, name) => {
      if (name === 'Line / EQuote') return eQuoteLayer as unknown as SceneNode;
      return null;
    });

    await handleQuoteText(ctx);

    expect(eQuoteLayer.visible).toBe(false);
    expect(mockSafeSetTextNode).not.toHaveBeenCalled();
  });

  it('sets quote via Line.value inside Line / EQuote wrapper', async () => {
    const ctx = createContext('ESnippet', {
      '#QuoteText': 'Great product, highly recommend!',
      '#withQuotes': 'true',
    });

    const innerLine = createMockInstance('Line');
    const eQuoteWrapper = createMockInstance('Line / EQuote');
    eQuoteWrapper.findOne = vi.fn(() => innerLine);

    mockFindFirstNodeByName.mockImplementation((_container, name) => {
      if (name === 'Line / EQuote') return eQuoteWrapper as unknown as SceneNode;
      return null;
    });

    await handleQuoteText(ctx);

    expect(innerLine.setProperties).toHaveBeenCalledWith({
      value: 'Great product, highly recommend!',
    });
  });

  it('falls back to named text layer when Line.value path unavailable', async () => {
    const ctx = createContext('ESnippet', {
      '#QuoteText': 'Nice review',
      '#withQuotes': 'true',
    });

    // No Line / EQuote wrapper
    mockFindFirstNodeByName.mockReturnValue(null);

    const namedQuoteLayer = createMockTextNode('#QuoteText', '');
    mockFindTextLayerByName.mockImplementation((_container, name) => {
      if (name === '#QuoteText') return namedQuoteLayer as unknown as TextNode;
      return null;
    });

    await handleQuoteText(ctx);

    expect(mockSafeSetTextNode).toHaveBeenCalledWith(namedQuoteLayer, 'Nice review');
  });

  it('falls back to predicate search in EQuote container', async () => {
    const ctx = createContext('ESnippet', {
      '#QuoteText': 'Excellent quality',
      '#withQuotes': 'true',
    });

    // No Line / EQuote, no named layers
    mockFindFirstNodeByName.mockImplementation((_container, name) => {
      if (name === 'EQuote') {
        return createMockInstance('EQuote') as unknown as SceneNode;
      }
      return null;
    });
    mockFindTextLayerByName.mockReturnValue(null);

    const quoteTextNode = createMockTextNode('quote', '«old quote text here»');
    mockFindFirstTextByPredicate.mockReturnValue(quoteTextNode as unknown as TextNode);

    await handleQuoteText(ctx);

    expect(mockSafeSetTextNode).toHaveBeenCalledWith(quoteTextNode, 'Excellent quality');
  });

  it('uses #EQuote-Text field as alternative to #QuoteText', async () => {
    const ctx = createContext('ESnippet', {
      '#QuoteText': '',
      '#EQuote-Text': 'Alternative quote field',
      '#withQuotes': 'true',
    });

    const innerLine = createMockInstance('Line');
    const eQuoteWrapper = createMockInstance('Line / EQuote');
    eQuoteWrapper.findOne = vi.fn(() => innerLine);

    mockFindFirstNodeByName.mockImplementation((_container, name) => {
      if (name === 'Line / EQuote') return eQuoteWrapper as unknown as SceneNode;
      return null;
    });

    await handleQuoteText(ctx);

    expect(innerLine.setProperties).toHaveBeenCalledWith({
      value: 'Alternative quote field',
    });
  });

  it('applies author avatar when #EQuote-AuthorAvatar present', async () => {
    const ctx = createContext('ESnippet', {
      '#QuoteText': 'Review text',
      '#withQuotes': 'true',
      '#EQuote-AuthorAvatar': 'https://avatars.example.com/user.jpg',
    });

    const innerLine = createMockInstance('Line');
    const eQuoteWrapper = createMockInstance('Line / EQuote');
    eQuoteWrapper.findOne = vi.fn(() => innerLine);

    const avatarLayer = createMockInstance('#EQuote-AuthorAvatar');
    // Add fills property to pass the 'fills' in layer check
    (avatarLayer as Record<string, unknown>).fills = [];

    mockFindFirstNodeByName.mockImplementation((_container, name) => {
      if (name === 'Line / EQuote') return eQuoteWrapper as unknown as SceneNode;
      if (name === '#EQuote-AuthorAvatar') return avatarLayer as unknown as SceneNode;
      return null;
    });

    await handleQuoteText(ctx);

    expect(mockFetchAndApplyImage).toHaveBeenCalledWith(
      avatarLayer,
      'https://avatars.example.com/user.jpg',
      'FILL',
      '[QuoteAvatar]',
    );
  });

  it('does not crash when Line / EQuote has no inner Line', async () => {
    const ctx = createContext('ESnippet', {
      '#QuoteText': 'Test',
      '#withQuotes': 'true',
    });

    const eQuoteWrapper = createMockInstance('Line / EQuote');
    eQuoteWrapper.findOne = vi.fn(() => null);

    mockFindFirstNodeByName.mockImplementation((_container, name) => {
      if (name === 'Line / EQuote') return eQuoteWrapper as unknown as SceneNode;
      return null;
    });
    mockFindTextLayerByName.mockReturnValue(null);

    // Should not throw
    await handleQuoteText(ctx);
  });

  it('treats withQuotes=true as having a quote even without text', async () => {
    const ctx = createContext('ESnippet', {
      '#QuoteText': '',
      '#withQuotes': 'true',
    });

    // No hiding should happen because withQuotes is true
    const eQuoteLayer = createMockInstance('Line / EQuote');
    mockFindFirstNodeByName.mockImplementation((_container, name) => {
      if (name === 'Line / EQuote') return eQuoteLayer as unknown as SceneNode;
      return null;
    });

    await handleQuoteText(ctx);

    // Should NOT have hidden the layer
    expect(eQuoteLayer.visible).toBe(true);
  });
});

// ── 6. handleOrganicPath ───────────────────────────────────────────

describe('handleOrganicPath', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns early when row is null', async () => {
    const ctx = createContext('ESnippet', null);
    await handleOrganicPath(ctx);
    expect(mockSafeSetTextNode).not.toHaveBeenCalled();
  });

  it('returns early when #OrganicPath is empty', async () => {
    const ctx = createContext('ESnippet', { '#OrganicPath': '' });
    await handleOrganicPath(ctx);
    expect(mockSafeSetTextNode).not.toHaveBeenCalled();
  });

  it('sets path on named #OrganicPath layer', async () => {
    const ctx = createContext('ESnippet', { '#OrganicPath': '/catalog/phones' });
    const pathLayer = createMockTextNode('#OrganicPath', '');
    mockFindTextLayerByName.mockImplementation((_container, name) => {
      if (name === '#OrganicPath') return pathLayer as unknown as TextNode;
      return null;
    });

    await handleOrganicPath(ctx);

    expect(mockSafeSetTextNode).toHaveBeenCalledWith(pathLayer, '/catalog/phones');
  });

  it('tries multiple layer names before fallback', async () => {
    const ctx = createContext('ESnippet', { '#OrganicPath': '/path' });
    const pathSuffix = createMockTextNode('Path-Suffix', '');

    mockFindTextLayerByName.mockImplementation((_container, name) => {
      if (name === 'Path-Suffix') return pathSuffix as unknown as TextNode;
      return null;
    });

    await handleOrganicPath(ctx);

    expect(mockSafeSetTextNode).toHaveBeenCalledWith(pathSuffix, '/path');
    // Verify it tried the earlier names first
    expect(mockFindTextLayerByName).toHaveBeenCalledWith(ctx.container, '#OrganicPath');
    expect(mockFindTextLayerByName).toHaveBeenCalledWith(ctx.container, '#organicPath');
    expect(mockFindTextLayerByName).toHaveBeenCalledWith(ctx.container, 'OrganicPath');
  });

  it('falls back to predicate search in Path block', async () => {
    const ctx = createContext('ESnippet', {
      '#OrganicPath': '/very/long/path/to/product',
    });

    // No named layers
    mockFindTextLayerByName.mockReturnValue(null);

    const pathBlock = createMockInstance('Path');
    const pathTextNode = createMockTextNode('suffix', '/old/path/long-enough');

    mockFindFirstNodeByName.mockImplementation((_container, name) => {
      if (name === 'Block / Snippet-staff / Path' || name === 'Path') {
        return pathBlock as unknown as SceneNode;
      }
      return null;
    });
    mockFindFirstTextByPredicate.mockImplementation((node) => {
      if (node === pathBlock) return pathTextNode as unknown as TextNode;
      return null;
    });

    await handleOrganicPath(ctx);

    expect(mockSafeSetTextNode).toHaveBeenCalledWith(pathTextNode, '/very/long/path/to/product');
  });

  it('does nothing when no named layers and no Path block', async () => {
    const ctx = createContext('ESnippet', { '#OrganicPath': '/test' });
    mockFindTextLayerByName.mockReturnValue(null);
    mockFindFirstNodeByName.mockReturnValue(null);

    await handleOrganicPath(ctx);

    expect(mockSafeSetTextNode).not.toHaveBeenCalled();
  });
});

// ── 7. handleShopOfflineRegion ─────────────────────────────────────

describe('handleShopOfflineRegion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns early when row is null', async () => {
    const ctx = createContext('EShopItem', null);
    await handleShopOfflineRegion(ctx);
    expect(mockSafeSetTextNode).not.toHaveBeenCalled();
  });

  it('returns early when both addressText and addressLink empty', async () => {
    const ctx = createContext('EShopItem', {
      '#addressText': '',
      '#addressLink': '',
    });
    await handleShopOfflineRegion(ctx);
    expect(mockSafeSetTextNode).not.toHaveBeenCalled();
  });

  it('sets addressText on named layer', async () => {
    const ctx = createContext('EShopItem', {
      '#addressText': 'Москва, ул. Тверская, д. 1',
      '#addressLink': '',
    });

    const addressTextNode = createMockTextNode('#addressText', '');
    mockFindTextLayerByName.mockImplementation((_container, name) => {
      if (name === '#addressText') return addressTextNode as unknown as TextNode;
      return null;
    });

    await handleShopOfflineRegion(ctx);

    expect(mockSafeSetTextNode).toHaveBeenCalledWith(addressTextNode, 'Москва, ул. Тверская, д. 1');
  });

  it('sets addressLink on named layer', async () => {
    const ctx = createContext('EShopItem', {
      '#addressText': '',
      '#addressLink': 'Все адреса на карте',
    });

    const addressLinkNode = createMockTextNode('#addressLink', '');
    mockFindTextLayerByName.mockImplementation((_container, name) => {
      if (name === '#addressLink') return addressLinkNode as unknown as TextNode;
      return null;
    });

    await handleShopOfflineRegion(ctx);

    expect(mockSafeSetTextNode).toHaveBeenCalledWith(addressLinkNode, 'Все адреса на карте');
  });

  it('sets both addressText and addressLink when both present', async () => {
    const ctx = createContext('EShopItem', {
      '#addressText': 'СПб, Невский пр., д. 10',
      '#addressLink': 'Показать на карте',
    });

    const addressTextNode = createMockTextNode('#addressText', '');
    const addressLinkNode = createMockTextNode('#addressLink', '');

    mockFindTextLayerByName.mockImplementation((_container, name) => {
      if (name === '#addressText') return addressTextNode as unknown as TextNode;
      if (name === '#addressLink') return addressLinkNode as unknown as TextNode;
      return null;
    });

    await handleShopOfflineRegion(ctx);

    expect(mockSafeSetTextNode).toHaveBeenCalledWith(addressTextNode, 'СПб, Невский пр., д. 10');
    expect(mockSafeSetTextNode).toHaveBeenCalledWith(addressLinkNode, 'Показать на карте');
  });

  it('does not crash when named layers not found', async () => {
    const ctx = createContext('EShopItem', {
      '#addressText': 'Address here',
      '#addressLink': 'Link here',
    });

    mockFindTextLayerByName.mockReturnValue(null);

    // Should not throw
    await handleShopOfflineRegion(ctx);

    expect(mockSafeSetTextNode).not.toHaveBeenCalled();
  });

  it('returns early when container is null', async () => {
    await handleShopOfflineRegion({
      container: null as unknown as BaseNode,
      containerKey: '',
      row: { '#addressText': 'test' } as HandlerContext['row'],
    });
    expect(mockSafeSetTextNode).not.toHaveBeenCalled();
  });
});
