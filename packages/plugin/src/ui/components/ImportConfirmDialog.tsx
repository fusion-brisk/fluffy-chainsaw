/**
 * ImportConfirmDialog — confirmation screen before import
 *
 * Shows query, content summary, mode radio, screenshot toggle.
 * One primary action: "Импортировать".
 */

import React, { memo, useEffect, useState } from 'react';
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

/**
 * Parse summary string into structured lines for display.
 * Input examples:
 *   "42 сниппета, боковые фильтры (5 разделов), сайдбар (8 офферов)"
 *   "12 сниппетов + 1 wizard"
 */
function parseSummaryLines(summary: string | undefined, itemCount: number): string[] {
  if (!summary) {
    return [`${itemCount} ${formatItemWord(itemCount)}`];
  }
  // Split by comma or " + " and trim
  return summary.split(/,|\s\+\s/).map(s => s.trim()).filter(Boolean);
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
  const [mode, setMode] = useState<ImportMode>('artboard');
  const [includeScreenshots, setIncludeScreenshots] = useState(true);

  const summaryLines = parseSummaryLines(summary, itemCount);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      } else if (e.key === 'Enter') {
        onConfirm({ mode, includeScreenshots });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, onConfirm, mode, includeScreenshots]);

  return (
    <div className="confirm-view--figma view-animate-in">
      {/* Header */}
      <div className="confirm-view-header">
        <h2 className="confirm-view-title">Импорт данных</h2>
        <span className="confirm-view-query" title={query}>
          {query ? `\u00AB${query}\u00BB` : ''}
        </span>
      </div>

      {/* Content summary list */}
      <div className="confirm-view-summary">
        {summaryLines.map((line, i) => (
          <div key={i} className="confirm-view-summary-item">
            <span className="confirm-view-summary-icon">{getSummaryIcon(i)}</span>
            <span>{line}</span>
          </div>
        ))}
      </div>

      {/* Mode radio */}
      <div className="confirm-view-mode">
        <span className="confirm-view-mode-label">Режим:</span>
        <label className="confirm-view-radio">
          <input
            type="radio"
            name="import-mode"
            value="artboard"
            checked={mode === 'artboard'}
            onChange={() => setMode('artboard')}
          />
          <span>Новый артборд</span>
        </label>
        <label className={`confirm-view-radio${!hasSelection ? ' confirm-view-radio--disabled' : ''}`}>
          <input
            type="radio"
            name="import-mode"
            value="selection"
            checked={mode === 'selection'}
            disabled={!hasSelection}
            onChange={() => setMode('selection')}
          />
          <span>Заполнить выделение</span>
        </label>
      </div>

      {/* Screenshot checkbox */}
      {hasScreenshots && (
        <label className="confirm-view-checkbox">
          <input
            type="checkbox"
            checked={includeScreenshots}
            onChange={(e) => setIncludeScreenshots(e.target.checked)}
          />
          <span>Включить скриншоты</span>
        </label>
      )}

      {/* Sticky footer */}
      <div className="confirm-view-footer">
        <button
          type="button"
          className="confirm-view-footer-cancel"
          onClick={onCancel}
        >
          Отмена
        </button>
        <button
          type="button"
          className="btn-primary confirm-view-footer-submit"
          onClick={() => onConfirm({ mode, includeScreenshots })}
          autoFocus
        >
          Импортировать
        </button>
      </div>
    </div>
  );
});

function getSummaryIcon(index: number): string {
  const icons = ['\uD83D\uDCCB', '\uD83D\uDD0D', '\uD83D\uDCE6', '\u2699\uFE0F'];
  return icons[index] || '\u2022';
}

ImportConfirmDialog.displayName = 'ImportConfirmDialog';

export default ImportConfirmDialog;
