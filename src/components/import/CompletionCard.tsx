import React from 'react';
import { ProcessingStats } from '../../types';

interface CompletionCardProps {
  stats: ProcessingStats;
  onViewLogs?: () => void;
  onImportAnother?: () => void;
}

export const CompletionCard: React.FC<CompletionCardProps> = ({ 
  stats, 
  onViewLogs,
  onImportAnother 
}) => {
  const hasErrors = stats.failedImages > 0;
  const successRate = stats.processedInstances > 0
    ? Math.round((stats.successfulImages / stats.processedInstances) * 100)
    : 0;

  return (
    <div className={`completion-card ${hasErrors ? 'has-errors' : 'success'}`}>
      <div className="completion-card-header">
        <div className="completion-icon">
          {hasErrors ? '⚠️' : '✅'}
        </div>
        <div className="completion-title">
          {hasErrors ? 'Completed with errors' : 'Successfully completed'}
        </div>
      </div>

      <div className="completion-stats">
        <div className="completion-stat-item main">
          <div className="completion-stat-value">{stats.processedInstances}</div>
          <div className="completion-stat-label">Items Processed</div>
        </div>

        <div className="completion-stats-grid">
          <div className="completion-stat-item success">
            <div className="completion-stat-value">{stats.successfulImages}</div>
            <div className="completion-stat-label">Images</div>
          </div>

          {stats.skippedImages > 0 && (
            <div className="completion-stat-item skipped">
              <div className="completion-stat-value">{stats.skippedImages}</div>
              <div className="completion-stat-label">Skipped</div>
            </div>
          )}

          {hasErrors && (
            <div className="completion-stat-item error">
              <div className="completion-stat-value">{stats.failedImages}</div>
              <div className="completion-stat-label">Errors</div>
            </div>
          )}
        </div>
      </div>

      {successRate > 0 && (
        <div className="completion-success-rate">
          <div className="completion-success-rate-bar-bg">
            <div 
              className="completion-success-rate-bar"
              style={{ width: `${successRate}%` }}
            />
          </div>
          <div className="completion-success-rate-text">
            {successRate}% Success Rate
          </div>
        </div>
      )}

      {hasErrors && stats.errors && stats.errors.length > 0 && (
        <div className="completion-errors-summary">
          <div className="completion-errors-title">
            ⚠️ {stats.errors.length} error{stats.errors.length > 1 ? 's' : ''} occurred
          </div>
          <div className="completion-errors-preview">
            {stats.errors.slice(0, 2).map((error, idx) => (
              <div key={idx} className="completion-error-item">
                <span className="completion-error-type">[{error.type}]</span>
                <span className="completion-error-message">{error.message}</span>
              </div>
            ))}
            {stats.errors.length > 2 && (
              <div className="completion-errors-more">
                +{stats.errors.length - 2} more errors
              </div>
            )}
          </div>
          {onViewLogs && (
            <button 
              className="completion-view-logs-btn"
              onClick={onViewLogs}
            >
              View Details in Logs →
            </button>
          )}
        </div>
      )}

      <div className="completion-actions">
        {onImportAnother && (
          <button 
            className="completion-action-btn primary"
            onClick={onImportAnother}
          >
            Import Another File
          </button>
        )}
      </div>
    </div>
  );
};

