import React, { useEffect, useState, useRef, useMemo, memo } from 'react';
import { ProgressData } from '../../types';
import { STAGE_LABELS, CHANGELOG } from '../../config';

interface LiveProgressViewProps {
  progress: ProgressData | null;
  fileSize?: number;
}

export const LiveProgressView: React.FC<LiveProgressViewProps> = memo(({
  progress,
  fileSize
}) => {
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
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

  // Collect What's New highlights from last 3 versions
  const whatsNewTips = useMemo(() => {
    const tips: string[] = [];
    CHANGELOG.slice(0, 3).forEach(entry => {
      entry.highlights.forEach(highlight => {
        tips.push(highlight);
      });
    });
    return tips.length > 0 ? tips : ['Плагин обрабатывает данные...'];
  }, []);

  // Rotate tips every 5 seconds with fade animation
  useEffect(() => {
    if (whatsNewTips.length <= 1) return;

    tipIntervalRef.current = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentTipIndex((prev) => (prev + 1) % whatsNewTips.length);
        setIsAnimating(false);
      }, 200);
    }, 5000);

    return () => {
      if (tipIntervalRef.current) {
        clearInterval(tipIntervalRef.current);
      }
    };
  }, [whatsNewTips.length]);

  const percentage = progress && progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  const stageLabel = progress?.operationType 
    ? getStageLabel(progress.operationType) 
    : 'Обработка...';

  return (
    <div className="status-thinking">
      {/* Header: stage + progress */}
      <div className="status-thinking-header">
        <div className="status-thinking-indicator">
          <span className="status-thinking-dot"></span>
          <span className="status-thinking-dot"></span>
          <span className="status-thinking-dot"></span>
        </div>
        <span className="status-thinking-stage">{stageLabel}</span>
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
        {percentage < 100 && (
          <div className="status-thinking-progress-shimmer" />
        )}
      </div>

      {/* What's New tip */}
      <div className="status-thinking-tip">
        <div className={`status-thinking-tip-text ${isAnimating ? 'fade-out' : 'fade-in'}`}>
          ✨ {whatsNewTips[currentTipIndex]}
        </div>
      </div>
    </div>
  );
});

LiveProgressView.displayName = 'LiveProgressView';
