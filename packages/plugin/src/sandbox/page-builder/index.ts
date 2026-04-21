/**
 * Page Builder Module
 *
 * Модуль для создания SERP-страниц Figma из данных relay
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

// Structure parsing (serpItemId grouping)
export { groupSnippetsBySerpItem, buildSerpStructure } from './structure-parser';

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
  handleSlotPostProcess,
} from './page-creator';

// Breakpoint skeletons (principle layouts for each SERP breakpoint)
export { createBreakpointSkeletons, BREAKPOINTS } from './breakpoint-skeletons';
export type {
  BreakpointName,
  BreakpointSpec,
  BreakpointSkeletonsResult,
} from './breakpoint-skeletons';
