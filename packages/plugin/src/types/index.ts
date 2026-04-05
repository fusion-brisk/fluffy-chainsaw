/**
 * Types — реэкспорт всех типов
 */

// CSV Fields
export type { CSVFields, CSVRow, SnippetType } from './csv-fields';

export { REQUIRED_FIELDS, IMAGE_FIELDS, BOOLEAN_FIELDS, NUMERIC_FIELDS } from './csv-fields';

// Validation
export type { ValidationResult, ValidationError, ValidationWarning } from './validation';

export {
  validateRow,
  validateRows,
  hasRequiredFields,
  getMissingRequiredFields,
} from './validation';

// Feed Card types
export type {
  FeedCardRow,
  FeedCardFields,
  FeedCardType,
  FeedCardSize,
  FeedPlatform,
  FeedComponentVariant,
  VariantSelector,
  FeedMasonryConfig,
} from './feed-card-types';

export {
  FEED_REQUIRED_FIELDS,
  FEED_IMAGE_FIELDS,
  FEED_BOOLEAN_FIELDS,
  DEFAULT_MASONRY_CONFIG,
} from './feed-card-types';

// Wizard types
export type {
  WizardSpan,
  WizardFootnote,
  WizardHeading,
  WizardParagraph,
  WizardListItem,
  WizardList,
  WizardImage,
  WizardVideo,
  WizardTable,
  WizardComponent,
  WizardType,
  WizardPayload,
  WizardComponentKeys,
  MarkdownVariant,
  WizardProcessingResult,
} from './wizard-types';
