/**
 * Tests for delivery handlers — handleShopInfoDeliveryBnplContainer, mapBnplLabelToType logic
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockInstance } from '../setup';

// Mock dependencies
vi.mock('../../src/logger', () => ({
  Logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('../../src/sandbox/property-utils', () => ({
  trySetProperty: vi.fn(() => true)
}));

vi.mock('../../src/utils/node-search', () => ({
  findFirstTextByPredicate: vi.fn(() => null),
  findAllNodesByName: vi.fn(() => []),
  findAllInstances: vi.fn(() => []),
  safeSetTextNode: vi.fn()
}));

vi.mock('../../src/utils/instance-cache', () => ({
  getCachedInstance: vi.fn(() => null),
  getCachedInstanceByNames: vi.fn(() => null),
}));

vi.mock('../../src/utils/container-search', () => ({
  isSnippetContainer: vi.fn(() => true)
}));

import { handleShopInfoDeliveryBnplContainer } from '../../src/sandbox/handlers/delivery-handlers';
import { trySetProperty } from '../../src/sandbox/property-utils';
import { isSnippetContainer } from '../../src/utils/container-search';
import type { HandlerContext } from '../../src/sandbox/handlers/types';

const mockTrySetProperty = vi.mocked(trySetProperty);
const mockIsSnippetContainer = vi.mocked(isSnippetContainer);

function mockCache() {
  return {
    instances: new Map(),
    textNodes: new Map(),
    groups: new Map(),
    allTextNodes: [],
    stats: { nodeCount: 0, instanceCount: 0, textCount: 0, groupCount: 0, buildTime: 0 }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function createContext(
  containerName: string,
  row: Record<string, string> | null
): HandlerContext {
  const container = createMockInstance(containerName);
  return {
    container,
    containerKey: container.id,
    row: row as HandlerContext['row'],
    instanceCache: mockCache()
  };
}

describe('handleShopInfoDeliveryBnplContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsSnippetContainer.mockReturnValue(true);
  });

  it('sets withMeta=true when delivery data present', () => {
    const ctx = createContext('EShopItem', {
      '#EDeliveryGroup': 'true',
      '#EDeliveryGroup-Count': '2',
    });

    handleShopInfoDeliveryBnplContainer(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ctx.container,
      ['withMeta', 'Meta', 'meta', 'DELIVERY + FINTECH', 'deliveryFintech'],
      true,
      '#withMeta'
    );
  });

  it('sets withMeta=true when BNPL data present', () => {
    const ctx = createContext('EShopItem', {
      '#ShopInfo-Bnpl': 'true',
      '#ShopInfo-Bnpl-Count': '1',
    });

    handleShopInfoDeliveryBnplContainer(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ctx.container,
      ['withMeta', 'Meta', 'meta', 'DELIVERY + FINTECH', 'deliveryFintech'],
      true,
      '#withMeta'
    );
  });

  it('sets withMeta=true with fintech from price group', () => {
    const ctx = createContext('EShopItem', {
      '#EPriceGroup_Fintech': 'true',
    });

    handleShopInfoDeliveryBnplContainer(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ctx.container,
      ['withMeta', 'Meta', 'meta', 'DELIVERY + FINTECH', 'deliveryFintech'],
      true,
      '#withMeta'
    );
  });

  it('sets withMeta=true with delivery list', () => {
    const ctx = createContext('EShopItem', {
      '#DeliveryList': 'Курьер, Самовывоз',
    });

    handleShopInfoDeliveryBnplContainer(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ctx.container,
      ['withMeta', 'Meta', 'meta', 'DELIVERY + FINTECH', 'deliveryFintech'],
      true,
      '#withMeta'
    );
  });

  it('sets withMeta=true with abroad delivery', () => {
    const ctx = createContext('EShopItem', {
      '#EDelivery_abroad': 'true',
    });

    handleShopInfoDeliveryBnplContainer(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ctx.container,
      ['withMeta', 'Meta', 'meta', 'DELIVERY + FINTECH', 'deliveryFintech'],
      true,
      '#withMeta'
    );
  });

  it('sets withMeta=true with EOfferItem_hasDelivery flag', () => {
    const ctx = createContext('EOfferItem', {
      '#EOfferItem_hasDelivery': 'true',
    });

    handleShopInfoDeliveryBnplContainer(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ctx.container,
      ['withMeta', 'Meta', 'meta', 'DELIVERY + FINTECH', 'deliveryFintech'],
      true,
      '#withMeta'
    );
  });

  it('sets withMeta=false when no delivery or fintech', () => {
    const ctx = createContext('EShopItem', {});

    handleShopInfoDeliveryBnplContainer(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ctx.container,
      ['withMeta', 'Meta', 'meta', 'DELIVERY + FINTECH', 'deliveryFintech'],
      false,
      '#withMeta'
    );
  });

  it('does not call trySetProperty if not a snippet container', () => {
    mockIsSnippetContainer.mockReturnValue(false);

    const ctx = createContext('SomeOther', {
      '#EDeliveryGroup': 'true',
      '#EDeliveryGroup-Count': '2',
    });

    handleShopInfoDeliveryBnplContainer(ctx);

    expect(mockTrySetProperty).not.toHaveBeenCalled();
  });

  it('does nothing when row is null', () => {
    const ctx = createContext('EShopItem', null);

    handleShopInfoDeliveryBnplContainer(ctx);

    expect(mockTrySetProperty).not.toHaveBeenCalled();
  });

  it('does nothing when container is null', () => {
    handleShopInfoDeliveryBnplContainer({
      container: null as unknown as BaseNode,
      containerKey: '',
      row: {} as HandlerContext['row'],
    });

    expect(mockTrySetProperty).not.toHaveBeenCalled();
  });

  it('combines delivery + fintech = withMeta=true', () => {
    const ctx = createContext('EShopItem', {
      '#DeliveryList': 'Курьер',
      '#ShopInfo-Bnpl': 'true',
      '#ShopInfo-Bnpl-Count': '2',
    });

    handleShopInfoDeliveryBnplContainer(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ctx.container,
      ['withMeta', 'Meta', 'meta', 'DELIVERY + FINTECH', 'deliveryFintech'],
      true,
      '#withMeta'
    );
  });

  it('handles EBnpl flag as fintech source', () => {
    const ctx = createContext('EShopItem', {
      '#EBnpl': 'true',
      '#EBnpl-Count': '1',
    });

    handleShopInfoDeliveryBnplContainer(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ctx.container,
      ['withMeta', 'Meta', 'meta', 'DELIVERY + FINTECH', 'deliveryFintech'],
      true,
      '#withMeta'
    );
  });
});
