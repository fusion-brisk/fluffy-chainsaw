/**
 * Page Builder Module
 * 
 * Модуль для создания страниц Figma из HTML
 * 
 * @example
 * ```typescript
 * import { createPageFromHTML } from './page-builder';
 * 
 * const html = await fetchHTMLFromFile();
 * const result = await createPageFromHTML(html, {
 *   width: 1280,
 *   platform: 'desktop',
 * });
 * 
 * console.log(`Created ${result.createdCount} elements`);
 * ```
 */

// Types
export * from './types';

// Component mapping
export { 
  SNIPPET_COMPONENT_MAP,
  GROUP_COMPONENT_MAP,
  LAYOUT_COMPONENT_MAP,
  CONTAINER_CONFIG_MAP,
  getComponentConfig,
  getContainerConfig,
  getContainerTypeForSnippet,
  isGroupType,
  isSnippetType,
  isLayoutType,
  isContainerType,
  CSS_CLASS_TO_SNIPPET_TYPE,
  CSS_CLASS_TO_GROUP_TYPE,
  CSS_CLASS_TO_CONTAINER_TYPE,
} from './component-map';

// Structure parsing (old API)
export {
  parsePageStructure,
  groupSequentialElements,
  resetElementIdCounter,
  detectPlatformFromHtml,
} from './structure-parser';

// Structure parsing (new API with serpItemId grouping)
export {
  groupSnippetsBySerpItem,
  buildSerpStructure,
  parseSerpPage,
} from './structure-parser';

// Structure building (new)
export {
  buildPageStructure,
  sortContentNodes,
  detectSnippetType,
  resetNodeIdCounter,
} from './structure-builder';

// Page creation
export {
  createPageFromStructure,
  createPageFromRows,
  createSerpPage,
  validateComponentKeys,
  clearComponentCache,
} from './page-creator';

