import React, { memo } from 'react';
import { WarningIcon } from '../Icons';

interface ErrorCardProps {
  message: string;
  details?: string;
  onDismiss?: () => void;
  onViewLogs?: () => void;
}

export const ErrorCard: React.FC<ErrorCardProps> = memo(({
  message,
  details,
  onDismiss,
  onViewLogs
}) => {
  return (
    <div className="status-error">
      {/* Header with close button */}
      <div className="status-error-header">
        <div className="status-error-badge">
          <span className="status-error-icon">
            <WarningIcon />
          </span>
          <span className="status-error-text">Error</span>
        </div>
        {onDismiss && (
          <button 
            className="status-error-close" 
            onClick={onDismiss}
            title="Dismiss"
          >
            ×
          </button>
        )}
      </div>

      {/* Error message */}
      <div className="status-error-message">
        {message}
      </div>

      {/* Details if any */}
      {details && (
        <div className="status-error-details">
          {details}
        </div>
      )}

      {/* Actions */}
      {onViewLogs && (
        <div className="status-error-actions">
          <button className="status-error-link" onClick={onViewLogs}>
            View logs
          </button>
        </div>
      )}
    </div>
  );
});

ErrorCard.displayName = 'ErrorCard';
