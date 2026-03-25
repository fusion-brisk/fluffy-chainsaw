/**
 * ProcessingView — centered spinner with progress bar and live counter
 *
 * Shows during data processing. Single action: cancel (text link).
 */

import React, { memo } from 'react';
import { ImportInfo } from '../../types';

interface ProcessingViewProps {
  importInfo: ImportInfo;
  onCancel?: () => void;
}

export const ProcessingView: React.FC<ProcessingViewProps> = memo(({
  importInfo,
  onCancel
}) => {
  const { stage } = importInfo;

  const stageLabel = stage ? getStageLabel(stage) : null;

  return (
    <div className="processing-view--figma view-animate-in">
      {/* CSS spinner */}
      <div className="processing-view-spinner" />

      {/* Primary text */}
      <h2 className="processing-view-title">Импортируем данные...</h2>

      {/* Stage counter */}
      {stageLabel && (
        <span className="processing-view-counter">{stageLabel}</span>
      )}

      {/* Progress bar */}
      <div className="processing-view-progress">
        <div className="processing-view-progress-bar" />
      </div>

      {/* Cancel link */}
      {onCancel && (
        <button
          type="button"
          className="processing-view-cancel-link"
          onClick={onCancel}
        >
          Отменить
        </button>
      )}
    </div>
  );
});

function getStageLabel(stage: string): string {
  switch (stage) {
    case 'searching': return 'Поиск контейнеров\u2026';
    case 'resetting': return 'Сброс компонентов\u2026';
    case 'grouping': return 'Группировка\u2026';
    case 'components': return 'Компонентная логика\u2026';
    case 'text': return 'Обработка текста\u2026';
    case 'images': return 'Загрузка изображений\u2026';
    case 'cleanup': return 'Очистка\u2026';
    default: return stage;
  }
}

ProcessingView.displayName = 'ProcessingView';
