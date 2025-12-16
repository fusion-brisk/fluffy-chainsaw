import React, { memo } from 'react';
import { ProcessingStats } from '../../types';
import { CheckIcon } from '../Icons';

interface CompletionCardProps {
  stats: ProcessingStats;
  processingTime?: number; // в миллисекундах
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
  
  // Расчёт успешности на основе общего количества операций с изображениями
  const totalImageOperations = stats.successfulImages + stats.failedImages;
  const successRate = totalImageOperations > 0
    ? Math.min(100, Math.round((stats.successfulImages / totalImageOperations) * 100))
    : (stats.processedInstances > 0 ? 100 : 0);

  // Форматирование времени
  const formatTime = (ms: number): string => {
    const seconds = ms / 1000;
    if (seconds < 1) return `${Math.round(ms)} мс`;
    if (seconds < 60) return `${seconds.toFixed(1)} сек`;
    return `${Math.floor(seconds / 60)} мин ${Math.round(seconds % 60)} сек`;
  };

  return (
    <div className="status-completion">
      {/* Заголовок с кнопкой закрытия */}
      <div className="status-completion-header">
        <div className={`status-completion-badge ${hasErrors ? 'has-errors' : 'success'}`}>
          <span className="status-completion-icon">
            {hasErrors ? '⚠️' : <CheckIcon />}
          </span>
          <span className="status-completion-text">
            {hasErrors ? 'Завершено с ошибками' : 'Готово'}
          </span>
        </div>
        {onDismiss && (
          <button 
            className="status-completion-close" 
            onClick={onDismiss}
            title="Закрыть"
          >
            ×
          </button>
        )}
      </div>

      {/* Компактная строка статистики */}
      <div className="status-completion-summary">
        <span className="status-completion-summary-item">
          <strong>{stats.processedInstances}</strong> элементов
        </span>
        {stats.successfulImages > 0 && (
          <span className="status-completion-summary-item">
            <strong>{stats.successfulImages}</strong> изображений
          </span>
        )}
        {hasErrors && (
          <span className="status-completion-summary-item error">
            <strong>{stats.failedImages}</strong> ошибок
          </span>
        )}
        {processingTime && (
          <span className="status-completion-summary-item">
            <strong>{formatTime(processingTime)}</strong>
          </span>
        )}
      </div>

      {/* Полоса успешности */}
      <div className="status-completion-rate">
        <div 
          className={`status-completion-rate-bar ${hasErrors ? 'has-errors' : 'success'}`}
          style={{ width: `${successRate}%` }}
        />
      </div>

      {/* Сводка ошибок, если есть */}
      {hasErrors && stats.errors && stats.errors.length > 0 && (
        <div className="status-completion-errors">
          {stats.errors.slice(0, 2).map((error, idx) => (
            <div key={idx} className="status-completion-error">
              <span className="status-completion-error-indicator">×</span>
              <span className="status-completion-error-text">
                {error.rowIndex !== undefined && `Строка ${error.rowIndex + 1}: `}
                {error.message}
              </span>
            </div>
          ))}
          {stats.errors.length > 2 && onViewLogs && (
            <button className="status-completion-more-btn" onClick={onViewLogs}>
              +{stats.errors.length - 2} ещё
            </button>
          )}
        </div>
      )}

      {/* Кнопки действий */}
      {(onViewLogs || (onRepeat && canRepeat)) && (
        <div className="status-completion-actions">
          {onRepeat && canRepeat && (
            <button className="status-completion-repeat" onClick={onRepeat}>
              ↻ Повторить
            </button>
          )}
          {onViewLogs && (
            <button className="status-completion-link" onClick={onViewLogs}>
              Смотреть логи
            </button>
          )}
        </div>
      )}
    </div>
  );
});

CompletionCard.displayName = 'CompletionCard';
