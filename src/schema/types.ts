/**
 * Schema Types — декларативное описание маппинга данных на Figma-компоненты
 */

import type { CSVRow } from '../types/csv-fields';
import type { DeepCache } from '../utils/instance-cache';

/**
 * Вычисляемый трансформ: произвольная функция от данных и контейнера.
 * Возвращает boolean или string для установки на Figma-инстанс.
 */
export type ComputedTransform = (
  row: CSVRow,
  container: InstanceNode,
  cache: DeepCache
) => boolean | string;

/**
 * Маппинг одного свойства: связывает поле(я) CSVRow с property Figma-инстанса.
 *
 * Ровно одно из полей-источников должно быть задано:
 * - hasValue — boolean: true если row[field] непустое
 * - stringValue — string: row[field] as-is
 * - equals — boolean: row[field] === value
 * - compute — произвольная функция
 */
export interface PropertyMapping {
  /** Варианты имени свойства Figma (пробуются по порядку) */
  propertyNames: string[];

  /** Имя поля для логирования */
  fieldName: string;

  /** boolean: row[field] имеет непустое значение */
  hasValue?: string;

  /** string: row[field] передаётся как есть */
  stringValue?: string;

  /** boolean: row[field] === value */
  equals?: { field: string; value: string };

  /** Произвольная вычисляемая функция */
  compute?: ComputedTransform;

  /** Не вызывать trySetProperty если результат пустая строка */
  skipIfEmpty?: boolean;
}

/**
 * Маппинг свойств на вложенный инстанс (найденный через getCachedInstance).
 */
export interface NestedInstanceMapping {
  /** Имя инстанса в DeepCache */
  instanceName: string;

  /** Свойства для установки на этом инстансе */
  properties: PropertyMapping[];
}

/**
 * Полная схема одного типа контейнера.
 */
export interface ComponentSchema {
  /** Имена контейнеров, к которым применяется эта схема */
  containerNames: string[];

  /** Свойства, устанавливаемые на самом контейнере */
  containerProperties: PropertyMapping[];

  /** Свойства на вложенных инстансах */
  nestedInstances: NestedInstanceMapping[];

  /**
   * Имена handlers из HandlerRegistry, которые эта схема заменяет.
   * При обработке контейнера из containerNames эти handlers будут пропущены.
   */
  replacesHandlers: string[];
}
