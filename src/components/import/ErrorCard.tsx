import React from 'react';

interface ErrorCardProps {
  message: string;
  details?: string;
  onDismiss?: () => void;
  onViewLogs?: () => void;
}

export const ErrorCard: React.FC<ErrorCardProps> = ({
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
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M8 4v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="8" cy="11.5" r="0.75" fill="currentColor"/>
            </svg>
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
};

