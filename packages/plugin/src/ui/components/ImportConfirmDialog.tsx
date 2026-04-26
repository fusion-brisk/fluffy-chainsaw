/**
 * ImportConfirmDialog — confirmation screen (320 × 280)
 *
 * Layout:
 *   Импорт данных                         — title, 13px semibold
 *   «query»                               — secondary, ellipsis
 *     43   сниппетов                      — summary rows, count emphasised
 *      5   фильтров
 *   Режим
 *   ◉ Новый артборд                       — native radio
 *   ○ Заполнить выделение                 — disabled if !hasSelection
 *   ─────────────────────────────────────
 *   Очистить        [Отмена] [Импорт]
 */

import React, { memo, useEffect, useState, useCallback } from 'react';
import type { ImportSummaryData } from '../../types';
import { pluralize } from '../../utils/format';

export type ImportMode = 'artboard' | 'selection' | 'breakpoints';

const LAST_MODE_KEY = 'contentify_last_import_mode';

function loadLastMode(): ImportMode {
  try {
    const stored = window.localStorage.getItem(LAST_MODE_KEY);
    if (stored === 'artboard' || stored === 'selection' || stored === 'breakpoints') {
      return stored;
    }
  } catch {
    // localStorage unavailable in some Figma sandbox contexts — fall through
  }
  return 'artboard';
}

