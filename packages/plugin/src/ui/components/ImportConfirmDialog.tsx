/**
 * ImportConfirmDialog — compact confirmation screen (320 x 220)
 *
 * Layout:
 *   «query»                              — semibold, ellipsis
 *   summary line                         — secondary, ellipsis
 *   [Артборд | Выделение]  ☑ Скриншоты  — segmented + checkbox
 *   ─────────────────────────────────────
 *   Очистить        [Отмена] [Импорт →]  — footer
 */

import React, { memo, useEffect, useState, useCallback } from 'react';

export type ImportMode = 'artboard' | 'selection';

export interface ImportOptions {
  mode: ImportMode;
  includeScreenshots: boolean;
}

interface Props {
  query: string;
  itemCount: number;
  source?: string;
  summary?: string;
  hasSelection: boolean;
  /** 'feed' when importing ya.ru rhythm feed cards */
  sourceType?: 'serp' | 'feed';
  onConfirm: (options: ImportOptions) => void;
  onCancel: () => void;
  onClearQueue?: () => void;
}

/**
 * Format summary with dot separator for compact display.
 * "42 сниппета, фильтры (5), сайдбар (8 офферов)" → "42 сниппета · фильтры (5) · сайдбар (8 офферов)"
 */
function formatSummary(summary: string | undefined, itemCount: number): string {
  if (!summary) {
    const word = itemCount === 1 ? 'элемент' : itemCount < 5 ? 'элемента' : 'элементов';
    return `${itemCount} ${word}`;
  }
  // Replace comma separators with middle dot
  return summary.replace(/,\s*/g, ' \u00B7 ');
}

export const ImportConfirmDialog: React.FC<Props> = memo(({
  query,
  itemCount,
  summary,
  hasSelection,
  sourceType,
  onConfirm,
  onCancel,
  onClearQueue,
}) => {
  const isFeed = sourceType === 'feed';
  const [mode, setMode] = useState<ImportMode>('artboard');
  const [includeScreenshots, setIncludeScreenshots] = useState(!isFeed);

  const displaySummary = isFeed
    ? `${itemCount} ${itemCount === 1 ? 'карточка' : itemCount < 5 ? 'карточки' : 'карточек'} фида`
    : formatSummary(summary, itemCount);

  const handleConfirm = useCallback(() => {
    onConfirm({ mode, includeScreenshots });
  }, [onConfirm, mode, includeScreenshots]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      } else if (e.key === 'Enter') {
        handleConfirm();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, handleConfirm]);

  return (
    <div className="confirm-dialog">
      {/* Content */}
      <div className="confirm-dialog__content">
        {/* Query + Summary */}
        <div className="confirm-dialog__header">
          <div className="confirm-dialog__query" title={query}>
            {query ? `\u00AB${query}\u00BB` : ''}
          </div>
          <div className="confirm-dialog__summary" title={displaySummary}>
            {displaySummary}
          </div>
        </div>

        {/* Controls row: segmented + checkbox */}
        <div className="confirm-dialog__controls">
          <div className="confirm-dialog__segmented">
            <button
              type="button"
              className={`confirm-dialog__segment${mode === 'artboard' ? ' active' : ''}`}
              onClick={() => setMode('artboard')}
            >
              Артборд
            </button>
            <button
              type="button"
              className={`confirm-dialog__segment${mode === 'selection' ? ' active' : ''}`}
              onClick={() => setMode('selection')}
              disabled={!hasSelection}
            >
              Выделение
            </button>
          </div>

          <label className="confirm-dialog__checkbox">
            <input
              type="checkbox"
              checked={includeScreenshots}
              onChange={(e) => setIncludeScreenshots(e.target.checked)}
            />
            <span>Скриншоты</span>
          </label>
        </div>
      </div>

      {/* Footer */}
      <div className="confirm-dialog__footer">
        {onClearQueue && (
          <button
            type="button"
            className="confirm-dialog__btn-danger"
            onClick={onClearQueue}
          >
            Очистить
          </button>
        )}

        <div className="confirm-dialog__footer-right">
          <button
            type="button"
            className="confirm-dialog__btn-secondary"
            onClick={onCancel}
          >
            Отмена
          </button>
          <button
            type="button"
            className="confirm-dialog__btn-primary"
            onClick={handleConfirm}
            autoFocus
          >
            Импорт \u2192
          </button>
        </div>
      </div>
    </div>
  );
});

ImportConfirmDialog.displayName = 'ImportConfirmDialog';

export default ImportConfirmDialog;
