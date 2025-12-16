import React, { useEffect, useState, useRef, memo } from 'react';
import { ProgressData } from '../../types';
import { PROCESSING_TIPS, STAGE_LABELS } from '../../config';

interface LiveProgressViewProps {
  progress: ProgressData | null;
  recentLogs: string[];
  currentOperation?: string;
  fileSize?: number;
}

export const LiveProgressView: React.FC<LiveProgressViewProps> = memo(({
  progress,
  recentLogs,
  currentOperation,
  fileSize
}) => {
  const [visibleLogs, setVisibleLogs] = useState<string[]>([]);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const tipIntervalRef = useRef<number | null>(null);

  // Format file size for display
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Get human-readable stage label from config
  const getStageLabel = (operationType?: string): string => {
    if (!operationType) return STAGE_LABELS.default;
    return STAGE_LABELS[operationType] || STAGE_LABELS.default;
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

  // Циклическая смена подсказок каждые 20 секунд
  useEffect(() => {
    // Сбрасываем индекс при начале новой обработки
    setCurrentTipIndex(0);
    
    // Устанавливаем интервал для смены подсказок
    tipIntervalRef.current = setInterval(() => {
      setCurrentTipIndex((prev) => (prev + 1) % PROCESSING_TIPS.length);
    }, 20000); // 20 секунд

    return () => {
      if (tipIntervalRef.current) {
        clearInterval(tipIntervalRef.current);
      }
    };
  }, [progress?.operationType]); // Перезапускаем при смене этапа

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
        <div className="status-thinking-label-group">
          <span className="status-thinking-stage">
            {progress?.operationType ? getStageLabel(progress.operationType) : 'Обработка...'}
          </span>
          <span className="status-thinking-label">
            {currentOperation || progress?.message || 'Обработка...'}
          </span>
        </div>
        <span className="status-thinking-meta">
          {percentage}%{fileSize ? ` • ${formatFileSize(fileSize)}` : ''}
        </span>
      </div>

      {/* Visual progress bar */}
      <div className="status-thinking-progress-bar">
        <div 
          className="status-thinking-progress-fill"
          style={{ width: `${percentage}%` }}
        />
        {/* Animated shimmer effect when progress is slow */}
        {percentage < 100 && (
          <div className="status-thinking-progress-shimmer" />
        )}
      </div>

      {/* Подсказка */}
      <div className="status-thinking-tip">
        <div className="status-thinking-tip-icon">💡</div>
        <div className="status-thinking-tip-text">
          {PROCESSING_TIPS[currentTipIndex]}
        </div>
      </div>

      {/* Последние действия */}
      <div className="status-thinking-activity">
        <div className="status-thinking-activity-header">
          <span className="status-thinking-activity-title">Активность</span>
          <span className="status-thinking-activity-count">{visibleLogs.length}</span>
        </div>
        <div className="status-thinking-activity-list">
          {visibleLogs.map((log, index) => (
            <div 
              key={`${index}-${log.substring(0, 20)}`}
              className={`status-thinking-activity-item ${index === visibleLogs.length - 1 ? 'latest' : ''} fade-in`}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              {log}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

LiveProgressView.displayName = 'LiveProgressView';
