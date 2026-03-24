/**
 * ImportConfirmDialog — Figma-style confirmation dialog
 *
 * Shows when data is received from browser extension or file.
 * User can choose to create new artboard or fill selected elements.
 */

import React, { memo, useEffect, useState } from 'react';
import { SearchIcon, CheckCircleIcon } from './Icons';
import { formatItemWord } from '../../utils/format';

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
  hasScreenshots?: boolean;
  onConfirm: (options: ImportOptions) => void;
  onCancel: () => void;
}

export const ImportConfirmDialog: React.FC<Props> = memo(({
  query,
  itemCount,
  summary,
  hasSelection,
  hasScreenshots = true,
  onConfirm,
  onCancel
}) => {
  const [includeScreenshots, setIncludeScreenshots] = useState(true);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      } else if (e.key === 'Enter') {
        onConfirm({ mode: 'artboard', includeScreenshots });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, onConfirm, includeScreenshots]);

  return (
    <div className="confirm-view--figma view-animate-in">
      {/* Icon — distinct from ReadyView */}
      <div className="confirm-view-icon">
        <CheckCircleIcon size={24} />
      </div>

      {/* Title */}
      <h2 className="confirm-view-title">Данные получены</h2>

      {/* Query card */}
      <div className="confirm-view-query-card figma-card">
        <span className="confirm-view-query-text" title={query}>
          {query || 'Импорт данных'}
        </span>
        <SearchIcon className="confirm-view-query-icon" />
      </div>

      {/* Item count / summary */}
      <div className="confirm-view-meta">
        {summary || `${itemCount} ${formatItemWord(itemCount)}`}
      </div>

      {/* Screenshot toggle */}
      {hasScreenshots && (
        <label className="confirm-view-checkbox">
          <input
            type="checkbox"
            checked={includeScreenshots}
            onChange={(e) => setIncludeScreenshots(e.target.checked)}
          />
          <span>Добавить скриншоты страницы</span>
        </label>
      )}

      {/* Action buttons */}
      <div className="confirm-view-actions">
        <button
          type="button"
          className="btn-primary"
          onClick={() => onConfirm({ mode: 'artboard', includeScreenshots })}
          autoFocus
        >
          Создать артборд
        </button>

        {hasSelection ? (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onConfirm({ mode: 'selection', includeScreenshots })}
          >
            Заполнить выделение
          </button>
        ) : (
          <div className="confirm-view-selection-hint">
            Выделите контейнеры для заполнения
          </div>
        )}

        <button
          type="button"
          className="btn-text"
          onClick={onCancel}
        >
          Отмена
        </button>
      </div>

      {/* Keyboard shortcut hint */}
      <div className="confirm-view-hint">
        <kbd>Enter</kbd>
        <span>— создать артборд</span>
      </div>

    </div>
  );
});

ImportConfirmDialog.displayName = 'ImportConfirmDialog';

export default ImportConfirmDialog;
