/**
 * SuccessView — success/error state after import
 *
 * Shows animated checkmark with auto-dismiss bar.
 * On error: X icon with error message and retry button.
 * Pauses auto-close on hover.
 */

import React, { memo, useEffect, useState, useCallback, useRef } from 'react';
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

  // Compute stats text
  const totalItems = stats?.processedInstances || stats?.totalInstances || 0;
  const elapsedSec = stats ? ((stats.processedInstances || 0) > 0 ? '~' : '') : '';

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

  // Build subtitle
  let subtitle = '';
  if (totalItems > 0) {
    subtitle = `${totalItems} ${totalItems === 1 ? '\u044D\u043B\u0435\u043C\u0435\u043D\u0442' : totalItems < 5 ? '\u044D\u043B\u0435\u043C\u0435\u043D\u0442\u0430' : '\u044D\u043B\u0435\u043C\u0435\u043D\u0442\u043E\u0432'}`;
    if (elapsedSec) {
      subtitle += ` ${elapsedSec}`;
    }
  } else if (query) {
    subtitle = `\u00AB${query}\u00BB`;
  }

  return (
    <div
      className="success-view--figma view-scale-in"
      onMouseEnter={pauseTimer}
      onMouseLeave={resumeTimer}
    >
      {/* Checkmark / Error icon */}
      {hasFailures ? (
        <div className="success-view-icon success-view-icon--error icon-bounce-in">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="2.5" />
            <path d="M16 16L32 32M32 16L16 32" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </div>
      ) : (
        <div className="success-view-icon icon-bounce-in">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="2.5" />
            <path d="M14 24L21 31L34 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}

      {/* Title */}
      <h2 className={`success-view-title${hasFailures ? ' success-view-title--error' : ''}`}>
        {hasFailures ? '\u0418\u043C\u043F\u043E\u0440\u0442 \u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043D \u0441 \u043E\u0448\u0438\u0431\u043A\u0430\u043C\u0438' : '\u0418\u043C\u043F\u043E\u0440\u0442 \u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043D'}
      </h2>

      {/* Secondary text */}
      {subtitle && (
        <p className="success-view-desc">{subtitle}</p>
      )}

      {/* Failure stats */}
      {hasFailures && stats && (
        <div className="success-view-stats">
          {stats.fieldsSet ? (
            <span className="success-stat success-stat--ok">{'\u2713'} {stats.fieldsSet} \u0441\u0432\u043E\u0439\u0441\u0442\u0432</span>
          ) : null}
          {stats.fieldsFailed ? (
            <span className="success-stat success-stat--warn">{'\u2717'} {stats.fieldsFailed} \u043D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C</span>
          ) : null}
          {stats.failedImages ? (
            <span className="success-stat success-stat--warn">{'\u2717'} {stats.failedImages} \u0438\u0437\u043E\u0431\u0440. \u043D\u0435 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043E</span>
          ) : null}
        </div>
      )}

      {/* Log link when failures present */}
      {hasFailures && onShowLogs && (
        <button
          type="button"
          className="btn-text-sm success-view-logs-link"
          onClick={() => { handleClose(); onShowLogs(); }}
        >
          \u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u043F\u043E\u0434\u0440\u043E\u0431\u043D\u043E\u0441\u0442\u0438
        </button>
      )}

      {/* Auto-dismiss bar */}
      {isClosing && !paused && effectiveDelay > 0 && (
        <div className="success-view-dismiss-bar">
          <div
            className="success-view-dismiss-bar-fill"
            style={{ animationDuration: `${effectiveDelay}ms` }}
          />
        </div>
      )}

      {/* Dismiss button */}
      <button
        type="button"
        className="btn-secondary success-view-done"
        onClick={handleClose}
      >
        \u0413\u043E\u0442\u043E\u0432\u043E
      </button>
    </div>
  );
});

SuccessView.displayName = 'SuccessView';
