import React, { useEffect, useState, useRef, memo } from 'react';
import { ProgressData } from '../../types';

interface LiveProgressViewProps {
  progress: ProgressData | null;
  recentLogs: string[];
  currentOperation?: string;
  fileSize?: number;
}

// Подсказки, объясняющие процесс обработки
const PROCESSING_TIPS = [
  '🔍 Плагин анализирует структуру макета, ищет все контейнеры сниппетов на странице. Это может занять время при большом количестве элементов.',
  '📊 Каждый контейнер проверяется на наличие полей данных (текст, изображения, цены). Плагин определяет, какие данные к каким слоям относятся.',
  '🎨 Применяется компонентная логика: настраиваются варианты компонентов, скрываются/показываются элементы в зависимости от данных.',
  '🔤 Загружаются и применяются шрифты для текстовых слоев. Figma требует загрузки каждого используемого шрифта перед применением.',
  '🖼️ Изображения загружаются из интернета, кэшируются и применяются к слоям. При большом количестве изображений это может занять время.',
  '⚡ Плагин обрабатывает элементы последовательно, чтобы не перегрузить Figma. Это обеспечивает стабильную работу даже с большими макетами.',
  '💾 Загруженные изображения сохраняются в кэш, поэтому повторные запуски будут работать быстрее.'
];

export const LiveProgressView: React.FC<LiveProgressViewProps> = memo(({
  progress,
  recentLogs,
  currentOperation,
  fileSize
}) => {
  const [visibleLogs, setVisibleLogs] = useState<string[]>([]);
  const [animatingOut, setAnimatingOut] = useState<string | null>(null);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const tipIntervalRef = useRef<number | null>(null);

  // Format file size for display
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Get human-readable stage label
  const getStageLabel = (operationType?: string): string => {
    switch (operationType) {
      case 'searching':
        return 'Этап 1/5: Поиск контейнеров';
      case 'grouping':
        return 'Этап 2/5: Группировка сниппетов';
      case 'components':
        return 'Этап 3/5: Компонентная логика';
      case 'text':
        return 'Этап 4/5: Обработка текста';
      case 'images-start':
      case 'images':
        return 'Этап 5/5: Обработка изображений';
      default:
        return 'Обработка';
    }
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
            {currentOperation || progress?.message || 'Processing...'}
          </span>
        </div>
        <span className="status-thinking-meta">
          {percentage}%{fileSize ? ` • ${formatFileSize(fileSize)}` : ''}
        </span>
      </div>

      {/* Подсказка */}
      <div className="status-thinking-tip">
        <div className="status-thinking-tip-icon">💡</div>
        <div className="status-thinking-tip-text">
          {PROCESSING_TIPS[currentTipIndex]}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="status-thinking-activity">
        <div className="status-thinking-activity-header">
          <span className="status-thinking-activity-title">Activity</span>
          <span className="status-thinking-activity-count">{visibleLogs.length}</span>
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
});

LiveProgressView.displayName = 'LiveProgressView';
