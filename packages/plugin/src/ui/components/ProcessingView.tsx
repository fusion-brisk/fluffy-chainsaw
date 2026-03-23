/**
 * ProcessingView — Figma-style processing animation
 *
 * Shows during data processing with spinner, progress indicator,
 * and cancel button.
 */

import React, { memo, useState, useEffect, useRef } from 'react';
import { ImportInfo } from '../../types';

interface ProcessingViewProps {
  importInfo: ImportInfo;
  onCancel?: () => void;
}

/** Seconds before showing "stuck" hint */
const STUCK_HINT_DELAY = 15_000;

export const ProcessingView: React.FC<ProcessingViewProps> = memo(({
  importInfo,
  onCancel
}) => {
  const { query, summary, stage } = importInfo;
  const [showStuckHint, setShowStuckHint] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset stuck hint timer on every stage change
  useEffect(() => {
    setShowStuckHint(false);
    timerRef.current = setTimeout(() => setShowStuckHint(true), STUCK_HINT_DELAY);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [stage]);

  const stageLabel = stage ? getStageLabel(stage) : null;

  return (
    <div className="processing-view--figma view-animate-in">
      {/* Simple spinner */}
      <div className="processing-view-spinner" />

      {/* Status text */}
      <h2 className="processing-view-title">Обработка...</h2>

      {/* Stage indicator */}
      {stageLabel && (
        <span className="processing-view-stage">{stageLabel}</span>
      )}

      {/* Query info */}
      <div className="processing-view-card figma-card">
        <span className="processing-view-query">{query || 'Импорт данных'}</span>
        {summary && (
          <div className="processing-view-marquee">
            <span className="processing-view-marquee-text">
              {summary}&nbsp;&nbsp;·&nbsp;&nbsp;{summary}&nbsp;&nbsp;·&nbsp;&nbsp;
            </span>
          </div>
        )}
      </div>

      {/* Stuck hint */}
      {showStuckHint && (
        <span className="processing-view-stuck">
          Если процесс завис, нажмите «Отменить»
        </span>
      )}

      {/* Cancel button */}
      {onCancel && (
        <button
          type="button"
          className="btn-text processing-view-cancel"
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
    case 'searching': return 'Поиск контейнеров…';
    case 'resetting': return 'Сброс компонентов…';
    case 'grouping': return 'Группировка…';
    case 'components': return 'Компонентная логика…';
    case 'text': return 'Обработка текста…';
    case 'images': return 'Загрузка изображений…';
    case 'cleanup': return 'Очистка…';
    default: return stage;
  }
}

ProcessingView.displayName = 'ProcessingView';
