/**
 * Tests for ESnippet structural hooks — sitelinks, promo, thumb fallback,
 * force-reset booleans, title maxLines, clipsContent.
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
  findTextLayerByName: vi.fn(() => null),
  safeSetTextNode: vi.fn(),
}));

vi.mock('../../src/sandbox/handlers/visibility-handlers', () => ({
  safeSetVisible: vi.fn(() => true),
}));

import { handleESnippetStructural } from '../../src/sandbox/schema/esnippet-hooks';
import {
  findFirstNodeByName,
  findTextLayerByName,
  safeSetTextNode,
} from '../../src/utils/node-search';
import { safeSetVisible } from '../../src/sandbox/handlers/visibility-handlers';
import type { HandlerContext } from '../../src/sandbox/handlers/types';

const mockFindFirstNodeByName = vi.mocked(findFirstNodeByName);
const mockFindTextLayerByName = vi.mocked(findTextLayerByName);
const mockSafeSetTextNode = vi.mocked(safeSetTextNode);
const mockSafeSetVisible = vi.mocked(safeSetVisible);

/**
 * Creates a mock ESnippet instance with the properties and methods
 * needed by the structural hooks.
 */
function createESnippetInstance(
  name: string,
  componentProperties: Record<string, { value: string | boolean; type: string }> = {},
) {
  const instance = createMockInstance(name);
  instance.type = 'INSTANCE';
  instance.removed = false;
  instance.name = name;
  instance.componentProperties = componentProperties;

  // findOne for clipsContent
  instance.findOne = vi.fn(() => null);
  // findAll for sitelinks broader search
  instance.findAll = vi.fn(() => []);

  return instance;
}

function createContext(containerName: string, row: Record<string, string> | null): HandlerContext {
  const container = createESnippetInstance(containerName);
  return {
    container,
    containerKey: container.id,
    row: row as HandlerContext['row'],
  };
}

