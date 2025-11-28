import React from 'react';
import { ProgressData } from '../../types';

interface LiveProgressViewProps {
  progress: ProgressData | null;
  recentLogs: string[];
  currentOperation?: string;
}

export const LiveProgressView: React.FC<LiveProgressViewProps> = ({ 
  progress, 
  recentLogs,
  currentOperation 
}) => {
  if (!progress) return null;

  const percentage = progress.total > 0 
    ? Math.round((progress.current / progress.total) * 100) 
    : 0;

  return (
    <div className="live-progress-view">
      <div className="live-progress-header">
        <div className="live-progress-title">
          <span className="live-progress-icon">⏳</span>
          <span className="live-progress-text">
            {currentOperation || progress.message || 'Processing...'}
          </span>
        </div>
        <div className="live-progress-percentage">{percentage}%</div>
      </div>

      <div className="live-progress-bar-container">
        <div 
          className="live-progress-bar" 
          style={{ width: `${percentage}%` }}
        >
          <div className="live-progress-bar-shine" />
        </div>
      </div>

      <div className="live-progress-details">
        <span className="live-progress-count">
          {progress.current} / {progress.total}
        </span>
        {progress.operationType && (
          <span className="live-progress-operation">
            {progress.operationType}
          </span>
        )}
      </div>

      {recentLogs.length > 0 && (
        <div className="live-progress-logs">
          <div className="live-progress-logs-header">
            <span className="live-progress-logs-title">📝 Recent Activity</span>
            <span className="live-progress-logs-count">
              Last {Math.min(recentLogs.length, 5)}
            </span>
          </div>
          <div className="live-progress-logs-content">
            {recentLogs.slice(-5).map((log, index) => (
              <div 
                key={index} 
                className={`live-progress-log-entry ${
                  log.includes('❌') ? 'error' : 
                  log.includes('✅') ? 'success' : 
                  log.includes('⚠️') ? 'warning' : ''
                }`}
              >
                {log}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

