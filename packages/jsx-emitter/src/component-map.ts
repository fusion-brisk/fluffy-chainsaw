import type { ComponentMapping } from './types';

/**
 * Mapping: Figma component name -> React component.
 *
 * Key is `mainComponent.name` or `componentSet.name` from Figma.
 * resolveComponent() tries exact match, then prefix match for variants.
 */
export const COMPONENT_MAP: Record<string, ComponentMapping> = {
  LabelGroup: {
    importPath: '@oceania/depot/components/LabelGroup',
    componentName: 'LabelGroup',
    propMap: {},
  },
  ELabelRating: {
    importPath: '@oceania/depot/components/ELabelRating',
    componentName: 'ELabelRating',
    propMap: {
      size: 'size',
      view: 'view',
      value: 'value',
    },
  },
  EPriceBarometer: {
    importPath: '@oceania/depot/components/EPriceBarometer',
    componentName: 'EPriceBarometer',
    propMap: {},
  },
  EDeliveryGroup: {
    importPath: '@oceania/depot/components/EDeliveryGroup',
    componentName: 'EDeliveryGroup',
    propMap: {},
  },
  Line: {
    importPath: '@oceania/depot/components/Line',
    componentName: 'Line',
    propMap: {
      weight: 'weight',
    },
  },
  EQuote: {
    importPath: '@oceania/depot/components/EQuote',
    componentName: 'EQuote',
    propMap: {},
  },
  EProductSnippet2: {
    importPath: '@oceania/depot/components/EProductSnippet2',
    componentName: 'EProductSnippet2',
    propMap: {
      type: 'type',
      selected: 'selected',
    },
    ignoredProps: ['Platform'],
  },
  // --- Inferred (not yet verified via Code Connect) ---
  ESnippet: {
    importPath: '@oceania/depot/components/ESnippet',
    componentName: 'ESnippet',
    propMap: {
      platform: 'platform',
      image: 'image',
    },
    ignoredProps: ['Platform'],
  },
  EOfferItem: {
    importPath: '@oceania/depot/components/EOfferItem',
    componentName: 'EOfferItem',
    propMap: {
      platform: 'platform',
      type: 'type',
    },
    ignoredProps: ['Platform'],
  },
  EShopItem: {
    importPath: '@oceania/depot/components/EShopItem',
    componentName: 'EShopItem',
    propMap: {
      platform: 'platform',
    },
    ignoredProps: ['Platform'],
  },
  EPrice: {
    importPath: '@oceania/depot/components/EPrice',
    componentName: 'EPrice',
    propMap: {
      size: 'size',
      view: 'view',
      weight: 'weight',
      value: 'value',
    },
  },
  EPriceGroup: {
    importPath: '@oceania/depot/components/EPriceGroup',
    componentName: 'EPriceGroup',
    propMap: {
      size: 'size',
    },
  },
  EShopName: {
    importPath: '@oceania/depot/components/EShopName',
    componentName: 'EShopName',
    propMap: {
      size: 'size',
      weight: 'weight',
      name: 'name',
    },
  },
  EButton: {
    importPath: '@oceania/depot/components/EButton',
    componentName: 'EButton',
    propMap: {
      size: 'size',
      view: 'view',
    },
  },
  EThumb: {
    importPath: '@oceania/depot/components/EThumb',
    componentName: 'EThumb',
    propMap: {
      Ratio: 'ratio',
      Type: 'type',
    },
  },
  Title: {
    importPath: '@oceania/depot/components/Title',
    componentName: 'Title',
    propMap: {
      Size: 'size',
    },
  },
};

/**
 * Resolve Figma component name to mapping.
 * Tries exact match first, then progressively shorter prefix matches.
 */
export function resolveComponent(figmaName: string): ComponentMapping | undefined {
  // Exact match
  if (COMPONENT_MAP[figmaName]) return COMPONENT_MAP[figmaName];

  // Prefix: "ESnippet/Desktop/WithButton" -> "ESnippet/Desktop" -> "ESnippet"
  const parts = figmaName.split('/');
  while (parts.length > 1) {
    parts.pop();
    const prefix = parts.join('/');
    if (COMPONENT_MAP[prefix]) return COMPONENT_MAP[prefix];
  }

  // Try first segment only (handles "ESnippet, variant=..." naming)
  const commaIdx = figmaName.indexOf(',');
  if (commaIdx > 0) {
    const base = figmaName.slice(0, commaIdx).trim();
    if (COMPONENT_MAP[base]) return COMPONENT_MAP[base];
  }

  return undefined;
}