function saveLastMode(mode: ImportMode): void {
  try {
    window.localStorage.setItem(LAST_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export interface ImportOptions {
  mode: ImportMode;
}

interface Props {
  query: string;
  itemCount: number;
  source?: string;
  summaryData?: ImportSummaryData;
  hasSelection: boolean;
  /** 'feed' when importing ya.ru rhythm feed cards */
  sourceType?: 'serp' | 'feed';
  onConfirm: (options: ImportOptions) => void;
  onCancel: () => void;
  onClearQueue?: () => void;
}

export const ImportConfirmDialog: React.FC<Props> = memo(
  ({
    query,
    itemCount,
    hasSelection,
    summaryData,
    sourceType,
    onConfirm,
    onCancel,
    onClearQueue,
  }) => {
    const isFeed = sourceType === 'feed';
    // Restore last-used mode, then validate against current availability:
    //   - feed cannot use 'breakpoints' → fall back to 'artboard'
    //   - 'selection' requires hasSelection → fall back to 'artboard'
    const [mode, setMode] = useState<ImportMode>(() => {
      const saved = loadLastMode();
      if (saved === 'breakpoints' && isFeed) return 'artboard';
      if (saved === 'selection' && !hasSelection) return 'artboard';
      return saved;
    });

    const setModeAndPersist = useCallback((next: ImportMode) => {
      setMode(next);
      saveLastMode(next);
    }, []);

    const handleConfirm = useCallback(() => {
      onConfirm({ mode });
    }, [onConfirm, mode]);

    // Keyboard shortcuts
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onCancel();
        } else if (e.key === 'Enter') {
          const active = document.activeElement;
          if (active && (active as HTMLElement).tagName === 'INPUT') return;
          handleConfirm();
        } else if (e.key === 'Tab') {
          // Focus trap: cycle through focusable elements within dialog
          const dialog = document.querySelector('.confirm-dialog');
          if (!dialog) return;
          const focusable = dialog.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])',
          );
          if (focusable.length === 0) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onCancel, handleConfirm]);

    // Build summary rows — split count and word so we can emphasise the number
    // separately in markup (count is primary data, word is just the unit).
    const summaryRows: Array<{ count: number; word: string }> = [];
    if (isFeed) {
      summaryRows.push({
        count: itemCount,
        word: `${pluralize(itemCount, 'карточка', 'карточки', 'карточек')} фида`,
      });
    } else if (summaryData) {
      if (summaryData.snippetCount > 0) {
        summaryRows.push({
          count: summaryData.snippetCount,
          word: pluralize(summaryData.snippetCount, 'сниппет', 'сниппета', 'сниппетов'),
        });
      }
      if (summaryData.wizardCount > 0) {
        summaryRows.push({
          count: summaryData.wizardCount,
          word: pluralize(summaryData.wizardCount, 'wizard', 'wizard', 'wizard'),
        });
      }
      if (summaryData.filterCount > 0) {
        summaryRows.push({
          count: summaryData.filterCount,
          word: pluralize(summaryData.filterCount, 'фильтр', 'фильтра', 'фильтров'),
        });
      }
      if (summaryData.offerCount > 0) {
        summaryRows.push({
          count: summaryData.offerCount,
          word: pluralize(summaryData.offerCount, 'оффер', 'оффера', 'офферов'),
        });
      }
    } else {
      summaryRows.push({
        count: itemCount,
        word: pluralize(itemCount, 'элемент', 'элемента', 'элементов'),
      });
    }

    return (
      <div
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-dialog-title"
      >
        {/* Content */}
        <div className="confirm-dialog__content">
          {/* Title + Query */}
          <div className="confirm-dialog__header">
            <h2 id="import-dialog-title" className="confirm-dialog__title">
              Импорт данных
            </h2>
            {query && (
              <div className="confirm-dialog__query" title={query}>
                {`\u00AB${query}\u00BB`}
              </div>
            )}
          </div>

          {/* Summary list — numeric counts emphasised */}
          <div className="confirm-dialog__summary-list">
            {summaryRows.map((row, i) => (
              <div key={i} className="confirm-dialog__summary-item">
                <span className="confirm-dialog__summary-count">{row.count}</span>
                <span className="confirm-dialog__summary-word">{row.word}</span>
              </div>
            ))}
          </div>

          {/* Mode: native radio */}
          <fieldset className="confirm-dialog__mode">
            <legend className="confirm-dialog__mode-label">Режим</legend>
            <label className="confirm-dialog__radio">
              <input
                type="radio"
                name="importMode"
                value="artboard"
                checked={mode === 'artboard'}
                onChange={() => setModeAndPersist('artboard')}
              />
              <span>Новый артборд</span>
            </label>
            <label
              className={`confirm-dialog__radio${isFeed ? ' confirm-dialog__radio--disabled' : ''}`}
              title={isFeed ? 'Недоступно для ленточного фида ya.ru' : undefined}
            >
              <input
                type="radio"
                name="importMode"
                value="breakpoints"
                checked={mode === 'breakpoints'}
                onChange={() => setModeAndPersist('breakpoints')}
                disabled={isFeed}
                aria-describedby={isFeed ? 'mode-breakpoints-hint' : undefined}
              />
              <span>Все брейкпоинты</span>
              {isFeed && (
                <span id="mode-breakpoints-hint" className="confirm-dialog__radio-hint">
                  для ya.ru фида недоступно
                </span>
              )}
            </label>
            <label
              className={`confirm-dialog__radio${!hasSelection ? ' confirm-dialog__radio--disabled' : ''}`}
              title={!hasSelection ? 'Выделите фреймы на холсте, чтобы заполнить их' : undefined}
            >
              <input
                type="radio"
                name="importMode"
                value="selection"
                checked={mode === 'selection'}
                onChange={() => setModeAndPersist('selection')}
                disabled={!hasSelection}
                aria-describedby={!hasSelection ? 'mode-selection-hint' : undefined}
              />
              <span>Заполнить выделение</span>
              {!hasSelection && (
                <span id="mode-selection-hint" className="confirm-dialog__radio-hint">
                  выделите фреймы на холсте
                </span>
              )}
            </label>
          </fieldset>
        </div>

        {/* Footer */}
        <div className="confirm-dialog__footer">
          {onClearQueue && (
            <button type="button" className="confirm-dialog__btn-danger" onClick={onClearQueue}>
              Очистить
            </button>
          )}

          <div className="confirm-dialog__footer-right">
            <button type="button" className="confirm-dialog__btn-secondary" onClick={onCancel}>
              Отмена
            </button>
            <button
              type="button"
              className="confirm-dialog__btn-primary"
              onClick={handleConfirm}
              autoFocus
            >
              Импорт
            </button>
          </div>
        </div>
      </div>
    );
  },
);

ImportConfirmDialog.displayName = 'ImportConfirmDialog';

export default ImportConfirmDialog;
