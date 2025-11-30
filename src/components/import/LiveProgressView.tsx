import React, { useEffect, useState, useRef } from 'react';
import { ProgressData } from '../../types';

interface LiveProgressViewProps {
  progress: ProgressData | null;
  recentLogs: string[];
  currentOperation?: string;
  fileSize?: number;
}

export const LiveProgressView: React.FC<LiveProgressViewProps> = ({
  progress,
  recentLogs,
  currentOperation,
  fileSize
}) => {
  const [visibleLogs, setVisibleLogs] = useState<string[]>([]);
  const [animatingOut, setAnimatingOut] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Format file size for display
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Get the last 5 meaningful log entries (strip timestamp)
  const getRecentActivities = (): string[] => {
    return recentLogs
      .slice(-5)
      .map(log => log.replace(/^\[\d{1,2}:\d{2}:\d{2}( [AP]M)?\]\s*/, ''));
  };

  // Update visible logs with animation
  useEffect(() => {
    const activities = getRecentActivities();
    setVisibleLogs(activities);
  }, [recentLogs]);

  const percentage = progress && progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  return (
    <div className="status-thinking" ref={containerRef}>
      {/* Header with progress info */}
      <div className="status-thinking-header">
        <div className="status-thinking-indicator">
          <span className="status-thinking-dot"></span>
          <span className="status-thinking-dot"></span>
          <span className="status-thinking-dot"></span>
        </div>
        <span className="status-thinking-label">
          {currentOperation || progress?.message || 'Processing...'}
        </span>
        <span className="status-thinking-meta">
          {percentage}%{fileSize ? ` • ${formatFileSize(fileSize)}` : ''}
        </span>
      </div>

      {/* Recent Activity - GPT thinking style */}
      <div className="status-thinking-activity">
        <div className="status-thinking-activity-header">
          <span className="status-thinking-activity-icon">📝</span>
          <span className="status-thinking-activity-title">Recent Activity</span>
          <span className="status-thinking-activity-count">Last {visibleLogs.length}</span>
        </div>
        <div className="status-thinking-activity-list">
          {visibleLogs.map((log, index) => (
            <div 
              key={`${index}-${log.substring(0, 20)}`}
              className={`status-thinking-activity-item ${index === visibleLogs.length - 1 ? 'latest' : ''} ${animatingOut === log ? 'fade-out' : 'fade-in'}`}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              {log}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
