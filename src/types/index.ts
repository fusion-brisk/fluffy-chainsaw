/**
 * Types — реэкспорт всех типов
 */

// CSV Fields
export type { 
  CSVFields, 
  CSVRow, 
  StrictCSVRow, 
  SnippetType 
} from './csv-fields';

export { 
  REQUIRED_FIELDS, 
  IMAGE_FIELDS, 
  BOOLEAN_FIELDS, 
  NUMERIC_FIELDS 
} from './csv-fields';

// Field Mapping
export type { 
  FieldMappingType, 
  FieldMappingConfig, 
  ComponentMappingGroup 
} from './field-mapping';

export { 
  FIELD_MAPPINGS, 
  getMappingForComponent, 
  getMappingsForField, 
  getAllDataFields 
} from './field-mapping';

// Validation
export type { 
  ValidationResult, 
  ValidationError, 
  ValidationWarning 
} from './validation';

export { 
  validateRow, 
  validateRows, 
  hasRequiredFields, 
  getMissingRequiredFields 
} from './validation';

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
  WizardProcessingResult
} from './wizard-types';
