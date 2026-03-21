/**
 * Validation — валидация и нормализация данных CSVRow
 */

import { Logger } from '../logger';
import { 
  CSVRow, 
  CSVFields, 
  SnippetType, 
  REQUIRED_FIELDS, 
  BOOLEAN_FIELDS, 
  NUMERIC_FIELDS,
  IMAGE_FIELDS
} from './csv-fields';

/**
 * Результат валидации
 */
export interface ValidationResult {
  /** Валидна ли строка */
  valid: boolean;
  /** Список ошибок */
  errors: ValidationError[];
  /** Список предупреждений */
  warnings: ValidationWarning[];
  /** Нормализованная строка */
  normalizedRow: CSVRow;
}

/**
 * Ошибка валидации
 */
export interface ValidationError {
  field: string;
  message: string;
  severity: 'error';
}

/**
 * Предупреждение валидации
 */
export interface ValidationWarning {
  field: string;
  message: string;
  severity: 'warning';
}

/**
 * Нормализует булево значение
 */
function normalizeBoolean(value: string | undefined): 'true' | 'false' | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  
  const v = String(value).toLowerCase().trim();
  if (v === 'true' || v === '1' || v === 'yes') return 'true';
  if (v === 'false' || v === '0' || v === 'no') return 'false';
  
  return undefined;
}

/**
 * Нормализует числовое значение (рейтинг)
 */
function normalizeRating(value: string | undefined): string | undefined {
  if (!value) return undefined;
  
  const num = parseFloat(String(value).replace(',', '.'));
  if (isNaN(num)) return undefined;
  if (num < 0 || num > 5) return undefined;
  
  return num.toFixed(1).replace('.', ',');
}

/**
 * Нормализует цену
 */
function normalizePrice(value: string | undefined): string | undefined {
  if (!value) return undefined;
  
  // Извлекаем только цифры и форматируем с пробелами
  const digits = String(value).replace(/[^\d]/g, '');
  if (!digits) return undefined;
  
  // Форматирование: 1234567 → 1 234 567
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * Нормализует процент скидки
 */
function normalizePercent(value: string | undefined): string | undefined {
  if (!value) return undefined;
  
  const digits = String(value).replace(/[^\d]/g, '');
  if (!digits) return undefined;
  
  const num = parseInt(digits, 10);
  if (isNaN(num) || num <= 0 || num > 100) return undefined;
  
  return `–${num}%`;
}

/**
 * Проверяет валидность URL изображения
 */
function isValidImageUrl(url: string | undefined): boolean {
  if (!url) return false;
  
  const s = String(url).trim();
  if (!s) return false;
  
  // Базовая проверка на URL
  return s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:');
}

/**
 * Валидация и нормализация одной строки данных
 */
export function validateRow(row: CSVRow): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const normalizedRow: CSVRow = { ...row };
  
  // 1. Определяем тип сниппета
  const snippetType = row['#SnippetType'] as SnippetType | undefined;
  
  if (!snippetType) {
    errors.push({
      field: '#SnippetType',
      message: 'Отсутствует тип сниппета',
      severity: 'error'
    });
  }
  
  // 2. Проверяем обязательные поля для типа
  if (snippetType && REQUIRED_FIELDS[snippetType]) {
    for (const field of REQUIRED_FIELDS[snippetType]) {
      const value = row[field];
      if (!value || String(value).trim() === '') {
        warnings.push({
          field: field as string,
          message: `Отсутствует обязательное поле для ${snippetType}`,
          severity: 'warning'
        });
      }
    }
  }
  
  // 3. Нормализуем булевы поля
  for (const field of BOOLEAN_FIELDS) {
    const value = row[field];
    if (value !== undefined) {
      const normalized = normalizeBoolean(value);
      if (normalized !== undefined) {
        (normalizedRow as Record<string, string>)[field] = normalized;
      } else {
        warnings.push({
          field: field as string,
          message: `Невалидное булево значение: "${value}"`,
          severity: 'warning'
        });
      }
    }
  }
  
  // 4. Нормализуем числовые поля
  for (const field of NUMERIC_FIELDS) {
    const value = row[field];
    if (value !== undefined && field === '#ProductRating') {
      const normalized = normalizeRating(value);
      if (normalized) {
        (normalizedRow as Record<string, string>)[field] = normalized;
      }
    }
    if (value !== undefined && field === '#DiscountPercent') {
      const normalized = normalizePercent(value);
      if (normalized) {
        normalizedRow['#discount'] = normalized;
      }
    }
  }
  
  // 5. Проверяем URL изображений
  for (const field of IMAGE_FIELDS) {
    const value = row[field];
    if (value && !isValidImageUrl(value)) {
      warnings.push({
        field: field as string,
        message: `Невалидный URL изображения: "${String(value).substring(0, 50)}..."`,
        severity: 'warning'
      });
    }
  }
  
  // 6. Нормализуем цену
  const price = row['#OrganicPrice'];
  if (price) {
    const normalized = normalizePrice(price);
    if (normalized) {
      normalizedRow['#OrganicPrice'] = normalized;
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    normalizedRow
  };
}

/**
 * Валидация массива строк
 */
export function validateRows(rows: CSVRow[]): {
  validRows: CSVRow[];
  invalidRows: { row: CSVRow; result: ValidationResult }[];
  totalErrors: number;
  totalWarnings: number;
} {
  const validRows: CSVRow[] = [];
  const invalidRows: { row: CSVRow; result: ValidationResult }[] = [];
  let totalErrors = 0;
  let totalWarnings = 0;
  
  for (const row of rows) {
    const result = validateRow(row);
    totalErrors += result.errors.length;
    totalWarnings += result.warnings.length;
    
    if (result.valid) {
      validRows.push(result.normalizedRow);
    } else {
      invalidRows.push({ row, result });
    }
  }
  
  if (invalidRows.length > 0) {
    Logger.warn(`⚠️ [Validation] ${invalidRows.length} строк с ошибками, ${totalWarnings} предупреждений`);
  }
  
  return { validRows, invalidRows, totalErrors, totalWarnings };
}

/**
 * Быстрая проверка наличия обязательных полей
 */
export function hasRequiredFields(row: CSVRow, snippetType: SnippetType): boolean {
  const required = REQUIRED_FIELDS[snippetType];
  if (!required) return true;
  
  for (const field of required) {
    const value = row[field];
    if (!value || String(value).trim() === '') {
      return false;
    }
  }
  
  return true;
}

/**
 * Получить список отсутствующих обязательных полей
 */
export function getMissingRequiredFields(row: CSVRow, snippetType: SnippetType): (keyof CSVFields)[] {
  const required = REQUIRED_FIELDS[snippetType];
  if (!required) return [];
  
  const missing: (keyof CSVFields)[] = [];
  
  for (const field of required) {
    const value = row[field];
    if (!value || String(value).trim() === '') {
      missing.push(field);
    }
  }
  
  return missing;
}