describe('handleESnippetStructural', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Early returns ---

  it('returns early when container is null', () => {
    handleESnippetStructural({
      container: null as unknown as BaseNode,
      containerKey: '',
      row: {} as HandlerContext['row'],
    });

    expect(mockFindFirstNodeByName).not.toHaveBeenCalled();
  });

  it('returns early when row is null', () => {
    const ctx = createContext('ESnippet', null);

    handleESnippetStructural(ctx);

    expect(mockFindFirstNodeByName).not.toHaveBeenCalled();
  });

  it('returns early for non-ESnippet container names', () => {
    const ctx = createContext('EShopItem', { '#OrganicTitle': 'Title' });

    handleESnippetStructural(ctx);

    expect(mockFindFirstNodeByName).not.toHaveBeenCalled();
  });

  it('returns early for non-ESnippet containers like EOfferItem', () => {
    const ctx = createContext('EOfferItem', { '#OrganicTitle': 'Title' });

    handleESnippetStructural(ctx);

    expect(mockFindFirstNodeByName).not.toHaveBeenCalled();
  });

  it('processes ESnippet container', () => {
    const ctx = createContext('ESnippet', {});

    handleESnippetStructural(ctx);

    // Should have attempted to find sitelinks container (part of applySitelinks)
    expect(mockFindFirstNodeByName).toHaveBeenCalled();
  });

  it('processes Snippet container (alias)', () => {
    const ctx = createContext('Snippet', {});

    handleESnippetStructural(ctx);

    expect(mockFindFirstNodeByName).toHaveBeenCalled();
  });

  it('returns early when container.type is not INSTANCE', () => {
    const ctx = createContext('ESnippet', {});
    (ctx.container as { type: string }).type = 'FRAME';

    handleESnippetStructural(ctx);

    expect(mockFindFirstNodeByName).not.toHaveBeenCalled();
  });

  it('returns early when container is removed', () => {
    const ctx = createContext('ESnippet', {});
    (ctx.container as { removed: boolean }).removed = true;

    handleESnippetStructural(ctx);

    expect(mockFindFirstNodeByName).not.toHaveBeenCalled();
  });

  // --- applyThumbFallback ---

  describe('applyThumbFallback (via handleESnippetStructural)', () => {
    it('hides EThumb layer when #withThumb is not true', () => {
      const ctx = createContext('ESnippet', {});
      const thumbLayer = {
        id: 'thumb-1',
        name: 'EThumb',
        type: 'INSTANCE',
        visible: true,
      };
      mockFindFirstNodeByName.mockImplementation((_container, name) => {
        if (name === 'EThumb') return thumbLayer as unknown as SceneNode;
        return null;
      });

      handleESnippetStructural(ctx);

      expect(mockSafeSetVisible).toHaveBeenCalledWith(thumbLayer, false, ctx.container);
    });

    it('does not hide EThumb when #withThumb is true', () => {
      const ctx = createContext('ESnippet', { '#withThumb': 'true' });

      handleESnippetStructural(ctx);

      expect(mockSafeSetVisible).not.toHaveBeenCalled();
    });

    it('does not hide EThumb when #imageType is EThumbGroup', () => {
      const ctx = createContext('ESnippet', { '#imageType': 'EThumbGroup' });

      handleESnippetStructural(ctx);

      expect(mockSafeSetVisible).not.toHaveBeenCalled();
    });
  });

  // --- applySitelinks ---

  describe('applySitelinks (via handleESnippetStructural)', () => {
    it('hides sitelinks container when #Sitelinks is not true', () => {
      const ctx = createContext('ESnippet', { '#Sitelinks': 'false' });
      const sitelinksContainer = {
        id: 'sitelinks-1',
        name: 'Sitelinks',
        type: 'FRAME',
        visible: true,
      };
      mockFindFirstNodeByName.mockImplementation((_container, name) => {
        if (name === 'Sitelinks') return sitelinksContainer as unknown as SceneNode;
        return null;
      });

      handleESnippetStructural(ctx);

      expect(sitelinksContainer.visible).toBe(false);
    });

    it('sets sitelink text on named layers when #Sitelinks is true', () => {
      const ctx = createContext('ESnippet', {
        '#Sitelinks': 'true',
        '#Sitelink_1': 'Link One',
        '#Sitelink_2': 'Link Two',
      });

      const sitelinksContainer = {
        id: 'sitelinks-1',
        name: 'Sitelinks',
        type: 'FRAME',
        visible: true,
      };
      const textLayer1 = { id: 'sl-text-1', name: '#Sitelink_1', type: 'TEXT', characters: '' };
      const textLayer2 = { id: 'sl-text-2', name: '#Sitelink_2', type: 'TEXT', characters: '' };

      mockFindFirstNodeByName.mockImplementation((_container, name) => {
        if (name === 'Sitelinks') return sitelinksContainer as unknown as SceneNode;
        // Unused sitelink slots: not found
        return null;
      });
      mockFindTextLayerByName.mockImplementation((_container, name) => {
        if (name === '#Sitelink_1') return textLayer1 as unknown as TextNode;
        if (name === '#Sitelink_2') return textLayer2 as unknown as TextNode;
        return null;
      });

      handleESnippetStructural(ctx);

      expect(mockSafeSetTextNode).toHaveBeenCalledWith(textLayer1, 'Link One');
      expect(mockSafeSetTextNode).toHaveBeenCalledWith(textLayer2, 'Link Two');
    });

    it('hides unused sitelink slots beyond actual count', () => {
      const ctx = createContext('ESnippet', {
        '#Sitelinks': 'true',
        '#Sitelink_1': 'Only One Link',
      });

      const sitelinksContainer = {
        id: 'sitelinks-1',
        name: 'Sitelinks',
        type: 'FRAME',
        visible: true,
      };
      const textLayer1 = { id: 'sl-text-1', name: '#Sitelink_1', type: 'TEXT', characters: '' };

      // Unused slot #Sitelink_2 found — should be hidden
      const unusedSlot2 = {
        id: 'sl-unused-2',
        name: '#Sitelink_2',
        type: 'TEXT',
        visible: true,
        parent: {
          name: 'Sitelink',
          visible: true,
          parent: {
            children: [],
          },
        },
      };

      mockFindFirstNodeByName.mockImplementation((_container, name) => {
        if (name === 'Sitelinks') return sitelinksContainer as unknown as SceneNode;
        if (name === '#Sitelink_2') return unusedSlot2 as unknown as SceneNode;
        return null;
      });
      mockFindTextLayerByName.mockImplementation((_container, name) => {
        if (name === '#Sitelink_1') return textLayer1 as unknown as TextNode;
        return null;
      });

      handleESnippetStructural(ctx);

      expect(mockSafeSetTextNode).toHaveBeenCalledWith(textLayer1, 'Only One Link');
      // Unused slot should be hidden
      expect(unusedSlot2.visible).toBe(false);
    });

    it('does not crash when sitelinks container is not found and #Sitelinks is true', () => {
      const ctx = createContext('ESnippet', {
        '#Sitelinks': 'true',
        '#Sitelink_1': 'Link',
      });
      mockFindFirstNodeByName.mockReturnValue(null);

      // Should not throw
      handleESnippetStructural(ctx);

      expect(mockSafeSetTextNode).not.toHaveBeenCalled();
    });
  });

  // --- forceResetBooleans ---

  describe('forceResetBooleans (via handleESnippetStructural)', () => {
    it('resets withPromo to false when #Promo is empty', () => {
      const ctx = createContext('ESnippet', {});
      const instance = ctx.container as ReturnType<typeof createESnippetInstance>;
      // Simulate withPromo boolean property that is true
      instance.componentProperties = {
        'withPromo#123:456': { value: true as unknown as string, type: 'BOOLEAN' },
      };

      handleESnippetStructural(ctx);

      expect(instance.setProperties).toHaveBeenCalledWith(
        expect.objectContaining({ 'withPromo#123:456': false }),
      );
    });

    it('does not reset withPromo when #Promo has content', () => {
      const ctx = createContext('ESnippet', { '#Promo': 'Sale!' });
      const instance = ctx.container as ReturnType<typeof createESnippetInstance>;
      instance.componentProperties = {
        'withPromo#123:456': { value: true as unknown as string, type: 'BOOLEAN' },
      };

      handleESnippetStructural(ctx);

      // setProperties may be called for other reasons, but not for withPromo=false
      const calls = instance.setProperties.mock.calls;
      const withPromoCalls = calls.filter(
        (call: [Record<string, unknown>]) =>
          call[0] && 'withPromo#123:456' in call[0] && call[0]['withPromo#123:456'] === false,
      );
      expect(withPromoCalls).toHaveLength(0);
    });

    it('hides Promo frame as fallback when setProperties throws', () => {
      const ctx = createContext('ESnippet', {});
      const instance = ctx.container as ReturnType<typeof createESnippetInstance>;
      // withPromo is true but setProperties throws (simulate Figma API failure)
      instance.componentProperties = {
        'withPromo#99:88': { value: true as unknown as string, type: 'BOOLEAN' },
      };
      instance.setProperties = vi.fn(() => {
        throw new Error('Cannot set properties on this variant');
      });

      const promoFrame = {
        id: 'promo-frame',
        name: 'Promo',
        type: 'FRAME',
        visible: true,
      };

      mockFindFirstNodeByName.mockImplementation((_container, name) => {
        if (name === 'Promo') return promoFrame as unknown as SceneNode;
        return null;
      });

      handleESnippetStructural(ctx);

      // setProperties threw, so applied=false, fallback hides the frame directly
      expect(promoFrame.visible).toBe(false);
    });

    it('does not crash when withPromo property is missing', () => {
      const ctx = createContext('ESnippet', {});
      const instance = ctx.container as ReturnType<typeof createESnippetInstance>;
      instance.componentProperties = {};

      // Should not throw
      handleESnippetStructural(ctx);
    });
  });

  // --- applyPromoSection ---

  describe('applyPromoSection (via handleESnippetStructural)', () => {
    it('sets promo label text when #Promo is present', () => {
      const ctx = createContext('ESnippet', {
        '#Promo': 'Summer Sale',
        '#PromoLabel': 'SALE',
      });

      const promoLabelLayer = {
        id: 'promo-label',
        name: '#PromoLabel',
        type: 'TEXT',
        characters: '',
      };
      mockFindTextLayerByName.mockImplementation((_container, name) => {
        if (name === '#PromoLabel') return promoLabelLayer as unknown as TextNode;
        return null;
      });

      handleESnippetStructural(ctx);

      expect(mockSafeSetTextNode).toHaveBeenCalledWith(promoLabelLayer, 'SALE');
    });

    it('uses #Promo as fallback when #PromoLabel is absent', () => {
      const ctx = createContext('ESnippet', {
        '#Promo': 'Summer Sale',
      });

      const promoLabelLayer = {
        id: 'promo-label',
        name: '#PromoLabel',
        type: 'TEXT',
        characters: '',
      };
      mockFindTextLayerByName.mockImplementation((_container, name) => {
        if (name === '#PromoLabel') return promoLabelLayer as unknown as TextNode;
        return null;
      });

      handleESnippetStructural(ctx);

      expect(mockSafeSetTextNode).toHaveBeenCalledWith(promoLabelLayer, 'Summer Sale');
    });

    it('sets promo link text when available', () => {
      const ctx = createContext('ESnippet', {
        '#Promo': 'Sale',
        '#PromoLink': 'See all deals',
      });

      const promoLabelLayer = {
        id: 'promo-label',
        name: '#PromoLabel',
        type: 'TEXT',
        characters: '',
      };
      const linkLayer = {
        id: 'promo-link',
        name: 'link',
        type: 'TEXT',
        characters: '',
      };
      mockFindTextLayerByName.mockImplementation((_container, name) => {
        if (name === '#PromoLabel') return promoLabelLayer as unknown as TextNode;
        if (name === 'link') return linkLayer as unknown as TextNode;
        return null;
      });

      handleESnippetStructural(ctx);

      expect(mockSafeSetTextNode).toHaveBeenCalledWith(linkLayer, 'See all deals');
    });

    it('does not set promo text when #Promo is empty', () => {
      const ctx = createContext('ESnippet', { '#Promo': '' });

      handleESnippetStructural(ctx);

      // safeSetTextNode should not be called for promo (may be called for sitelinks etc.)
      const promoCalls = mockSafeSetTextNode.mock.calls.filter((call) => {
        const node = call[0] as { name?: string };
        return node && node.name && node.name.includes('Promo');
      });
      expect(promoCalls).toHaveLength(0);
    });
  });

  // --- applyAddressLink ---

  describe('applyAddressLink (via handleESnippetStructural)', () => {
    it('sets address link text on #addressLink layer', () => {
      const ctx = createContext('ESnippet', {
        '#addressLink': 'Moscow, Tverskaya 12',
      });

      const addressLayer = {
        id: 'addr-1',
        name: '#addressLink',
        type: 'TEXT',
        characters: '',
      };
      mockFindTextLayerByName.mockImplementation((_container, name) => {
        if (name === '#addressLink') return addressLayer as unknown as TextNode;
        return null;
      });

      handleESnippetStructural(ctx);

      expect(mockSafeSetTextNode).toHaveBeenCalledWith(addressLayer, 'Moscow, Tverskaya 12');
    });

    it('does not set address when #addressLink is empty', () => {
      const ctx = createContext('ESnippet', { '#addressLink': '' });

      handleESnippetStructural(ctx);

      const addressCalls = mockSafeSetTextNode.mock.calls.filter((call) => {
        const node = call[0] as { name?: string };
        return node && node.name === '#addressLink';
      });
      expect(addressCalls).toHaveLength(0);
    });
  });

  // --- applyTitleMaxLines ---

  describe('applyTitleMaxLines (via handleESnippetStructural)', () => {
    it('sets maxLines=3 and textTruncation on title node', () => {
      const ctx = createContext('ESnippet', {});

      const titleNode = {
        id: 'title-1',
        name: '#OrganicTitle',
        type: 'TEXT',
        characters: 'Some title',
        maxLines: undefined as number | undefined,
        textTruncation: undefined as string | undefined,
      };
      mockFindTextLayerByName.mockImplementation((_container, name) => {
        if (name === '#OrganicTitle') return titleNode as unknown as TextNode;
        return null;
      });

      handleESnippetStructural(ctx);

      expect(titleNode.maxLines).toBe(3);
      expect(titleNode.textTruncation).toBe('ENDING');
    });

    it('does not crash when title node is not found', () => {
      const ctx = createContext('ESnippet', {});
      mockFindTextLayerByName.mockReturnValue(null);

      // Should not throw
      handleESnippetStructural(ctx);
    });
  });

  // --- applyClipsContentFix ---

  describe('applyClipsContentFix (via handleESnippetStructural)', () => {
    it('sets clipsContent to false on content__left frame', () => {
      const ctx = createContext('ESnippet', {});
      const instance = ctx.container as ReturnType<typeof createESnippetInstance>;

      const contentLeftFrame = {
        id: 'content-left',
        name: 'content__left',
        type: 'FRAME',
        removed: false,
        clipsContent: true,
      };

      instance.findOne = vi.fn((predicate: (n: { name: string }) => boolean) => {
        if (predicate({ name: 'content__left' })) {
          return contentLeftFrame;
        }
        return null;
      });

      handleESnippetStructural(ctx);

      expect(contentLeftFrame.clipsContent).toBe(false);
    });

    it('does not crash when content__left is not found', () => {
      const ctx = createContext('ESnippet', {});
      const instance = ctx.container as ReturnType<typeof createESnippetInstance>;
      instance.findOne = vi.fn(() => null);

      // Should not throw
      handleESnippetStructural(ctx);
    });

    it('does not set clipsContent when content__left is not a FRAME', () => {
      const ctx = createContext('ESnippet', {});
      const instance = ctx.container as ReturnType<typeof createESnippetInstance>;

      const contentLeftGroup = {
        id: 'content-left',
        name: 'content__left',
        type: 'GROUP',
        removed: false,
        clipsContent: true,
      };

      instance.findOne = vi.fn((predicate: (n: { name: string }) => boolean) => {
        if (predicate({ name: 'content__left' })) {
          return contentLeftGroup;
        }
        return null;
      });

      handleESnippetStructural(ctx);

      // clipsContent should NOT be changed since it's not a FRAME
      expect(contentLeftGroup.clipsContent).toBe(true);
    });
  });
});
