/**
 * Tests for price handlers — handleEPriceGroup, handleLabelDiscountView
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
  handleEPriceGroup,
  handleLabelDiscountView,
} from '../../src/sandbox/handlers/price-handlers';
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

function createContext(containerName: string, row: Record<string, string> | null): HandlerContext {
  const container = createMockInstance(containerName);
  return {
    container,
    containerKey: container.id,
    row: row as HandlerContext['row'],
    instanceCache: mockCache(),
  };
}

/** Create a mock EPrice instance with optional view property */
function createMockEPrice(view?: string): ReturnType<typeof createMockInstance> {
  const props: Record<string, string> = {};
  if (view) {
    props['view'] = view;
  }
  const inst = createMockInstance('EPrice', props);
  // Ensure componentProperties has correct VARIANT type for view detection
  if (view) {
    inst.componentProperties['view'] = { value: view, type: 'VARIANT' };
  }
  return inst;
}

describe('handleEPriceGroup', () => {
  let ePriceGroupInstance: ReturnType<typeof createMockInstance>;

  beforeEach(() => {
    vi.clearAllMocks();
    ePriceGroupInstance = createMockInstance('EPriceGroup');
    ePriceGroupInstance.children = [];
    mockGetCachedInstance.mockReturnValue(null);
    mockGetCachedInstanceByNames.mockReturnValue(null);
  });

  function setupEPriceGroup(children?: ReturnType<typeof createMockInstance>[]) {
    if (children) {
      ePriceGroupInstance.children = children;
      for (const child of children) {
        child.parent = ePriceGroupInstance;
      }
    }
    mockGetCachedInstance.mockImplementation((_cache, name) => {
      if (name === 'EPriceGroup') return ePriceGroupInstance;
      return null;
    });
  }

  // === Early returns ===

  it('does nothing when row is null', async () => {
    const ctx = createContext('EShopItem', null);
    await handleEPriceGroup(ctx);
    expect(mockTrySetProperty).not.toHaveBeenCalled();
  });

  it('does nothing when container is null', async () => {
    await handleEPriceGroup({
      container: null as unknown as BaseNode,
      containerKey: '',
      row: {} as HandlerContext['row'],
      instanceCache: mockCache(),
    });
    expect(mockTrySetProperty).not.toHaveBeenCalled();
  });

  it('returns early when EPriceGroup not found in cache', async () => {
    mockGetCachedInstance.mockReturnValue(null);
    const ctx = createContext('EShopItem', { '#OrganicPrice': '1000' });
    await handleEPriceGroup(ctx);
    expect(mockTrySetProperty).not.toHaveBeenCalled();
  });

  // === Variant properties ===

  it('sets size property based on #EPriceGroup_Size', async () => {
    setupEPriceGroup();
    const ctx = createContext('EShopItem', { '#EPriceGroup_Size': 'l' });
    await handleEPriceGroup(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ePriceGroupInstance,
      ['size'],
      'l',
      '#EPriceGroup_Size',
    );
  });

  it('sets combiningElements based on #CombiningElements', async () => {
    setupEPriceGroup();
    const ctx = createContext('EShopItem', { '#CombiningElements': 'Discount' });
    await handleEPriceGroup(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ePriceGroupInstance,
      ['Combining Elements', 'combiningElements'],
      'Discount',
      '#CombiningElements',
    );
  });

  // === Boolean properties ===

  it('sets withLabelDiscount=true when #EPriceGroup_Discount is true', async () => {
    setupEPriceGroup();
    const ctx = createContext('EShopItem', { '#EPriceGroup_Discount': 'true' });
    await handleEPriceGroup(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ePriceGroupInstance,
      ['withLabelDiscount'],
      true,
      '#EPriceGroup_Discount',
    );
  });

  it('sets withLabelDiscount=true when #Discount is true', async () => {
    setupEPriceGroup();
    const ctx = createContext('EShopItem', { '#Discount': 'true' });
    await handleEPriceGroup(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ePriceGroupInstance,
      ['withLabelDiscount'],
      true,
      '#EPriceGroup_Discount',
    );
  });

  it('sets withLabelDiscount=false when no discount flags', async () => {
    setupEPriceGroup();
    const ctx = createContext('EShopItem', {});
    await handleEPriceGroup(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ePriceGroupInstance,
      ['withLabelDiscount'],
      false,
      '#EPriceGroup_Discount',
    );
  });

  it('sets withPriceOld=true when #EPriceGroup_OldPrice is true', async () => {
    setupEPriceGroup();
    const ctx = createContext('EShopItem', { '#EPriceGroup_OldPrice': 'true' });
    await handleEPriceGroup(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ePriceGroupInstance,
      ['withPriceOld'],
      true,
      '#EPriceGroup_OldPrice',
    );
  });

  it('sets withPriceOld=true when discount is present (implies old price)', async () => {
    setupEPriceGroup();
    const ctx = createContext('EShopItem', { '#EPriceGroup_Discount': 'true' });
    await handleEPriceGroup(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ePriceGroupInstance,
      ['withPriceOld'],
      true,
      '#EPriceGroup_OldPrice',
    );
  });

  it('sets withPriceOld=false when no old price or discount', async () => {
    setupEPriceGroup();
    const ctx = createContext('EShopItem', {});
    await handleEPriceGroup(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ePriceGroupInstance,
      ['withPriceOld'],
      false,
      '#EPriceGroup_OldPrice',
    );
  });

  it('sets withFintech=true when #EPriceGroup_Fintech is true', async () => {
    setupEPriceGroup();
    const ctx = createContext('EShopItem', { '#EPriceGroup_Fintech': 'true' });
    await handleEPriceGroup(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ePriceGroupInstance,
      ['withFintech'],
      true,
      '#EPriceGroup_Fintech',
    );
  });

  it('sets withFintech=false when fintech not present', async () => {
    setupEPriceGroup();
    const ctx = createContext('EShopItem', {});
    await handleEPriceGroup(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ePriceGroupInstance,
      ['withFintech'],
      false,
      '#EPriceGroup_Fintech',
    );
  });

  it('sets withBarometer=true when #EPriceGroup_Barometer is true', async () => {
    setupEPriceGroup();
    const ctx = createContext('EShopItem', { '#EPriceGroup_Barometer': 'true' });
    await handleEPriceGroup(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ePriceGroupInstance,
      ['withBarometer'],
      true,
      '#withBarometer',
    );
  });

  it('sets withBarometer=true via fallback #ELabelGroup_Barometer', async () => {
    setupEPriceGroup();
    const ctx = createContext('EShopItem', { '#ELabelGroup_Barometer': 'true' });
    await handleEPriceGroup(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ePriceGroupInstance,
      ['withBarometer'],
      true,
      '#withBarometer',
    );
  });

  it('forces withBarometer=false for EProductSnippet containers', async () => {
    setupEPriceGroup();
    const ctx = createContext('EProductSnippet', { '#EPriceGroup_Barometer': 'true' });
    // Override container name
    (ctx.container as { name: string }).name = 'EProductSnippet';
    await handleEPriceGroup(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ePriceGroupInstance,
      ['withBarometer'],
      false,
      '#withBarometer',
    );
  });

  it('forces withBarometer=false for EProductSnippet2 containers', async () => {
    setupEPriceGroup();
    const ctx = createContext('EProductSnippet2', { '#EPriceGroup_Barometer': 'true' });
    (ctx.container as { name: string }).name = 'EProductSnippet2';
    await handleEPriceGroup(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ePriceGroupInstance,
      ['withBarometer'],
      false,
      '#withBarometer',
    );
  });

  it('sets withBarometer=false when no barometer flags', async () => {
    setupEPriceGroup();
    const ctx = createContext('EShopItem', {});
    await handleEPriceGroup(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ePriceGroupInstance,
      ['withBarometer'],
      false,
      '#withBarometer',
    );
  });

  it('sets withDisclaimer=true when #PriceDisclaimer is true', async () => {
    setupEPriceGroup();
    const ctx = createContext('EShopItem', { '#PriceDisclaimer': 'true' });
    await handleEPriceGroup(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ePriceGroupInstance,
      ['withDisclaimer'],
      true,
      '#PriceDisclaimer',
    );
  });

  it('sets withDisclaimer=false when no disclaimer flag', async () => {
    setupEPriceGroup();
    const ctx = createContext('EShopItem', {});
    await handleEPriceGroup(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ePriceGroupInstance,
      ['withDisclaimer'],
      false,
      '#PriceDisclaimer',
    );
  });

  it('sets Plus Cashback boolean from #PlusCashback', async () => {
    setupEPriceGroup();
    const ctx = createContext('EShopItem', { '#PlusCashback': 'true' });
    await handleEPriceGroup(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ePriceGroupInstance,
      ['Plus Cashback', 'plusCashback'],
      true,
      '#PlusCashback',
    );
  });

  it('sets Plus Cashback=false when absent', async () => {
    setupEPriceGroup();
    const ctx = createContext('EShopItem', {});
    await handleEPriceGroup(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ePriceGroupInstance,
      ['Plus Cashback', 'plusCashback'],
      false,
      '#PlusCashback',
    );
  });

  it('sets [EXP] Calculation boolean from #ExpCalculation', async () => {
    setupEPriceGroup();
    const ctx = createContext('EShopItem', { '#ExpCalculation': 'true' });
    await handleEPriceGroup(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ePriceGroupInstance,
      ['[EXP] Calculation', 'expCalculation'],
      true,
      '#ExpCalculation',
    );
  });

  it('sets [EXP] Calculation=false when absent', async () => {
    setupEPriceGroup();
    const ctx = createContext('EShopItem', {});
    await handleEPriceGroup(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ePriceGroupInstance,
      ['[EXP] Calculation', 'expCalculation'],
      false,
      '#ExpCalculation',
    );
  });

  // === EPrice nested instance — view property ===

  it('sets EPrice view to "undefined" for default/absent #EPrice_View', async () => {
    const ePrice = createMockEPrice();
    setupEPriceGroup([ePrice]);
    const ctx = createContext('EShopItem', {});
    await handleEPriceGroup(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ePrice,
      ['view', 'View'],
      'undefined',
      '#EPrice_View',
    );
  });

  it('sets EPrice view to "special" when #EPrice_View is special', async () => {
    const ePrice = createMockEPrice();
    setupEPriceGroup([ePrice]);
    const ctx = createContext('EShopItem', { '#EPrice_View': 'special' });
    await handleEPriceGroup(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ePrice,
      ['view', 'View'],
      'special',
      '#EPrice_View',
    );
  });

  it('sets EPrice view to "old" when #EPrice_View is old', async () => {
    const ePrice = createMockEPrice();
    setupEPriceGroup([ePrice]);
    const ctx = createContext('EShopItem', { '#EPrice_View': 'old' });
    await handleEPriceGroup(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ePrice,
      ['view', 'View'],
      'old',
      '#EPrice_View',
    );
  });

  it('maps "default" EPrice_View to "undefined" (Figma convention)', async () => {
    const ePrice = createMockEPrice();
    setupEPriceGroup([ePrice]);
    const ctx = createContext('EShopItem', { '#EPrice_View': 'default' });
    await handleEPriceGroup(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ePrice,
      ['view', 'View'],
      'undefined',
      '#EPrice_View',
    );
  });

  // === EPrice value ===

  it('sets price value on non-old EPrice instance via setProperties', async () => {
    const ePrice = createMockEPrice();
    setupEPriceGroup([ePrice]);
    const ctx = createContext('EShopItem', { '#OrganicPrice': '1 500 ₽' });
    await handleEPriceGroup(ctx);

    // setPriceToInstance strips non-digit chars and calls setProperties
    expect(ePrice.setProperties).toHaveBeenCalledWith({ value: '1500' });
  });

  it('skips old-price EPrice when setting current price', async () => {
    const oldEPrice = createMockEPrice('old');
    const currentEPrice = createMockEPrice();
    setupEPriceGroup([oldEPrice, currentEPrice]);
    const ctx = createContext('EShopItem', { '#OrganicPrice': '2000' });
    await handleEPriceGroup(ctx);

    // Old price instance should NOT get current price value
    expect(oldEPrice.setProperties).not.toHaveBeenCalledWith({ value: '2000' });
    // Current price instance should get the value
    expect(currentEPrice.setProperties).toHaveBeenCalledWith({ value: '2000' });
  });

  it('uses #ContentHeader as price value when #OrganicPrice absent', async () => {
    const ePrice = createMockEPrice();
    setupEPriceGroup([ePrice]);
    const ctx = createContext('EShopItem', { '#ContentHeader': 'Каталог товаров' });
    await handleEPriceGroup(ctx);

    expect(ePrice.setProperties).toHaveBeenCalledWith({ value: 'Каталог товаров' });
  });

  // === Old price ===

  it('sets old price value on EPrice with view=old', async () => {
    const currentEPrice = createMockEPrice();
    const oldEPrice = createMockEPrice('old');
    setupEPriceGroup([currentEPrice, oldEPrice]);

    const ctx = createContext('EShopItem', {
      '#EPriceGroup_OldPrice': 'true',
      '#OldPrice': '2 000 ₽',
      '#OrganicPrice': '1 500 ₽',
    });
    await handleEPriceGroup(ctx);

    // Old EPrice should get old price value (digits only)
    expect(oldEPrice.setProperties).toHaveBeenCalledWith({ value: '2000' });
  });

  it('does not set old price when withPriceOld is false', async () => {
    const currentEPrice = createMockEPrice();
    const oldEPrice = createMockEPrice('old');
    setupEPriceGroup([currentEPrice, oldEPrice]);

    const ctx = createContext('EShopItem', {
      '#OldPrice': '2 000 ₽',
      // No #EPriceGroup_OldPrice and no discount → hasOldPrice=false
    });
    await handleEPriceGroup(ctx);

    // Old price should NOT be set because hasOldPrice is false
    expect(oldEPrice.setProperties).not.toHaveBeenCalledWith({ value: '2000' });
  });

  it('falls back to second EPrice as old price when no view=old instance', async () => {
    const firstEPrice = createMockEPrice();
    const secondEPrice = createMockEPrice(); // No view=old
    setupEPriceGroup([firstEPrice, secondEPrice]);

    const ctx = createContext('EShopItem', {
      '#EPriceGroup_OldPrice': 'true',
      '#OldPrice': '3000',
      '#OrganicPrice': '2000',
    });
    await handleEPriceGroup(ctx);

    // Fallback: when exactly 2 EPrices and none is old, second one is used
    expect(secondEPrice.setProperties).toHaveBeenCalledWith({ value: '3000' });
  });

  // === Fintech configuration ===

  it('configures fintech type and view on nested instance', async () => {
    setupEPriceGroup();
    const fintechInstance = createMockInstance('Fintech');
    mockGetCachedInstanceByNames.mockImplementation((_cache, names) => {
      if (names && names.includes('Fintech')) return fintechInstance;
      return null;
    });

    const ctx = createContext('EShopItem', {
      '#EPriceGroup_Fintech': 'true',
      '#Fintech_Type': 'split',
      '#Fintech_View': 'compact',
    });
    await handleEPriceGroup(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      fintechInstance,
      ['type', 'Type'],
      'split',
      '#Fintech_Type',
    );
    expect(mockTrySetProperty).toHaveBeenCalledWith(
      fintechInstance,
      ['View', 'view'],
      'compact',
      '#Fintech_View',
    );
  });

  it('does not configure fintech when withFintech is false', async () => {
    setupEPriceGroup();
    const fintechInstance = createMockInstance('Fintech');
    mockGetCachedInstanceByNames.mockReturnValue(fintechInstance);

    const ctx = createContext('EShopItem', {
      '#Fintech_Type': 'split',
      // #EPriceGroup_Fintech NOT set to true
    });
    await handleEPriceGroup(ctx);

    // Fintech type should not be set because hasFintech is false
    expect(mockTrySetProperty).not.toHaveBeenCalledWith(
      fintechInstance,
      ['type', 'Type'],
      'split',
      '#Fintech_Type',
    );
  });

  it('uses MetaFintech over Fintech when both cached', async () => {
    setupEPriceGroup();
    const fintechInstance = createMockInstance('Fintech');
    const metaFintechInstance = createMockInstance('MetaFintech');

    mockGetCachedInstanceByNames.mockImplementation((_cache, names) => {
      if (names && names.includes('Fintech')) return fintechInstance;
      if (names && names.includes('MetaFintech')) return metaFintechInstance;
      return null;
    });

    const ctx = createContext('EShopItem', {
      '#EPriceGroup_Fintech': 'true',
      '#Fintech_Type': 'bnpl',
    });
    await handleEPriceGroup(ctx);

    // MetaFintech is the target when found
    expect(mockTrySetProperty).toHaveBeenCalledWith(
      metaFintechInstance,
      ['type', 'Type'],
      'bnpl',
      '#Fintech_Type',
    );
  });

  // === Combined scenario ===

  it('sets all properties in a full data row', async () => {
    const ePrice = createMockEPrice();
    setupEPriceGroup([ePrice]);

    const ctx = createContext('EShopItem', {
      '#EPriceGroup_Size': 'm',
      '#CombiningElements': 'None',
      '#EPriceGroup_Discount': 'true',
      '#EPriceGroup_OldPrice': 'true',
      '#EPriceGroup_Fintech': 'false',
      '#EPriceGroup_Barometer': 'true',
      '#PriceDisclaimer': 'true',
      '#PlusCashback': 'true',
      '#ExpCalculation': 'false',
      '#OrganicPrice': '999',
      '#EPrice_View': 'special',
    });
    await handleEPriceGroup(ctx);

    // Check a selection of key properties were set
    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ePriceGroupInstance,
      ['size'],
      'm',
      '#EPriceGroup_Size',
    );
    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ePriceGroupInstance,
      ['withLabelDiscount'],
      true,
      '#EPriceGroup_Discount',
    );
    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ePriceGroupInstance,
      ['withPriceOld'],
      true,
      '#EPriceGroup_OldPrice',
    );
    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ePriceGroupInstance,
      ['withBarometer'],
      true,
      '#withBarometer',
    );
    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ePriceGroupInstance,
      ['withDisclaimer'],
      true,
      '#PriceDisclaimer',
    );
    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ePriceGroupInstance,
      ['Plus Cashback', 'plusCashback'],
      true,
      '#PlusCashback',
    );
    expect(mockTrySetProperty).toHaveBeenCalledWith(
      ePrice,
      ['view', 'View'],
      'special',
      '#EPrice_View',
    );
    expect(ePrice.setProperties).toHaveBeenCalledWith({ value: '999' });
  });
});

