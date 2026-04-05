/**
 * Structure Parser — группировка сниппетов по serpItemId
 *
 * Используется relay-путём: rows → groupSnippetsBySerpItem → buildSerpStructure
 */

import { CSVRow } from '../../types';
import { Logger } from '../../logger';
import { SnippetType, StructureNode, SerpPageStructure, ContainerType } from './types';
import { isContainerType } from './component-map';

// ============================================================================
// Группировка по serpItemId и containerType
// ============================================================================

/**
 * Группировка сниппетов из одного serp-item (data-cid)
 */
interface SerpItemGroup {
  serpItemId: string;
  containerType: ContainerType | null;
  snippets: CSVRow[];
  order: number; // Порядок первого сниппета в этой группе
}

/**
 * Группировать сниппеты по #serpItemId
 *
 * Сниппеты с одинаковым serpItemId объединяются в одну группу.
 * Порядок групп определяется порядком появления первого сниппета.
 */
export function groupSnippetsBySerpItem(rows: CSVRow[]): SerpItemGroup[] {
  const groupMap = new Map<string, SerpItemGroup>();
  const orderMap = new Map<string, number>();

  rows.forEach((row, index) => {
    const serpItemId = row['#serpItemId'] || '';
    const containerType = row['#containerType'] as ContainerType | undefined;

    // Если нет serpItemId — каждый сниппет отдельная "группа"
    const groupKey = serpItemId || `standalone-${index}`;

    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, {
        serpItemId: serpItemId,
        containerType: containerType && isContainerType(containerType) ? containerType : null,
        snippets: [],
        order: orderMap.size,
      });
      orderMap.set(groupKey, index);
    }

    groupMap.get(groupKey)!.snippets.push(row);
  });

  // Сортируем по порядку появления
  const groups = Array.from(groupMap.values());
  groups.sort((a, b) => a.order - b.order);

  Logger.info(`[Structure] Сгруппировано ${rows.length} сниппетов в ${groups.length} групп`);

  return groups;
}

/**
 * Преобразовать группы сниппетов в структуру для Page Builder
 */
export function buildSerpStructure(
  rows: CSVRow[],
  platform: 'desktop' | 'touch' = 'desktop',
): SerpPageStructure {
  const groups = groupSnippetsBySerpItem(rows);
  const contentLeft: StructureNode[] = [];
  let nodeIdCounter = 0;

  const byType: Record<string, number> = {};
  let totalSnippets = 0;
  let containersCount = 0;

  for (const group of groups) {
    if (group.snippets.length === 1 && !group.containerType) {
      // Одиночный сниппет без контейнера
      const row = group.snippets[0];
      const snippetType = (row['#SnippetType'] as SnippetType) || 'Organic';

      contentLeft.push({
        id: `sn-${++nodeIdCounter}`,
        type: snippetType,
        data: row,
        order: contentLeft.length,
      });

      byType[snippetType] = (byType[snippetType] || 0) + 1;
      totalSnippets++;
    } else if (group.containerType) {
      // Группа с контейнером
      const children: StructureNode[] = group.snippets.map((row, idx) => {
        const snippetType = (row['#SnippetType'] as SnippetType) || 'Organic';
        byType[snippetType] = (byType[snippetType] || 0) + 1;
        totalSnippets++;

        return {
          id: `sn-${++nodeIdCounter}`,
          type: snippetType,
          data: row,
          order: idx,
        };
      });

      contentLeft.push({
        id: `ct-${++nodeIdCounter}`,
        type: group.containerType,
        children,
        order: contentLeft.length,
      });

      containersCount++;
    } else {
      // Несколько сниппетов без контейнера — добавляем по одному
      for (const row of group.snippets) {
        const snippetType = (row['#SnippetType'] as SnippetType) || 'Organic';

        contentLeft.push({
          id: `sn-${++nodeIdCounter}`,
          type: snippetType,
          data: row,
          order: contentLeft.length,
        });

        byType[snippetType] = (byType[snippetType] || 0) + 1;
        totalSnippets++;
      }
    }
  }

  // Извлекаем query из первой строки
  const query = rows.length > 0 ? rows[0]['#query'] || '' : '';

  Logger.info(`[Structure] Структура: ${totalSnippets} сниппетов, ${containersCount} контейнеров`);
  Logger.debug(`[Structure] По типам:`, byType);

  return {
    meta: {
      query,
      platform,
      totalResults: totalSnippets,
      source: 'yandex-serp',
    },
    contentLeft,
    contentAside: [],
    contentRight: [],
    stats: {
      totalSnippets,
      byType,
      containers: containersCount,
    },
  };
}
