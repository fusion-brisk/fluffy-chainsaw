/**
 * Formatting utilities for UI text
 */

import type { CSVRow } from '../types/csv-fields';
import type { ImportSummaryData } from '../types';

/**
 * Russian pluralization helper.
 * pluralize(5, 'сниппет', 'сниппета', 'сниппетов') → 'сниппетов'
 */
export function pluralize(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n);
  const lastTwo = abs % 100;
  const lastOne = abs % 10;
  if (lastTwo >= 11 && lastTwo <= 19) return many;
  if (lastOne === 1) return one;
  if (lastOne >= 2 && lastOne <= 4) return few;
  return many;
}

/**
 * Format item count with proper Russian word form for "товар"
 */
export function formatItemWord(count: number): string {
  return pluralize(count, 'товар', 'товара', 'товаров');
}

/**
 * Build a rich human-readable import summary from relay payload data.
 *
 * Examples:
 *   "42 сниппета, боковые фильтры (5 разделов), сайдбар (8 офферов)"
 *   "12 сниппетов + 1 wizard"
 *   "38 сниппетов, сайдбар (3 оффера)"
 */
export function buildImportSummary(opts: {
  rows: CSVRow[];
  wizardCount: number;
  payload?: {
    productCard?: { offers?: unknown[]; defaultOffer?: unknown } | null;
    rawRows?: CSVRow[];
  } | null;
}): string {
  const { rows, wizardCount, payload } = opts;

  const parts: string[] = [];

  // Snippet count with type breakdown
  const snippetCount = rows.length;
  if (snippetCount > 0) {
    // Count by type
    const typeCounts: Record<string, number> = {};
    let filterSections = 0;
    for (const row of rows) {
      const t = row['#SnippetType'] || 'unknown';
      if (t === 'EAsideFilters') {
        // Count filter sections from JSON data
        try {
          const jsonStr = row['#AsideFilters_data'];
          if (jsonStr) {
            const parsed = JSON.parse(jsonStr);
            filterSections = parsed.filters?.length || 0;
          }
        } catch { /* ignore */ }
        continue;
      }
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    }

    const actualSnippets = Object.values(typeCounts).reduce((a, b) => a + b, 0);
    if (actualSnippets > 0) {
      parts.push(actualSnippets + ' ' + pluralize(actualSnippets, 'сниппет', 'сниппета', 'сниппетов'));
    }

    if (filterSections > 0) {
      parts.push('фильтры (' + filterSections + ' ' + pluralize(filterSections, 'раздел', 'раздела', 'разделов') + ')');
    }
  }

  if (wizardCount > 0) {
    parts.push(wizardCount + ' ' + pluralize(wizardCount, 'wizard', 'wizard', 'wizard'));
  }

  // ProductCard sidebar
  if (payload?.productCard) {
    const pc = payload.productCard;
    const offerCount = (Array.isArray(pc.offers) ? pc.offers.length : 0)
      + (pc.defaultOffer ? 1 : 0);
    if (offerCount > 0) {
      parts.push('сайдбар (' + offerCount + ' ' + pluralize(offerCount, 'оффер', 'оффера', 'офферов') + ')');
    } else {
      parts.push('сайдбар');
    }
  }

  return parts.join(', ') || (snippetCount + ' ' + pluralize(snippetCount, 'элемент', 'элемента', 'элементов'));
}

/**
 * Build structured per-entity counts for the confirm dialog.
 * Same data source as buildImportSummary, but returns numbers instead of a string.
 */
export function buildImportSummaryData(opts: {
  rows: CSVRow[];
  wizardCount: number;
  payload?: {
    productCard?: { offers?: unknown[]; defaultOffer?: unknown } | null;
  } | null;
}): ImportSummaryData {
  const { rows, wizardCount, payload } = opts;

  let snippetCount = 0;
  let filterCount = 0;

  for (const row of rows) {
    const t = row['#SnippetType'] || 'unknown';
    if (t === 'EAsideFilters') {
      try {
        const jsonStr = row['#AsideFilters_data'];
        if (jsonStr) {
          const parsed = JSON.parse(jsonStr);
          filterCount = parsed.filters?.length || 0;
        }
      } catch { /* ignore */ }
    } else {
      snippetCount++;
    }
  }

  let offerCount = 0;
  if (payload?.productCard) {
    const pc = payload.productCard;
    offerCount = (Array.isArray(pc.offers) ? pc.offers.length : 0)
      + (pc.defaultOffer ? 1 : 0);
  }

  return { snippetCount, wizardCount, filterCount, offerCount };
}

/**
 * Detect if the user is on macOS
 */
export function isMac(): boolean {
  if (typeof navigator !== 'undefined') {
    return navigator.platform.toLowerCase().includes('mac');
  }
  return false;
}

/**
 * Get platform-specific paste shortcut
 */
export function getPasteShortcut(): string {
  return isMac() ? '⌘V' : 'Ctrl+V';
}