describe('handleLabelDiscountView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCachedInstance.mockReturnValue(null);
    mockGetCachedInstanceByNames.mockReturnValue(null);
  });

  // === Early returns ===

  it('does nothing when row is null', async () => {
    const ctx = createContext('EShopItem', null);
    await handleLabelDiscountView(ctx);
    expect(mockTrySetProperty).not.toHaveBeenCalled();
  });

  it('does nothing when container is null', async () => {
    await handleLabelDiscountView({
      container: null as unknown as BaseNode,
      containerKey: '',
      row: {} as HandlerContext['row'],
      instanceCache: mockCache(),
    });
    expect(mockTrySetProperty).not.toHaveBeenCalled();
  });

  it('does nothing when no discount flag is set', async () => {
    const ctx = createContext('EShopItem', {
      '#LabelDiscount_View': 'outlineSpecial',
      '#discount': '-20%',
    });
    await handleLabelDiscountView(ctx);
    expect(mockTrySetProperty).not.toHaveBeenCalled();
  });

  // === View property ===

  it('sets view on LabelDiscount instance', async () => {
    const labelDiscount = createMockInstance('LabelDiscount');
    labelDiscount.children = [];
    mockGetCachedInstanceByNames.mockReturnValue(labelDiscount);

    const ctx = createContext('EShopItem', {
      '#EPriceGroup_Discount': 'true',
      '#LabelDiscount_View': 'outlineSpecial',
    });
    await handleLabelDiscountView(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      labelDiscount,
      ['view', 'View'],
      'outlineSpecial',
      '#LabelDiscount_View',
    );
  });

  it('defaults view to outlinePrimary when #LabelDiscount_View absent', async () => {
    const labelDiscount = createMockInstance('LabelDiscount');
    labelDiscount.children = [];
    mockGetCachedInstanceByNames.mockReturnValue(labelDiscount);

    const ctx = createContext('EShopItem', {
      '#EPriceGroup_Discount': 'true',
    });
    await handleLabelDiscountView(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      labelDiscount,
      ['view', 'View'],
      'outlinePrimary',
      '#LabelDiscount_View',
    );
  });

  // === Discount text ===

  it('sets discount text on nested Label instance', async () => {
    const labelInstance = createMockInstance('Label');
    const labelDiscount = createMockInstance('LabelDiscount');
    labelDiscount.children = [labelInstance];
    labelInstance.parent = labelDiscount;
    mockGetCachedInstanceByNames.mockReturnValue(labelDiscount);

    const ctx = createContext('EShopItem', {
      '#EPriceGroup_Discount': 'true',
      '#discount': '-15%',
    });
    await handleLabelDiscountView(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      labelInstance,
      ['value'],
      '-15%',
      '#DiscountLabel',
    );
  });

  it('uses #DiscountPercent when #discount absent', async () => {
    const labelInstance = createMockInstance('Label');
    const labelDiscount = createMockInstance('LabelDiscount');
    labelDiscount.children = [labelInstance];
    labelInstance.parent = labelDiscount;
    mockGetCachedInstanceByNames.mockReturnValue(labelDiscount);

    const ctx = createContext('EShopItem', {
      '#Discount': 'true',
      '#DiscountPercent': '-25%',
    });
    await handleLabelDiscountView(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      labelInstance,
      ['value'],
      '-25%',
      '#DiscountLabel',
    );
  });

  it('falls back to setting value on LabelDiscount when no nested Label', async () => {
    const labelDiscount = createMockInstance('LabelDiscount');
    labelDiscount.children = []; // No Label child
    mockGetCachedInstanceByNames.mockReturnValue(labelDiscount);

    const ctx = createContext('EShopItem', {
      '#EPriceGroup_Discount': 'true',
      '#discount': '-10%',
    });
    await handleLabelDiscountView(ctx);

    expect(mockTrySetProperty).toHaveBeenCalledWith(
      labelDiscount,
      ['value'],
      '-10%',
      '#DiscountLabel',
    );
  });

  // === Missing instance ===

  it('does not crash when LabelDiscount instance not found', async () => {
    mockGetCachedInstanceByNames.mockReturnValue(null);

    const ctx = createContext('EShopItem', {
      '#EPriceGroup_Discount': 'true',
      '#LabelDiscount_View': 'outlineSpecial',
      '#discount': '-20%',
    });

    // Should not throw
    await handleLabelDiscountView(ctx);
    expect(mockTrySetProperty).not.toHaveBeenCalled();
  });
});
