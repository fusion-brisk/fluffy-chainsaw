/**
 * SuccessView — Figma-style success state
 *
 * Shows animated success checkmark with celebration message.
 * Auto-close delay adapts: 3s for clean imports, 8s when failures present.
 * Pauses auto-close on hover so user can read failure details.
 */

import React, { memo, useEffect, useState, useCallback, useRef } from 'react';
import { CheckCircleIcon } from './Icons';
import type { ProcessingStats } from '../../types';

interface SuccessViewProps {
  query?: string;
  stats?: ProcessingStats | null;
  onComplete?: () => void;
  onShowLogs?: () => void;
  autoCloseDelay?: number;
}

const DELAY_CLEAN = 3000;
const DELAY_WITH_FAILURES = 8000;

export const SuccessView: React.FC<SuccessViewProps> = memo(({
  query,
  stats,
  onComplete,
  onShowLogs,
  autoCloseDelay: delayOverride
}) => {
  const hasFailures = !!(stats && (stats.fieldsFailed || stats.failedImages));
  const effectiveDelay = delayOverride ?? (hasFailures ? DELAY_WITH_FAILURES : DELAY_CLEAN);

  const [isClosing, setIsClosing] = useState(false);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remainingRef = useRef(effectiveDelay);
  const startTimeRef = useRef(0);

  // Start / resume auto-close timer
  const startTimer = useCallback(() => {
    if (!onComplete || effectiveDelay <= 0) return;
    startTimeRef.current = Date.now();
    timerRef.current = setTimeout(onComplete, remainingRef.current);
    setIsClosing(true);
  }, [onComplete, effectiveDelay]);

  // Pause auto-close timer
  const pauseTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      const elapsed = Date.now() - startTimeRef.current;
      remainingRef.current = Math.max(0, remainingRef.current - elapsed);
    }
    setIsClosing(false);
    setPaused(true);
  }, []);

  // Resume on mouse leave
  const resumeTimer = useCallback(() => {
    setPaused(false);
    startTimer();
  }, [startTimer]);

  useEffect(() => {
    startTimer();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [startTimer]);

  const handleClose = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    onComplete?.();
  }, [onComplete]);

  return (
    <div
      className="success-view--figma view-scale-in"
      onMouseEnter={pauseTimer}
      onMouseLeave={resumeTimer}
    >
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
          {stats.fieldsSet ? (
            <span className="success-stat success-stat--ok">✓ {stats.fieldsSet} свойств</span>
          ) : null}
          {stats.fieldsFailed ? (
            <span className="success-stat success-stat--warn">✗ {stats.fieldsFailed} не удалось</span>
          ) : null}
          {stats.failedImages ? (
            <span className="success-stat success-stat--warn">✗ {stats.failedImages} изобр. не загружено</span>
          ) : null}
        </div>
      ) : null}

      {/* Log link when failures present */}
      {hasFailures && onShowLogs && (
        <button
          type="button"
          className="btn-text-sm success-view-logs-link"
          onClick={() => { handleClose(); onShowLogs(); }}
        >
          Показать подробности
        </button>
      )}

      {/* Close button */}
      <button
        type="button"
        className="btn-text success-view-close"
        onClick={handleClose}
      >
        Закрыть
      </button>

      {/* Auto-close progress indicator */}
      {isClosing && !paused && effectiveDelay > 0 && (
        <div className="success-view-progress">
          <div
            className="success-view-progress-bar"
            style={{ animationDuration: `${effectiveDelay}ms` }}
          />
        </div>
      )}
    </div>
  );
});

SuccessView.displayName = 'SuccessView';
