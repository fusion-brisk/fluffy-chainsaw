/**
 * Tests for label handlers — handleBrandLogic, handleELabelGroup, handleEPriceBarometer, handleEMarketCheckoutLabel
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
  trySetVariantProperty: vi.fn(() => true),
}));

vi.mock('../../src/utils/node-search', () => ({
  findFirstTextByPredicate: vi.fn(() => null),
  findAllNodesByName: vi.fn(() => []),
  findAllInstances: vi.fn(() => []),
  safeSetTextNode: vi.fn(),
}));

vi.mock('../../src/utils/instance-cache', () => ({
  getCachedInstance: vi.fn(() => null),
  getCachedInstanceByNames: vi.fn(() => null),
}));

vi.mock('../../src/utils/container-search', () => ({
  isSnippetContainer: vi.fn(() => true),
}));

import {
  handleBrandLogic,
  handleELabelGroup,
  handleEPriceBarometer,
  handleEMarketCheckoutLabel,
} from '../../src/sandbox/handlers/label-handlers';
import { trySetProperty, trySetVariantProperty } from '../../src/sandbox/property-utils';
import { getCachedInstance, getCachedInstanceByNames } from '../../src/utils/instance-cache';
import type { HandlerContext } from '../../src/sandbox/handlers/types';

const mockTrySetProperty = vi.mocked(trySetProperty);
const mockTrySetVariantProperty = vi.mocked(trySetVariantProperty);
const mockGetCachedInstance = vi.mocked(getCachedInstance);
const mockGetCachedInstanceByNames = vi.mocked(getCachedInstanceByNames);

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
  overrides?: { children?: unknown[]; width?: number },
): HandlerContext {
  const container = createMockInstance(containerName);
  if (overrides?.children) {
    container.children = overrides.children;
  }
  if (overrides?.width !== undefined) {
    container.width = overrides.width;
  }
  return {
    container,
    containerKey: container.id,
    row: row as HandlerContext['row'],
    instanceCache: mockCache(),
  };
}

// ==========================================
// handleBrandLogic
// ==========================================
describe('handleBrandLogic', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets Brand=true when #Brand has a value', async () => {
    const ctx = createContext('EShopItem', { '#Brand': 'Samsung' });

    await handleBrandLogic(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(ctx.container, ['Brand'], true, '#Brand');
  });

  it('sets Brand=false when #Brand is empty', async () => {
    const ctx = createContext('EShopItem', { '#Brand': '' });

    await handleBrandLogic(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(ctx.container, ['Brand'], false, '#Brand');
  });

  it('sets Brand=false when #Brand is missing', async () => {
    const ctx = createContext('EOfferItem', {});

    await handleBrandLogic(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(ctx.container, ['Brand'], false, '#Brand');
  });

  it('skips ESnippet containers (no Brand property)', async () => {
    const ctx = createContext('ESnippet', { '#Brand': 'Apple' });

    await handleBrandLogic(ctx);

    expect(mockTrySetProperty).not.toHaveBeenCalled();
  });

  it('skips Snippet containers (no Brand property)', async () => {
    const ctx = createContext('Snippet', { '#Brand': 'Apple' });

    await handleBrandLogic(ctx);

    expect(mockTrySetProperty).not.toHaveBeenCalled();
  });

  it('does nothing when row is null', async () => {
    const ctx = createContext('EShopItem', null);

    await handleBrandLogic(ctx);

    expect(mockTrySetProperty).not.toHaveBeenCalled();
  });

  it('does nothing when container is null', async () => {
    await handleBrandLogic({
      container: null as unknown as BaseNode,
      containerKey: '',
      row: { '#Brand': 'Test' } as HandlerContext['row'],
    });

    expect(mockTrySetProperty).not.toHaveBeenCalled();
  });

  it('ignores variant property syntax in #Brand value', async () => {
    const ctx = createContext('EShopItem', { '#Brand': 'view=compact' });

    await handleBrandLogic(ctx);

    // variant property syntax (key=value) is treated as no brand
    expect(mockTrySetProperty).toHaveBeenCalledWith(ctx.container, ['Brand'], false, '#Brand');
  });

  it('also sets Brand on child snippet instances', async () => {
    const childInstance = createMockInstance('EProductSnippet2');
    const ctx = createContext('EShopItem', { '#Brand': 'LG' }, { children: [childInstance] });

    await handleBrandLogic(ctx);

    // Called for both parent and child
    expect(mockTrySetProperty).toHaveBeenCalledWith(ctx.container, ['Brand'], true, '#Brand');
    expect(mockTrySetProperty).toHaveBeenCalledWith(childInstance, ['Brand'], true, '#Brand');
  });
});

// ==========================================
// handleELabelGroup
// ==========================================
describe('handleELabelGroup', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets withRating=true and value when rating present', async () => {
    const eLabelGroup = createMockInstance('ELabelGroup');
    const eLabelRating = createMockInstance('ELabelRating');
    mockGetCachedInstance
      .mockReturnValueOnce(eLabelGroup) // ELabelGroup
      .mockReturnValueOnce(eLabelRating); // ELabelRating

    const ctx = createContext('EShopItem', { '#ProductRating': '4.5' });

    await handleELabelGroup(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      eLabelGroup,
      ['Rating', 'withRating'],
      true,
      '#ProductRating',
    );
    expect(mockTrySetProperty).toHaveBeenCalledWith(
      eLabelRating,
      ['value'],
      '4.5',
      '#ProductRating',
    );
  });

  it('sets withRating=false when rating empty', async () => {
    const eLabelGroup = createMockInstance('ELabelGroup');
    mockGetCachedInstance.mockReturnValueOnce(eLabelGroup);

    const ctx = createContext('EShopItem', { '#ProductRating': '' });

    await handleELabelGroup(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      eLabelGroup,
      ['Rating', 'withRating'],
      false,
      '#ProductRating',
    );
  });

  it('sets withRating=false when rating missing', async () => {
    const eLabelGroup = createMockInstance('ELabelGroup');
    mockGetCachedInstance.mockReturnValueOnce(eLabelGroup);

    const ctx = createContext('EShopItem', {});

    await handleELabelGroup(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      eLabelGroup,
      ['Rating', 'withRating'],
      false,
      '#ProductRating',
    );
  });

  it('sets withBarometer=true when barometer flag present', async () => {
    const eLabelGroup = createMockInstance('ELabelGroup');
    mockGetCachedInstance.mockReturnValueOnce(eLabelGroup);

    const ctx = createContext('EShopItem', { '#ELabelGroup_Barometer': 'true' });

    await handleELabelGroup(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      eLabelGroup,
      ['withBarometer', 'Barometer'],
      true,
      '#ELabelGroup_Barometer',
    );
  });

  it('sets withBarometer=false when barometer flag missing', async () => {
    const eLabelGroup = createMockInstance('ELabelGroup');
    mockGetCachedInstance.mockReturnValueOnce(eLabelGroup);

    const ctx = createContext('EShopItem', {});

    await handleELabelGroup(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      eLabelGroup,
      ['withBarometer', 'Barometer'],
      false,
      '#ELabelGroup_Barometer',
    );
  });

  it('does not set rating value when ELabelRating not cached', async () => {
    const eLabelGroup = createMockInstance('ELabelGroup');
    mockGetCachedInstance
      .mockReturnValueOnce(eLabelGroup) // ELabelGroup
      .mockReturnValueOnce(null); // ELabelRating — not found

    const ctx = createContext('EShopItem', { '#ProductRating': '4.8' });

    await handleELabelGroup(ctx);

    // withRating boolean still set
    expect(mockTrySetProperty).toHaveBeenCalledWith(
      eLabelGroup,
      ['Rating', 'withRating'],
      true,
      '#ProductRating',
    );
    // But value not set (only 2 calls: rating boolean + barometer)
    expect(mockTrySetProperty).toHaveBeenCalledTimes(2);
  });

  it('skips all when ELabelGroup not cached', async () => {
    mockGetCachedInstance.mockReturnValue(null);

    const ctx = createContext('EShopItem', {
      '#ProductRating': '4.5',
      '#ELabelGroup_Barometer': 'true',
    });

    await handleELabelGroup(ctx);

    expect(mockTrySetProperty).not.toHaveBeenCalled();
  });

  it('does nothing when row is null', async () => {
    const ctx = createContext('EShopItem', null);

    await handleELabelGroup(ctx);

    expect(mockTrySetProperty).not.toHaveBeenCalled();
  });
});

// ==========================================
// handleEPriceBarometer
// ==========================================
describe('handleEPriceBarometer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets View on barometer instance', async () => {
    const barometer = createMockInstance('EPriceBarometer');
    mockGetCachedInstance.mockReturnValueOnce(barometer);

    const ctx = createContext('EShopItem', {
      '#ELabelGroup_Barometer': 'true',
      '#EPriceBarometer_View': 'below-market',
    });

    await handleEPriceBarometer(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      barometer,
      ['View'],
      'below-market',
      '#EPriceBarometer_View',
    );
  });

  it('sets isCompact=false for ESnippet containers', async () => {
    const barometer = createMockInstance('EPriceBarometer');
    mockGetCachedInstance.mockReturnValueOnce(barometer);

    const ctx = createContext('ESnippet', {
      '#ELabelGroup_Barometer': 'true',
      '#EPriceBarometer_View': 'in-market',
    });

    await handleEPriceBarometer(ctx);

    expect(mockTrySetVariantProperty).toHaveBeenCalledWith(
      barometer,
      ['isCompact=false'],
      '#EPriceBarometer_isCompact',
    );
  });

  it('sets isCompact=true for narrow EProductSnippet2 (width<=182)', async () => {
    const barometer = createMockInstance('EPriceBarometer');
    mockGetCachedInstance.mockReturnValueOnce(barometer);

    const ctx = createContext(
      'EProductSnippet2',
      {
        '#ELabelGroup_Barometer': 'true',
        '#EPriceBarometer_View': 'above-market',
      },
      { width: 180 },
    );

    await handleEPriceBarometer(ctx);

    expect(mockTrySetVariantProperty).toHaveBeenCalledWith(
      barometer,
      ['isCompact=true'],
      '#EPriceBarometer_isCompact',
    );
  });

  it('sets isCompact=false for wide EProductSnippet2 (width>182)', async () => {
    const barometer = createMockInstance('EPriceBarometer');
    mockGetCachedInstance.mockReturnValueOnce(barometer);

    const ctx = createContext(
      'EProductSnippet2',
      {
        '#ELabelGroup_Barometer': 'true',
        '#EPriceBarometer_View': 'in-market',
      },
      { width: 250 },
    );

    await handleEPriceBarometer(ctx);

    expect(mockTrySetVariantProperty).toHaveBeenCalledWith(
      barometer,
      ['isCompact=false'],
      '#EPriceBarometer_isCompact',
    );
  });

  it('uses parser value for isCompact on other containers', async () => {
    const barometer = createMockInstance('EPriceBarometer');
    mockGetCachedInstance.mockReturnValueOnce(barometer);

    const ctx = createContext('EOfferItem', {
      '#ELabelGroup_Barometer': 'true',
      '#EPriceBarometer_View': 'below-market',
      '#EPriceBarometer_isCompact': 'true',
    });

    await handleEPriceBarometer(ctx);

    expect(mockTrySetVariantProperty).toHaveBeenCalledWith(
      barometer,
      ['isCompact=true'],
      '#EPriceBarometer_isCompact',
    );
  });

  it('does nothing when barometer flag is false', async () => {
    const ctx = createContext('EShopItem', {
      '#ELabelGroup_Barometer': 'false',
      '#EPriceBarometer_View': 'in-market',
    });

    await handleEPriceBarometer(ctx);

    expect(mockTrySetProperty).not.toHaveBeenCalled();
    expect(mockTrySetVariantProperty).not.toHaveBeenCalled();
  });

  it('does nothing when View is missing', async () => {
    const ctx = createContext('EShopItem', {
      '#ELabelGroup_Barometer': 'true',
    });

    await handleEPriceBarometer(ctx);

    expect(mockTrySetProperty).not.toHaveBeenCalled();
  });

  it('does nothing when EPriceBarometer instance not cached', async () => {
    mockGetCachedInstance.mockReturnValueOnce(null);

    const ctx = createContext('EShopItem', {
      '#ELabelGroup_Barometer': 'true',
      '#EPriceBarometer_View': 'below-market',
    });

    await handleEPriceBarometer(ctx);

    expect(mockTrySetProperty).not.toHaveBeenCalled();
    expect(mockTrySetVariantProperty).not.toHaveBeenCalled();
  });

  it('does nothing when row is null', async () => {
    const ctx = createContext('EShopItem', null);

    await handleEPriceBarometer(ctx);

    expect(mockTrySetProperty).not.toHaveBeenCalled();
  });

  it('does nothing when container is null', async () => {
    await handleEPriceBarometer({
      container: null as unknown as BaseNode,
      containerKey: '',
      row: {
        '#ELabelGroup_Barometer': 'true',
        '#EPriceBarometer_View': 'in-market',
      } as HandlerContext['row'],
    });

    expect(mockTrySetProperty).not.toHaveBeenCalled();
  });
});

// ==========================================
// handleEMarketCheckoutLabel
// ==========================================
describe('handleEMarketCheckoutLabel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets withCheckout=true when checkout flag present', () => {
    const labelGroup = createMockInstance('ELabelGroup');
    mockGetCachedInstanceByNames.mockReturnValueOnce(labelGroup);

    const ctx = createContext('EShopItem', { '#EMarketCheckoutLabel': 'true' });

    handleEMarketCheckoutLabel(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      labelGroup,
      ['withCheckout'],
      true,
      '#EMarketCheckoutLabel',
    );
  });

  it('sets withCheckout=false when checkout flag missing', () => {
    const labelGroup = createMockInstance('ELabelGroup');
    mockGetCachedInstanceByNames.mockReturnValueOnce(labelGroup);

    const ctx = createContext('EShopItem', {});

    handleEMarketCheckoutLabel(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      labelGroup,
      ['withCheckout'],
      false,
      '#EMarketCheckoutLabel',
    );
  });

  it('sets withCheckout=false when checkout flag is "false"', () => {
    const labelGroup = createMockInstance('ELabelGroup');
    mockGetCachedInstanceByNames.mockReturnValueOnce(labelGroup);

    const ctx = createContext('EShopItem', { '#EMarketCheckoutLabel': 'false' });

    handleEMarketCheckoutLabel(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      labelGroup,
      ['withCheckout'],
      false,
      '#EMarketCheckoutLabel',
    );
  });

  it('does not set property when ELabelGroup not cached', () => {
    mockGetCachedInstanceByNames.mockReturnValueOnce(null);

    const ctx = createContext('EShopItem', { '#EMarketCheckoutLabel': 'true' });

    handleEMarketCheckoutLabel(ctx);

    expect(mockTrySetProperty).not.toHaveBeenCalled();
  });

  it('searches ELabelGroup with name variants', () => {
    mockGetCachedInstanceByNames.mockReturnValueOnce(null);

    const ctx = createContext('EShopItem', { '#EMarketCheckoutLabel': 'true' });

    handleEMarketCheckoutLabel(ctx);

    expect(mockGetCachedInstanceByNames).toHaveBeenCalledWith(ctx.instanceCache, [
      'ELabelGroup',
      'LabelGroup',
    ]);
  });

  it('does nothing when row is null', () => {
    const ctx = createContext('EShopItem', null);

    handleEMarketCheckoutLabel(ctx);

    expect(mockTrySetProperty).not.toHaveBeenCalled();
  });

  it('does nothing when container is null', () => {
    handleEMarketCheckoutLabel({
      container: null as unknown as BaseNode,
      containerKey: '',
      row: { '#EMarketCheckoutLabel': 'true' } as HandlerContext['row'],
    });

    expect(mockTrySetProperty).not.toHaveBeenCalled();
  });
});
