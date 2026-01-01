import React, { memo } from 'react';
import { TabType } from '../types';
import { ImportIcon, LogsIcon, StarIcon } from './Icons';

interface HeaderProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  errorCount?: number;
  isLoading?: boolean;
  onWhatsNewClick?: () => void;
  showWhatsNewBadge?: boolean;
}

export const Header: React.FC<HeaderProps> = memo(({ 
  activeTab, 
  onTabChange, 
  errorCount,
  isLoading,
  onWhatsNewClick,
  showWhatsNewBadge 
}) => {
  const tabs: { id: TabType; icon: React.ReactNode; label: string; shortcut: string }[] = [
    { 
      id: 'import', 
      label: 'Импорт',
      shortcut: '1',
      icon: <ImportIcon />
    },
    { 
      id: 'logs', 
      label: 'Логи',
      shortcut: '2',
      icon: <LogsIcon />
    }
  ];

  return (
    <footer className="app-toolbar">
      {tabs.map(tab => (
        <button
          key={tab.id}
          className={`app-toolbar-btn ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onTabChange(tab.id)}
          disabled={isLoading}
          title={`${tab.label} (${tab.shortcut})`}
          aria-label={`${tab.label} (${tab.shortcut})`}
          aria-current={activeTab === tab.id ? 'page' : undefined}
        >
          {tab.icon}
          <span className="app-toolbar-label">{tab.label}</span>
          {tab.id === 'logs' && errorCount !== undefined && errorCount > 0 && (
            <span className="app-toolbar-badge">{errorCount}</span>
          )}
        </button>
      ))}
      
      {/* What's New button */}
      {onWhatsNewClick && (
        <button
          className={`app-toolbar-btn whats-new-trigger ${showWhatsNewBadge ? 'has-update' : ''}`}
          onClick={onWhatsNewClick}
          title="Что нового"
          aria-label="Что нового"
        >
          <StarIcon />
          <span className="app-toolbar-label">Новое</span>
          {showWhatsNewBadge && <span className="app-toolbar-dot" />}
        </button>
      )}
    </footer>
  );
});

Header.displayName = 'Header';
