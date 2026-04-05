/**
 * Tests for button handlers — handleMarketCheckoutButton, handleEButton
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
  handleMarketCheckoutButton,
  handleEButton,
} from '../../src/sandbox/handlers/button-handlers';
import { trySetProperty } from '../../src/sandbox/property-utils';
import { getCachedInstance, getCachedInstanceByNames } from '../../src/utils/instance-cache';
import type { HandlerContext } from '../../src/sandbox/handlers/types';

const mockTrySetProperty = vi.mocked(trySetProperty);
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
  componentProps?: Record<string, string>,
): HandlerContext {
  const container = createMockInstance(containerName, componentProps || {});
  return {
    container,
    containerKey: container.id,
    row: row as HandlerContext['row'],
    instanceCache: mockCache(),
  };
}

// ==========================================
// handleMarketCheckoutButton
// ==========================================
describe('handleMarketCheckoutButton', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets withButton=true for EShopItem on desktop (always shows button)', async () => {
    const ctx = createContext('EShopItem', { '#platform': 'desktop' });

    await handleMarketCheckoutButton(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ctx.container,
      ['withButton', 'BUTTON', 'BUTTONS'],
      true,
      '#withButton',
    );
  });

  it('sets withButton=false for EShopItem on touch without checkout', async () => {
    const ctx = createContext('EShopItem', { '#platform': 'touch' });

    await handleMarketCheckoutButton(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ctx.container,
      ['withButton', 'BUTTON', 'BUTTONS'],
      false,
      '#withButton',
    );
  });

  it('sets withButton=true for EShopItem on touch with checkout', async () => {
    const ctx = createContext('EShopItem', {
      '#platform': 'touch',
      '#ButtonType': 'checkout',
    });

    await handleMarketCheckoutButton(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ctx.container,
      ['withButton', 'BUTTON', 'BUTTONS'],
      true,
      '#withButton',
    );
  });

  it('sets withButton=true for ESnippet with checkout', async () => {
    const ctx = createContext('ESnippet', {
      '#ButtonType': 'checkout',
    });

    await handleMarketCheckoutButton(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ctx.container,
      ['withButton', 'BUTTON', 'BUTTONS'],
      true,
      '#withButton',
    );
  });

  it('sets withButton=false for ESnippet without checkout', async () => {
    const ctx = createContext('ESnippet', {});

    await handleMarketCheckoutButton(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ctx.container,
      ['withButton', 'BUTTON', 'BUTTONS'],
      false,
      '#withButton',
    );
  });

  it('skips EOfferItem containers (handled by handleEOfferItem)', async () => {
    const ctx = createContext('EOfferItem', { '#ButtonType': 'checkout' });

    await handleMarketCheckoutButton(ctx);

    // EOfferItem is skipped with explicit return
    expect(mockTrySetProperty).not.toHaveBeenCalled();
  });

  it('uses #BUTTON flag for unknown container types', async () => {
    const ctx = createContext('SomeOtherContainer', { '#BUTTON': 'true' });

    await handleMarketCheckoutButton(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ctx.container,
      ['withButton', 'BUTTON', 'BUTTONS'],
      true,
      '#withButton',
    );
  });

  it('detects checkout via primary button view', async () => {
    const ctx = createContext('ESnippet', {
      '#ButtonView': 'primaryLong',
    });

    await handleMarketCheckoutButton(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ctx.container,
      ['withButton', 'BUTTON', 'BUTTONS'],
      true,
      '#withButton',
    );
  });

  it('detects touch platform from component properties', async () => {
    const ctx = createContext('EShopItem', {}, { Platform: 'Touch' });

    await handleMarketCheckoutButton(ctx);

    // Touch without checkout → no button
    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ctx.container,
      ['withButton', 'BUTTON', 'BUTTONS'],
      false,
      '#withButton',
    );
  });

  it('does nothing when row is null', async () => {
    const ctx = createContext('EShopItem', null);

    await handleMarketCheckoutButton(ctx);

    expect(mockTrySetProperty).not.toHaveBeenCalled();
  });

  it('does nothing when container is null', async () => {
    await handleMarketCheckoutButton({
      container: null as unknown as BaseNode,
      containerKey: '',
      row: {} as HandlerContext['row'],
    });

    expect(mockTrySetProperty).not.toHaveBeenCalled();
  });
});

// ==========================================
// handleEButton
// ==========================================
describe('handleEButton', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets withButton and view for EShopItem desktop', async () => {
    const buttonInstance = createMockInstance('EButton');
    mockGetCachedInstanceByNames.mockReturnValueOnce(buttonInstance);

    const ctx = createContext('EShopItem', { '#platform': 'desktop' });

    await handleEButton(ctx);

    // withButton=true on container (desktop always shows)
    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ctx.container,
      ['withButton', 'BUTTON', 'BUTTONS'],
      true,
      '#withButton',
    );

    // view=secondary for EShopItem without checkout
    expect(mockTrySetProperty).toHaveBeenCalledWith(
      buttonInstance,
      ['view', 'View', 'VIEW'],
      'secondary',
      '#ButtonView',
    );
  });

  it('sets view=primaryShort for EShopItem with checkout', async () => {
    const buttonInstance = createMockInstance('EButton');
    mockGetCachedInstanceByNames.mockReturnValueOnce(buttonInstance);

    const ctx = createContext('EShopItem', {
      '#platform': 'desktop',
      '#ButtonType': 'checkout',
    });

    await handleEButton(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      buttonInstance,
      ['view', 'View', 'VIEW'],
      'primaryShort',
      '#ButtonView',
    );
  });

  it('sets view=white for EOfferItem without checkout', async () => {
    const buttonInstance = createMockInstance('EButton');
    mockGetCachedInstanceByNames.mockReturnValueOnce(buttonInstance);

    const ctx = createContext('EOfferItem', { '#platform': 'desktop' });

    await handleEButton(ctx);

    // EOfferItem skips withButton set on container
    // But still sets view on the button instance
    expect(mockTrySetProperty).toHaveBeenCalledWith(
      buttonInstance,
      ['view', 'View', 'VIEW'],
      'white',
      '#ButtonView',
    );
  });

  it('sets view=primaryShort for EOfferItem with checkout', async () => {
    const buttonInstance = createMockInstance('EButton');
    mockGetCachedInstanceByNames.mockReturnValueOnce(buttonInstance);

    const ctx = createContext('EOfferItem', {
      '#platform': 'desktop',
      '#ButtonType': 'checkout',
    });

    await handleEButton(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      buttonInstance,
      ['view', 'View', 'VIEW'],
      'primaryShort',
      '#ButtonView',
    );
  });

  it('sets view=primaryLong for ESnippet desktop without checkout', async () => {
    const buttonInstance = createMockInstance('EButton');
    mockGetCachedInstanceByNames.mockReturnValueOnce(buttonInstance);

    const ctx = createContext('ESnippet', {
      '#platform': 'desktop',
      '#BUTTON': 'true',
    });

    await handleEButton(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      buttonInstance,
      ['view', 'View', 'VIEW'],
      'primaryLong',
      '#ButtonView',
    );
  });

  it('sets view=primaryShort for ESnippet touch with checkout', async () => {
    const buttonInstance = createMockInstance('EButton');
    mockGetCachedInstanceByNames.mockReturnValueOnce(buttonInstance);

    const ctx = createContext('ESnippet', {
      '#platform': 'touch',
      '#ButtonType': 'checkout',
    });

    await handleEButton(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      buttonInstance,
      ['view', 'View', 'VIEW'],
      'primaryShort',
      '#ButtonView',
    );
  });

  it('does not set view when hasButton=false', async () => {
    // ESnippet without checkout and touch → no button
    // Note: no mock for getCachedInstanceByNames — handler returns before reaching button lookup
    const ctx = createContext('ESnippet', { '#platform': 'touch' });

    await handleEButton(ctx);

    // withButton=false set on container
    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ctx.container,
      ['withButton', 'BUTTON', 'BUTTONS'],
      false,
      '#withButton',
    );

    // view NOT set (only 1 call for withButton)
    expect(mockTrySetProperty).toHaveBeenCalledTimes(1);
  });

  it('falls back to getCachedInstance when getCachedInstanceByNames returns null', async () => {
    const buttonInstance = createMockInstance('EButton');
    mockGetCachedInstanceByNames.mockReturnValueOnce(null);
    mockGetCachedInstance.mockReturnValueOnce(buttonInstance);

    const ctx = createContext('EShopItem', { '#platform': 'desktop' });

    await handleEButton(ctx);

    expect(mockGetCachedInstance).toHaveBeenCalledWith(ctx.instanceCache, 'EButton');
    expect(mockTrySetProperty).toHaveBeenCalledWith(
      buttonInstance,
      ['view', 'View', 'VIEW'],
      'secondary',
      '#ButtonView',
    );
  });

  it('logs warning when no button instance found', async () => {
    // All cache lookups return null (default mock behavior)
    // findButtonInstanceLoose BFS on container with no children also returns null

    const ctx = createContext('EShopItem', { '#platform': 'desktop' });

    await handleEButton(ctx);

    // withButton=true set on container (desktop always shows)
    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ctx.container,
      ['withButton', 'BUTTON', 'BUTTONS'],
      true,
      '#withButton',
    );

    // No view call — button instance not found
    const viewCalls = mockTrySetProperty.mock.calls.filter((c) => c[3] === '#ButtonView');
    expect(viewCalls).toHaveLength(0);
  });

  it('does not set withButton on EOfferItem container', async () => {
    const buttonInstance = createMockInstance('EButton');
    mockGetCachedInstanceByNames.mockReturnValueOnce(buttonInstance);

    const ctx = createContext('EOfferItem', { '#platform': 'desktop' });

    await handleEButton(ctx);

    // withButton NOT called on container for EOfferItem
    const withButtonCalls = mockTrySetProperty.mock.calls.filter((c) => c[3] === '#withButton');
    expect(withButtonCalls).toHaveLength(0);
  });

  it('does nothing when row is null', async () => {
    const ctx = createContext('EShopItem', null);

    await handleEButton(ctx);

    expect(mockTrySetProperty).not.toHaveBeenCalled();
  });

  it('does nothing when container is null', async () => {
    await handleEButton({
      container: null as unknown as BaseNode,
      containerKey: '',
      row: {} as HandlerContext['row'],
    });

    expect(mockTrySetProperty).not.toHaveBeenCalled();
  });

  it('uses #SnippetType for unknown container names', async () => {
    const buttonInstance = createMockInstance('EButton');
    // Must set mock BEFORE calling handler — mock consumed when handler calls getCachedInstanceByNames
    mockGetCachedInstanceByNames.mockReturnValueOnce(buttonInstance);

    const ctx = createContext('UnknownContainer', {
      '#BUTTON': 'true',
      '#SnippetType': 'EShopItem',
      '#ButtonType': 'checkout',
    });

    await handleEButton(ctx);

    // withButton=true on container
    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ctx.container,
      ['withButton', 'BUTTON', 'BUTTONS'],
      true,
      '#withButton',
    );

    // View determined by #SnippetType=EShopItem + checkout → primaryShort
    const viewCalls = mockTrySetProperty.mock.calls.filter((c) => c[3] === '#ButtonView');
    expect(viewCalls).toHaveLength(1);
    expect(viewCalls[0][2]).toBe('primaryShort');
  });
});
