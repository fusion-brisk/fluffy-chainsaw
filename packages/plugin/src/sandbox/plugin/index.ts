/**
 * Plugin modules — реэкспорт всех модулей
 */

// Types
export type {
  CSVRow,
  ContainerGroup,
  ContainerRowAssignment,
  ContainerCollectionResult,
  RowMappingResult,
  ProgressCallback,
  MessageType,
  PluginMessage
} from './types';

// Global handlers
export {
  resetAllSnippets,
  applyGlobalQuery
} from './global-handlers';

// Message router
export {
  handleSimpleMessage
} from './message-router';

// Data assignment
export {
  groupContainersWithDataLayers,
  assignRowsToContainers,
  createLayerData,
  prepareContainersForProcessing
} from './data-assignment';

// Wizard processor
export {
  renderWizards,
  renderWizardPayload
} from './wizard-processor';

