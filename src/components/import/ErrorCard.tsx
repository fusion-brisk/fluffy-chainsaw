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
      {/* Заголовок с кнопкой закрытия */}
      <div className="status-error-header">
        <div className="status-error-badge">
          <span className="status-error-icon">
            <WarningIcon />
          </span>
          <span className="status-error-text">Ошибка</span>
        </div>
        {onDismiss && (
          <button 
            className="status-error-close" 
            onClick={onDismiss}
            title="Закрыть"
          >
            ×
          </button>
        )}
      </div>

      {/* Сообщение об ошибке */}
      <div className="status-error-message">
        {message}
      </div>

      {/* Детали, если есть */}
      {details && (
        <div className="status-error-details">
          {details}
        </div>
      )}

      {/* Действия */}
      {onViewLogs && (
        <div className="status-error-actions">
          <button className="status-error-link" onClick={onViewLogs}>
            Смотреть логи
          </button>
        </div>
      )}
    </div>
  );
});

ErrorCard.displayName = 'ErrorCard';
