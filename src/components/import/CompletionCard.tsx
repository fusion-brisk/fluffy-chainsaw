import React, { memo } from 'react';
import { ProcessingStats } from '../../types';
import { CheckIcon } from '../Icons';

interface CompletionCardProps {
  stats: ProcessingStats;
  processingTime?: number; // in milliseconds
  onViewLogs?: () => void;
  onDismiss?: () => void;
  onRepeat?: () => void;
  canRepeat?: boolean;
}

export const CompletionCard: React.FC<CompletionCardProps> = memo(({
  stats,
  processingTime,
  onViewLogs,
  onDismiss,
  onRepeat,
  canRepeat = false
}) => {
  const hasErrors = stats.failedImages > 0;
  
  // Calculate success rate based on total image operations
  const totalImageOperations = stats.successfulImages + stats.failedImages;
  const successRate = totalImageOperations > 0
    ? Math.min(100, Math.round((stats.successfulImages / totalImageOperations) * 100))
    : (stats.processedInstances > 0 ? 100 : 0);

  // Format time
  const formatTime = (ms: number): string => {
    const seconds = ms / 1000;
    if (seconds < 1) return `${Math.round(ms)}ms`;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  };

  return (
    <div className="status-completion">
      {/* Header with close button */}
      <div className="status-completion-header">
        <div className={`status-completion-badge ${hasErrors ? 'has-errors' : 'success'}`}>
          <span className="status-completion-icon">
            {hasErrors ? '⚠️' : <CheckIcon />}
          </span>
          <span className="status-completion-text">
            {hasErrors ? 'Completed with issues' : 'Done'}
          </span>
        </div>
        {onDismiss && (
          <button 
            className="status-completion-close" 
            onClick={onDismiss}
            title="Dismiss"
          >
            ×
          </button>
        )}
      </div>

      {/* Compact stats row */}
      <div className="status-completion-summary">
        <span className="status-completion-summary-item">
          <strong>{stats.processedInstances}</strong> items
        </span>
        {stats.successfulImages > 0 && (
          <span className="status-completion-summary-item">
            <strong>{stats.successfulImages}</strong> images
          </span>
        )}
        {hasErrors && (
          <span className="status-completion-summary-item error">
            <strong>{stats.failedImages}</strong> failed
          </span>
        )}
        {processingTime && (
          <span className="status-completion-summary-item">
            <strong>{formatTime(processingTime)}</strong>
          </span>
        )}
      </div>

      {/* Success rate bar */}
      <div className="status-completion-rate">
        <div 
          className={`status-completion-rate-bar ${hasErrors ? 'has-errors' : 'success'}`}
          style={{ width: `${successRate}%` }}
        />
      </div>

      {/* Error summary if any */}
      {hasErrors && stats.errors && stats.errors.length > 0 && (
        <div className="status-completion-errors">
          {stats.errors.slice(0, 2).map((error, idx) => (
            <div key={idx} className="status-completion-error">
              <span className="status-completion-error-indicator">×</span>
              <span className="status-completion-error-text">
                {error.rowIndex !== undefined && `Row ${error.rowIndex + 1}: `}
                {error.message}
              </span>
            </div>
          ))}
          {stats.errors.length > 2 && onViewLogs && (
            <button className="status-completion-more-btn" onClick={onViewLogs}>
              +{stats.errors.length - 2} more
            </button>
          )}
        </div>
      )}

      {/* Actions row */}
      {(onViewLogs || (onRepeat && canRepeat)) && (
        <div className="status-completion-actions">
          {onRepeat && canRepeat && (
            <button className="status-completion-repeat" onClick={onRepeat}>
              ↻ Repeat
            </button>
          )}
          {onViewLogs && (
            <button className="status-completion-link" onClick={onViewLogs}>
              View logs
            </button>
          )}
        </div>
      )}
    </div>
  );
});

CompletionCard.displayName = 'CompletionCard';
