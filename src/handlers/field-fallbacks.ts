/**
 * Field Fallbacks — декларативные цепочки fallback для полей данных
 * 
 * Вместо императивного кода "если нет X, возьми Y" используем
 * декларативное описание fallback chains.
 */

import { Logger } from '../logger';
import { CSVRow } from '../types/csv-fields';

/**
 * Конфигурация fallback для одного поля
 */
export interface FieldFallbackConfig {
  /** Основное поле */
  field: string;
  /** Список fallback полей в порядке приоритета */
  fallbacks: string[];
  /** Функция трансформации значения (опционально) */
  transform?: (value: string, sourceField: string) => string;
  /** Требуется ли значение (ошибка если не найдено) */
  required?: boolean;
}

/**
 * Определения fallback chains для полей
 */
export const FIELD_FALLBACKS: FieldFallbackConfig[] = [
  // OrganicText ← OrganicTitle
  {
    field: '#OrganicText',
    fallbacks: ['#OrganicTitle'],
    required: false
  },
  
  // OrganicHost ← ShopName ← извлечение из FaviconImage
  {
    field: '#OrganicHost',
    fallbacks: ['#ShopName'],
    transform: (value, sourceField) => {
      if (sourceField === '#ShopName') {
        // ShopName обычно уже в нужном формате
        return value;
      }
      return value;
    }
  },
  
  // ShopName ← OrganicHost
  {
    field: '#ShopName',
    fallbacks: ['#OrganicHost']
  },
  
  // FaviconImage — fallback на конструирование URL из хоста
  {
    field: '#FaviconImage',
    fallbacks: ['#OrganicHost', '#ShopName'],
    transform: (value, sourceField) => {
      if (sourceField === '#OrganicHost' || sourceField === '#ShopName') {
        // Конструируем URL фавиконки из домена
        const host = value.replace(/^https?:\/\//, '').split('/')[0];
        if (host && host.includes('.')) {
          return `https://favicon.yandex.net/favicon/v2/${host}?size=32`;
        }
      }
      return value;
    }
  },
  
  // ProductRating ← ShopInfo-Ugc (если рейтинг магазина есть, а товара нет)
  {
    field: '#ProductRating',
    fallbacks: ['#ShopInfo-Ugc'],
    transform: (value) => {
      // Нормализуем формат рейтинга
      const num = parseFloat(value.replace(',', '.'));
      if (isNaN(num) || num < 0 || num > 5) return '';
      return num.toFixed(1).replace('.', ',');
    }
  },
  
  // ButtonView — дефолты по типу сниппета
  {
    field: '#ButtonView',
    fallbacks: ['#SnippetType'],
    transform: (value, sourceField) => {
      if (sourceField === '#SnippetType') {
        // Дефолты по типу сниппета
        switch (value) {
          case 'EShopItem': return 'secondary';
          case 'EOfferItem': return 'white';
          case 'EProductSnippet2': return 'primaryLong';
          default: return 'primaryLong';
        }
      }
      return value;
    }
  }
];

/**
 * Создаёт Map для быстрого поиска fallback конфигурации
 */
function createFallbackMap(): Map<string, FieldFallbackConfig> {
  const map = new Map<string, FieldFallbackConfig>();
  for (const config of FIELD_FALLBACKS) {
    map.set(config.field, config);
  }
  return map;
}

const fallbackMap = createFallbackMap();

/**
 * Применяет fallback chains к строке данных
 * Модифицирует row in-place
 */
export function applyFieldFallbacks(row: CSVRow): void {
  if (!row) return;

  for (const config of FIELD_FALLBACKS) {
    const currentValue = (row[config.field] || '').trim();
    
    // Если значение уже есть — пропускаем
    if (currentValue) continue;
    
    // Пробуем fallback'и
    for (const fallbackField of config.fallbacks) {
      const fallbackValue = (row[fallbackField] || '').trim();
      
      if (fallbackValue) {
        // Применяем трансформацию если есть
        const finalValue = config.transform 
          ? config.transform(fallbackValue, fallbackField)
          : fallbackValue;
        
        if (finalValue) {
          row[config.field] = finalValue;
          Logger.debug(`   🔄 [Fallback] ${config.field} ← ${fallbackField}: "${finalValue.substring(0, 30)}..."`);
          break;
        }
      }
    }
    
    // Проверяем required
    if (config.required && !row[config.field]) {
      Logger.warn(`   ⚠️ [Fallback] Required field ${config.field} not found`);
    }
  }
}

/**
 * Получить конфигурацию fallback для поля
 */
export function getFallbackConfig(field: string): FieldFallbackConfig | undefined {
  return fallbackMap.get(field);
}

/**
 * Проверить, есть ли fallback для поля
 */
export function hasFallback(field: string): boolean {
  return fallbackMap.has(field);
}

/**
 * Получить значение с учётом fallback chains
 */
export function getValueWithFallback(
  row: CSVRow,
  field: string
): string {
  const value = (row[field] || '').trim();
  if (value) return value;
  
  const config = fallbackMap.get(field);
  if (!config) return '';
  
  for (const fallbackField of config.fallbacks) {
    const fallbackValue = (row[fallbackField] || '').trim();
    if (fallbackValue) {
      return config.transform 
        ? config.transform(fallbackValue, fallbackField)
        : fallbackValue;
    }
  }
  
  return '';
}

