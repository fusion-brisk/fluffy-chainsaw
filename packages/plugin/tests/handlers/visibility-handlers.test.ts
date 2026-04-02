/**
 * Tests for visibility handlers — handleHidePriceBlock, handleEcomMetaVisibility, handleEmptyGroups
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

vi.mock('../../src/sandbox/property-utils', () => ({
  trySetProperty: vi.fn(() => true),
}));

vi.mock('../../src/utils/instance-cache', () => ({
  getGroupsSortedByDepth: vi.fn(() => []),
  shouldProcessGroupForEmptyCheck: vi.fn(() => true),
  areAllChildrenHidden: vi.fn(() => false),
  hasAnyVisibleChild: vi.fn(() => true),
}));

import {
  handleHidePriceBlock,
  handleEcomMetaVisibility,
  handleEmptyGroups,
} from '../../src/sandbox/handlers/visibility-handlers';
import { trySetProperty } from '../../src/sandbox/property-utils';
import {
  getGroupsSortedByDepth,
  shouldProcessGroupForEmptyCheck,
  areAllChildrenHidden,
  hasAnyVisibleChild,
} from '../../src/utils/instance-cache';
import type { HandlerContext } from '../../src/sandbox/handlers/types';

const mockTrySetProperty = vi.mocked(trySetProperty);
const mockGetGroups = vi.mocked(getGroupsSortedByDepth);
const mockShouldProcess = vi.mocked(shouldProcessGroupForEmptyCheck);
const mockAllHidden = vi.mocked(areAllChildrenHidden);
const mockHasVisible = vi.mocked(hasAnyVisibleChild);

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

function createContext(
  containerName: string,
  row: Record<string, string> | null,
  cache?: ReturnType<typeof mockCache>,
): HandlerContext {
  const container = createMockInstance(containerName);
  return {
    container,
    containerKey: container.id,
    row: row as HandlerContext['row'],
    instanceCache: cache || mockCache(),
  };
}

describe('handleHidePriceBlock', () => {
  beforeEach(() => vi.clearAllMocks());

  it('hides price when #hidePriceBlock=true', () => {
    const ctx = createContext('EShopItem', { '#hidePriceBlock': 'true' });
    handleHidePriceBlock(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ctx.container,
      ['withPrice', 'PRICE', 'Price'],
      false,
      '#hidePriceBlock',
    );
  });

  it('does nothing when #hidePriceBlock is missing', () => {
    const ctx = createContext('EShopItem', {});
    handleHidePriceBlock(ctx);

    expect(mockTrySetProperty).not.toHaveBeenCalled();
  });

  it('does nothing when #hidePriceBlock=false', () => {
    const ctx = createContext('EShopItem', { '#hidePriceBlock': 'false' });
    handleHidePriceBlock(ctx);

    expect(mockTrySetProperty).not.toHaveBeenCalled();
  });

  it('does nothing when row is null', () => {
    const ctx = createContext('EShopItem', null);
    handleHidePriceBlock(ctx);

    expect(mockTrySetProperty).not.toHaveBeenCalled();
  });

  it('does nothing when container is null', () => {
    handleHidePriceBlock({
      container: null as unknown as BaseNode,
      containerKey: '',
      row: { '#hidePriceBlock': 'true' } as HandlerContext['row'],
    });

    expect(mockTrySetProperty).not.toHaveBeenCalled();
  });
});

describe('handleEcomMetaVisibility', () => {
  beforeEach(() => vi.clearAllMocks());

  it('hides EcomMeta when all children hidden (ESnippet)', () => {
    mockAllHidden.mockReturnValueOnce(true);
    const cache = mockCache();
    const ecomGroup = { name: 'EcomMeta', visible: true, removed: false, children: [] };
    cache.groups.set('EcomMeta', ecomGroup);

    const ctx = createContext('ESnippet', { '#ProductRating': '4.5' }, cache);
    handleEcomMetaVisibility(ctx);

    expect(ecomGroup.visible).toBe(false);
  });

  it('shows EcomMeta when some children visible (ESnippet)', () => {
    mockAllHidden.mockReturnValueOnce(false);
    const cache = mockCache();
    const ecomGroup = { name: 'EcomMeta', visible: false, removed: false, children: [] };
    cache.groups.set('EcomMeta', ecomGroup);

    const ctx = createContext('ESnippet', { '#OrganicPrice': '1990' }, cache);
    handleEcomMetaVisibility(ctx);

    expect(ecomGroup.visible).toBe(true);
  });

  it('skips non-ESnippet containers', () => {
    const ctx = createContext('EShopItem', { '#ProductRating': '4.5' });
    handleEcomMetaVisibility(ctx);

    // Should not touch trySetProperty or EcomMeta for non-ESnippet
    expect(mockTrySetProperty).not.toHaveBeenCalled();
  });

  it('works with Snippet container name', () => {
    mockAllHidden.mockReturnValueOnce(true);
    const cache = mockCache();
    const ecomGroup = { name: 'EcomMeta', visible: true, removed: false, children: [] };
    cache.groups.set('EcomMeta', ecomGroup);

    const ctx = createContext('Snippet', { '#OrganicPrice': '1990' }, cache);
    handleEcomMetaVisibility(ctx);

    expect(ecomGroup.visible).toBe(false);
  });

  it('does not call trySetProperty for withDeliveryBnpl (schema-driven)', () => {
    const cache = mockCache();
    cache.groups.set('EcomMeta', { name: 'EcomMeta', visible: true, removed: false, children: [] });
    mockAllHidden.mockReturnValueOnce(false);

    const ctx = createContext('ESnippet', { '#EDeliveryGroup': 'true' }, cache);
    handleEcomMetaVisibility(ctx);

    // withDeliveryBnpl is handled by schema engine, not this handler
    expect(mockTrySetProperty).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining(['withDeliveryBnpl']),
      expect.anything(),
      expect.anything(),
    );
  });

  it('leaves EcomMeta unchanged when not found in cache', () => {
    const ctx = createContext('ESnippet', { '#ProductRating': '4.5' });
    handleEcomMetaVisibility(ctx);

    // No EcomMeta in cache — should return without error
    expect(mockAllHidden).not.toHaveBeenCalled();
  });

  it('does nothing when row is null', () => {
    const ctx = createContext('ESnippet', null);
    handleEcomMetaVisibility(ctx);

    expect(mockTrySetProperty).not.toHaveBeenCalled();
  });
});

describe('handleEmptyGroups', () => {
  beforeEach(() => vi.clearAllMocks());

  it('hides groups where all children hidden', () => {
    const group = { name: 'Meta', visible: true, removed: false, children: [] };
    mockGetGroups.mockReturnValue([group as unknown as FrameNode]);
    mockShouldProcess.mockReturnValue(true);
    mockAllHidden.mockReturnValue(true);
    mockHasVisible.mockReturnValue(false);

    const ctx = createContext('ESnippet', {});
    handleEmptyGroups(ctx);

    expect(group.visible).toBe(false);
  });

  it('shows groups where some children became visible', () => {
    const group = { name: 'Meta', visible: false, removed: false, children: [] };
    mockGetGroups.mockReturnValue([group as unknown as FrameNode]);
    mockShouldProcess.mockReturnValue(true);
    mockAllHidden.mockReturnValue(false);
    mockHasVisible.mockReturnValue(true);

    const ctx = createContext('ESnippet', {});
    handleEmptyGroups(ctx);

    expect(group.visible).toBe(true);
  });

  it('skips removed groups', () => {
    const group = { name: 'Meta', visible: true, removed: true, children: [] };
    mockGetGroups.mockReturnValue([group as unknown as FrameNode]);

    const ctx = createContext('ESnippet', {});
    handleEmptyGroups(ctx);

    expect(group.visible).toBe(true); // unchanged
  });

  it('skips EcomMeta (handled by handleEcomMetaVisibility)', () => {
    const group = { name: 'EcomMeta', visible: true, removed: false, children: [] };
    mockGetGroups.mockReturnValue([group as unknown as FrameNode]);
    mockShouldProcess.mockReturnValue(true);
    mockAllHidden.mockReturnValue(true);

    const ctx = createContext('ESnippet', {});
    handleEmptyGroups(ctx);

    expect(group.visible).toBe(true); // unchanged, skipped
  });

  it('skips groups that shouldProcessGroupForEmptyCheck rejects', () => {
    const group = { name: 'SomeUnrelated', visible: true, removed: false, children: [] };
    mockGetGroups.mockReturnValue([group as unknown as FrameNode]);
    mockShouldProcess.mockReturnValue(false);
    mockAllHidden.mockReturnValue(true);

    const ctx = createContext('ESnippet', {});
    handleEmptyGroups(ctx);

    expect(group.visible).toBe(true); // unchanged
  });

  it('does nothing when no groups in cache', () => {
    mockGetGroups.mockReturnValue([]);

    const ctx = createContext('ESnippet', {});
    handleEmptyGroups(ctx);
    // No errors, no side effects
  });

  it('does nothing when container is null', () => {
    handleEmptyGroups({
      container: null as unknown as BaseNode,
      containerKey: '',
      row: {} as HandlerContext['row'],
    });
    // Should not throw
  });
});
