/**
 * Fill Utilities — применение заливок (переменные и стили) из библиотеки DC • ECOM
 */

import { Logger } from '../../logger';
import { VARIABLE_KEYS, PAINT_STYLE_KEYS } from './component-map';

/**
 * Применить переменную заливки из библиотеки к узлу
 * @param node - узел с поддержкой fills (Frame и т.д.)
 * @param variableKey - ключ переменной из VARIABLE_KEYS
 * @returns true если переменная успешно применена
 */
export async function applyFillVariable(
  node: SceneNode & { fills?: readonly Paint[] | typeof figma.mixed },
  variableKey: string
): Promise<boolean> {
  if (!variableKey) {
    Logger.debug('[PageCreator] Пустой ключ переменной');
    return false;
  }

  try {
    // Импортируем переменную из библиотеки
    const variable = await figma.variables.importVariableByKeyAsync(variableKey);

    if (!variable) {
      Logger.warn(`[PageCreator] Переменная не найдена (key=${variableKey})`);
      return false;
    }

    // Создаём базовый solid paint
    const basePaint: SolidPaint = {
      type: 'SOLID',
      color: { r: 1, g: 1, b: 1 }, // Белый как fallback
    };

    // Привязываем переменную к цвету
    const boundPaint = figma.variables.setBoundVariableForPaint(basePaint, 'color', variable);

    // Применяем к узлу
    (node as FrameNode).fills = [boundPaint];

    Logger.debug(`[PageCreator] Применена переменная заливки: ${variable.name}`);
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    Logger.warn(`[PageCreator] Не удалось применить переменную заливки (key=${variableKey}): ${msg}`);
  }
  return false;
}

/**
 * Применить стиль заливки из библиотеки к узлу
 * @param node - узел с поддержкой fills (Frame, Instance и т.д.)
 * @param styleKey - ключ стиля из PAINT_STYLE_KEYS
 * @returns true если стиль успешно применён
 *
 * @deprecated Используйте applyFillVariable для более надёжной привязки
 */
export async function applyFillStyle(
  node: SceneNode & { fillStyleId?: string | typeof figma.mixed },
  styleKey: string
): Promise<boolean> {
  try {
    const style = await figma.importStyleByKeyAsync(styleKey);
    if (style && style.type === 'PAINT') {
      await (node as FrameNode).setFillStyleIdAsync(style.id);
      Logger.debug(`[PageCreator] Применён стиль заливки: ${style.name}`);
      return true;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    Logger.warn(`[PageCreator] Не удалось применить стиль заливки (key=${styleKey}): ${msg}`);
  }
  return false;
}

/**
 * Применить заливку к узлу (переменная или стиль как fallback)
 * Сначала пытается применить переменную, если ключ задан.
 * Если переменная не настроена или не удалось — пробует стиль.
 *
 * @param node - узел с поддержкой fills
 * @param colorName - имя цвета из VARIABLE_KEYS / PAINT_STYLE_KEYS (например, 'Background/Primary')
 * @returns true если заливка успешно применена
 */
export async function applyFill(
  node: SceneNode & { fills?: readonly Paint[] | typeof figma.mixed; fillStyleId?: string | typeof figma.mixed },
  colorName: keyof typeof VARIABLE_KEYS
): Promise<boolean> {
  // 1. Сначала пробуем переменную
  const variableKey = VARIABLE_KEYS[colorName];
  if (variableKey) {
    const applied = await applyFillVariable(node, variableKey);
    if (applied) return true;
  }

  // 2. Fallback на стиль
  const styleKey = (PAINT_STYLE_KEYS as Record<string, string>)[colorName];
  if (styleKey) {
    return applyFillStyle(node, styleKey);
  }

  Logger.warn(`[PageCreator] Нет ключа для цвета: ${colorName}`);
  return false;
}
