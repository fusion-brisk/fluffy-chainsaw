/**
 * SuccessView — Figma-style success state
 * 
 * Shows animated success checkmark with celebration message.
 * Light background with subtle green accent.
 */

import React, { memo, useEffect, useState, useCallback } from 'react';
import { CheckCircleIcon } from './Icons';
import type { ProcessingStats } from '../../types';

interface SuccessViewProps {
  query?: string;
  stats?: ProcessingStats | null;
  onComplete?: () => void;
  autoCloseDelay?: number;
}

export const SuccessView: React.FC<SuccessViewProps> = memo(({
  query,
  stats,
  onComplete,
  autoCloseDelay = 3000
}) => {
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (onComplete && autoCloseDelay > 0) {
      setIsClosing(true);
      const timer = setTimeout(onComplete, autoCloseDelay);
      return () => clearTimeout(timer);
    }
  }, [onComplete, autoCloseDelay]);

  const handleClose = useCallback(() => {
    if (onComplete) {
      onComplete();
    }
  }, [onComplete]);

  return (
    <div className="success-view--figma view-scale-in">
      {/* Success icon */}
      <div className="success-view-icon icon-bounce-in">
        <CheckCircleIcon size={48} />
      </div>
      
      <h2 className="success-view-title">Готово!</h2>
      
      <p className="success-view-desc">
        {query
          ? `Макет для «${query}» добавлен на холст`
          : 'Макет добавлен на холст'
        }
      </p>

      {/* Field stats summary */}
      {stats && (stats.fieldsSet || stats.fieldsFailed || stats.failedImages) ? (
        <div className="success-view-stats">
          {stats.fieldsSet ? <span className="success-stat success-stat--ok">{stats.fieldsSet} свойств</span> : null}
          {stats.fieldsFailed ? <span className="success-stat success-stat--warn">{stats.fieldsFailed} не удалось</span> : null}
          {stats.failedImages ? <span className="success-stat success-stat--warn">{stats.failedImages} изобр. не загружено</span> : null}
        </div>
      ) : null}

      {/* Close button */}
      <button
        type="button"
        className="btn-text success-view-close"
        onClick={handleClose}
      >
        Закрыть
      </button>
      
      {/* Auto-close progress indicator */}
      {isClosing && autoCloseDelay > 0 && (
        <div className="success-view-progress">
          <div 
            className="success-view-progress-bar"
            style={{ animationDuration: `${autoCloseDelay}ms` }}
          />
        </div>
      )}
    </div>
  );
});

SuccessView.displayName = 'SuccessView';
