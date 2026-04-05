/**
 * Парсит синтаксис "PropertyName=value"
 * @returns { propName, propValue } или null если формат невалидный
 */
export function parseVariantSyntax(value: string): { propName: string; propValue: string } | null {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  const match = trimmed.match(/^([^=]+?)\s*=\s*(.+)$/);

  if (!match || match.length < 3) {
    return null;
  }

  const propName = match[1].trim();
  const propValue = match[2].trim();

  if (!propName || !propValue) {
    return null;
  }

  return { propName, propValue };
}

export type PropertyCategory =
  | 'VARIANT_WITH_OPTIONS'
  | 'VARIANT_NO_OPTIONS'
  | 'BOOLEAN'
  | 'UNKNOWN';

/**
 * Определяет категорию свойства компонента
 */
export function detectPropertyType(property: unknown): PropertyCategory {
  if (!property || typeof property !== 'object') {
    return 'UNKNOWN';
  }

  const prop = property as Record<string, unknown>;
  const propType = prop.type;
  const hasOptions = 'options' in prop && Array.isArray(prop.options) && prop.options.length > 0;

  if (hasOptions) {
    return 'VARIANT_WITH_OPTIONS';
  }

  if (propType === 'VARIANT') {
    return 'VARIANT_NO_OPTIONS';
  }

  if ('value' in prop && typeof prop.value === 'boolean') {
    return 'BOOLEAN';
  }

  return 'UNKNOWN';
}

/**
 * Нормализует значение для VARIANT свойства.
 * Ищет совпадение в options с учётом регистра и boolean-значений.
 *
 * @returns Нормализованное значение из options или null если не найдено
 */
export function normalizeVariantValue(
  targetValue: string,
  options: readonly string[],
): string | null {
  const targetLower = targetValue.toLowerCase();

  // 1. Точное совпадение
  for (const option of options) {
    if (option === targetValue) {
      return option;
    }
  }

  // 2. Без учёта регистра
  for (const option of options) {
    if (option.toLowerCase() === targetLower) {
      return option;
    }
  }

  // 3. Boolean-значения (true/false как строки)
  if (targetLower === 'true' || targetLower === 'false') {
    for (const option of options) {
      const optLower = option.toLowerCase();
      if (
        optLower === targetLower ||
        (targetLower === 'true' && optLower === '1') ||
        (targetLower === 'false' && optLower === '0')
      ) {
        return option;
      }
    }
  }

  return null;
}
