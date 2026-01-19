/**
 * SuccessView — Success state after artboard creation
 * 
 * Shows animated success icon with celebration message.
 * Auto-dismisses after a delay.
 */

import React, { memo, useEffect } from 'react';
import { SuccessIcon } from './Icons';

interface SuccessViewProps {
  query?: string;
  onComplete?: () => void;
  autoCloseDelay?: number;
}

export const SuccessView: React.FC<SuccessViewProps> = memo(({ 
  query,
  onComplete,
  autoCloseDelay = 3000
}) => {
  useEffect(() => {
    if (onComplete && autoCloseDelay > 0) {
      const timer = setTimeout(onComplete, autoCloseDelay);
      return () => clearTimeout(timer);
    }
  }, [onComplete, autoCloseDelay]);

  return (
    <div className="success-view">
      <div className="success-view-icon">
        <SuccessIcon className="success-icon-svg" />
      </div>
      
      <h2 className="success-view-title">Артборд создан!</h2>
      
      <p className="success-view-desc">
        {query 
          ? `Макет для «${query}» добавлен на ваш холст`
          : 'Макет поисковой выдачи добавлен на ваш холст'
        }
      </p>
    </div>
  );
});

SuccessView.displayName = 'SuccessView';
