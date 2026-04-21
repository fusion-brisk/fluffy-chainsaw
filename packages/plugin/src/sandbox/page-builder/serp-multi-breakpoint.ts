/**
 * SERP at all breakpoints — рендерит одни и те же данные (rows + wizards)
 * в N SERP-страниц, по одной на каждый канонический брейкпоинт Яндекса.
 * Используется из `apply-relay-payload` когда пользователь выбрал режим
 * "Все брейкпоинты" в ImportConfirmDialog.
 *
 * Внутри — цикл `createSerpPage` с подменой frameWidth / contentLeftWidth /
 * leftPadding / platform. Готовые страницы складываются в горизонтальный
 * autolayout-wrapper, аналогичный обёртке breakpoint-skeletons, и
 * центрируются во viewport одним scrollAndZoomIntoView.
 */

import { Logger } from '../../logger';
import type { CSVRow } from '../../types';
import type { WizardPayload } from '../../types/wizard-types';
import { BREAKPOINTS } from './breakpoint-skeletons';
import { createSerpPage } from './page-creator';
import type { PageCreationResult } from './types';

export interface SerpMultiBreakpointResult {
  success: boolean;
  wrapper: FrameNode;
  /** Число страниц, попавших в обёртку (с учётом успеха loadComponent внутри). */
  pageCount: number;
  /** Суммарное количество созданных узлов по всем страницам. */
  totalCreatedElements: number;
  errors: string[];
}

interface Options {
  query?: string;
  wizards?: WizardPayload[];
}

/**
 * Создать горизонтальную обёртку, в которую лягут 5 SERP-страниц.
 */
function createMultiBreakpointWrapper(query: string): FrameNode {
  const wrapper = figma.createFrame();
  wrapper.name = 'SERP · ' + query + ' · All breakpoints';
  wrapper.layoutMode = 'HORIZONTAL';
  wrapper.primaryAxisSizingMode = 'AUTO';
  wrapper.counterAxisSizingMode = 'AUTO';
  wrapper.counterAxisAlignItems = 'MIN';
  wrapper.itemSpacing = 80;
  wrapper.paddingTop = 40;
  wrapper.paddingRight = 40;
  wrapper.paddingBottom = 40;
  wrapper.paddingLeft = 40;
  wrapper.fills = [{ type: 'SOLID', color: { r: 0.96, g: 0.96, b: 0.96 } }];
  return wrapper;
}

export async function createSerpAtAllBreakpoints(
  rows: CSVRow[],
  options: Options = {},
): Promise<SerpMultiBreakpointResult> {
  const startTime = Date.now();
  const query = options.query || rows[0]?.['#query'] || rows[0]?.['#OrganicTitle'] || 'query';
  const errors: string[] = [];

  Logger.info(
    '[MultiBreakpoint] Starting: ' + rows.length + ' rows × ' + BREAKPOINTS.length + ' breakpoints',
  );

  const wrapper = createMultiBreakpointWrapper(String(query));
  wrapper.x = figma.viewport.center.x - 2000;
  wrapper.y = figma.viewport.center.y;
  figma.currentPage.appendChild(wrapper);

  let pageCount = 0;
  let totalCreated = 0;

  for (const bp of BREAKPOINTS) {
    try {
      const result = await createSerpPage(rows, {
        query: String(query),
        platform: bp.platform,
        frameWidth: bp.frameWidth,
        contentLeftWidth: bp.leftColWidth,
        leftPadding: bp.leftPaddingX,
        frameName: String(query) + ' · ' + bp.name,
        skipViewportFocus: true,
        // Per-breakpoint GRID: ProductsTiles renders with this many columns
        // and FLEX tracks, so tiles split the content column evenly at each
        // breakpoint (instead of the historical fixed 184px tile width).
        gridCols: bp.gridCols,
        wizards: options.wizards,
      });
      if (result.frame) {
        wrapper.appendChild(result.frame);
        pageCount += 1;
        totalCreated += result.createdCount;
      }
      if (result.errors && result.errors.length > 0) {
        for (const err of result.errors) {
          errors.push('[' + bp.name + '] ' + err);
        }
      }
      Logger.verbose('[MultiBreakpoint] Built ' + bp.name);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push('[' + bp.name + '] ' + msg);
      Logger.error('[MultiBreakpoint] Failed ' + bp.name + ':', e);
    }
  }

  figma.currentPage.selection = [wrapper];
  figma.viewport.scrollAndZoomIntoView([wrapper]);

  const duration = Date.now() - startTime;
  Logger.info(
    '[MultiBreakpoint] Done: ' +
      pageCount +
      '/' +
      BREAKPOINTS.length +
      ' pages, ' +
      totalCreated +
      ' elements in ' +
      duration +
      'ms',
  );

  return {
    success: errors.length === 0 && pageCount === BREAKPOINTS.length,
    wrapper,
    pageCount,
    totalCreatedElements: totalCreated,
    errors,
  };
}

// Re-export PageCreationResult just so callers can match signature styles if needed.
export type { PageCreationResult };
