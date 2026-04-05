/**
 * ImportConfirmDialog — confirmation screen (320 × 220)
 *
 * Layout:
 *   Импорт данных                         — title, 13px semibold
 *   «query»                               — secondary, ellipsis
 *   43 сниппета · 5 фильтров              — summary, secondary
 *   Режим
 *   ◉ Новый артборд                       — native radio
 *   ○ Заполнить выделение                 — disabled if !hasSelection
 *   ─────────────────────────────────────
 *   Очистить        [Отмена] [Импортировать]
 */

import React, { memo, useEffect, useState, useCallback } from 'react';
import type { ImportSummaryData } from '../../types';
import { pluralize } from '../../utils/format';

export type ImportMode = 'artboard' | 'selection';

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
    const [mode, setMode] = useState<ImportMode>('artboard');

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

    // Build summary lines from structured data
    const summaryLines: string[] = [];
    if (isFeed) {
      summaryLines.push(
        `${itemCount} ${pluralize(itemCount, 'карточка', 'карточки', 'карточек')} фида`,
      );
    } else if (summaryData) {
      if (summaryData.snippetCount > 0) {
        summaryLines.push(
          `${summaryData.snippetCount} ${pluralize(summaryData.snippetCount, 'сниппет', 'сниппета', 'сниппетов')}`,
        );
      }
      if (summaryData.wizardCount > 0) {
        summaryLines.push(
          `${summaryData.wizardCount} ${pluralize(summaryData.wizardCount, 'wizard', 'wizard', 'wizard')}`,
        );
      }
      if (summaryData.filterCount > 0) {
        summaryLines.push(
          `${summaryData.filterCount} ${pluralize(summaryData.filterCount, 'фильтр', 'фильтра', 'фильтров')}`,
        );
      }
      if (summaryData.offerCount > 0) {
        summaryLines.push(
          `${summaryData.offerCount} ${pluralize(summaryData.offerCount, 'оффер', 'оффера', 'офферов')}`,
        );
      }
    } else {
      const word = pluralize(itemCount, 'элемент', 'элемента', 'элементов');
      summaryLines.push(`${itemCount} ${word}`);
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

          {/* Summary list */}
          <div className="confirm-dialog__summary-list">
            {summaryLines.map((line, i) => (
              <div key={i} className="confirm-dialog__summary-item">
                {line}
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
                onChange={() => setMode('artboard')}
              />
              <span>Новый артборд</span>
            </label>
            <label className="confirm-dialog__radio">
              <input
                type="radio"
                name="importMode"
                value="selection"
                checked={mode === 'selection'}
                onChange={() => setMode('selection')}
                disabled={!hasSelection}
              />
              <span>Заполнить выделение</span>
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
