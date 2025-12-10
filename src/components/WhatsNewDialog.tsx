import React from 'react';
import { CHANGELOG, ChangelogEntry } from '../config';

interface WhatsNewDialogProps {
  currentVersion: string;
  onClose: () => void;
}

export const WhatsNewDialog: React.FC<WhatsNewDialogProps> = ({
  currentVersion,
  onClose
}) => {
  // Показываем только последние 3 версии
  const recentChanges = CHANGELOG.slice(0, 3);

  const getTypeIcon = (type: ChangelogEntry['type']): string => {
    switch (type) {
      case 'major': return '🚀';
      case 'feature': return '✨';
      case 'fix': return '🐛';
      case 'improvement': return '💡';
      default: return '📦';
    }
  };

  const getTypeBadgeClass = (type: ChangelogEntry['type']): string => {
    switch (type) {
      case 'major': return 'whats-new-badge-major';
      case 'feature': return 'whats-new-badge-feature';
      case 'fix': return 'whats-new-badge-fix';
      case 'improvement': return 'whats-new-badge-improvement';
      default: return '';
    }
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  return (
    <div className="whats-new-overlay" onClick={onClose}>
      <div className="whats-new-dialog" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="whats-new-header">
          <div className="whats-new-header-content">
            <span className="whats-new-icon">🎉</span>
            <div className="whats-new-header-text">
              <h2 className="whats-new-title">Что нового</h2>
              <span className="whats-new-version">Версия {currentVersion}</span>
            </div>
          </div>
          <button 
            className="whats-new-close" 
            onClick={onClose}
            title="Закрыть"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="whats-new-content">
          {recentChanges.map((entry, index) => (
            <div 
              key={entry.version} 
              className={`whats-new-entry ${index === 0 ? 'whats-new-entry-latest' : ''}`}
            >
              <div className="whats-new-entry-header">
                <div className="whats-new-entry-title-row">
                  <span className="whats-new-entry-icon">{getTypeIcon(entry.type)}</span>
                  <span className="whats-new-entry-title">{entry.title}</span>
                  {index === 0 && (
                    <span className="whats-new-new-badge">NEW</span>
                  )}
                </div>
                <div className="whats-new-entry-meta">
                  <span className={`whats-new-type-badge ${getTypeBadgeClass(entry.type)}`}>
                    v{entry.version}
                  </span>
                  <span className="whats-new-entry-date">{formatDate(entry.date)}</span>
                </div>
              </div>
              
              <ul className="whats-new-highlights">
                {entry.highlights.map((highlight, hIndex) => (
                  <li key={hIndex} className="whats-new-highlight">
                    {highlight}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="whats-new-footer">
          <button className="whats-new-btn-primary" onClick={onClose}>
            Понятно, спасибо!
          </button>
        </div>
      </div>
    </div>
  );
};
