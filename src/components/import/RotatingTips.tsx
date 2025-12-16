import React, { useState, useEffect, useMemo, memo } from 'react';
import { CHANGELOG } from '../../config';

interface RotatingTipsProps {
  intervalMs?: number; // Интервал переключения в мс (по умолчанию 5 секунд)
}

export const RotatingTips: React.FC<RotatingTipsProps> = memo(({
  intervalMs = 5000
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  // Собираем все highlights из последних версий в плоский массив
  const allTips = useMemo(() => {
    const tips: { text: string; version: string }[] = [];
    
    // Берём последние 3 версии
    CHANGELOG.slice(0, 3).forEach(entry => {
      entry.highlights.forEach(highlight => {
        tips.push({
          text: highlight,
          version: entry.version
        });
      });
    });
    
    return tips;
  }, []);

  // Циклическое переключение подсказок
  useEffect(() => {
    if (allTips.length <= 1) return;

    const interval = setInterval(() => {
      setIsAnimating(true);
      
      // Небольшая задержка для анимации исчезновения
      setTimeout(() => {
        setCurrentIndex(prev => (prev + 1) % allTips.length);
        setIsAnimating(false);
      }, 200);
    }, intervalMs);

    return () => clearInterval(interval);
  }, [allTips.length, intervalMs]);

  if (allTips.length === 0) {
    return null;
  }

  const currentTip = allTips[currentIndex];

  return (
    <div className="rotating-tips">
      <div className="rotating-tips-icon">✨</div>
      <div className={`rotating-tips-content ${isAnimating ? 'fade-out' : 'fade-in'}`}>
        <span className="rotating-tips-text">{currentTip.text}</span>
        <span className="rotating-tips-version">v{currentTip.version}</span>
      </div>
    </div>
  );
});

RotatingTips.displayName = 'RotatingTips';

