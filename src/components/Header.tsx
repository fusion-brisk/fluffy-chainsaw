import React, { memo } from 'react';
import { TabType } from '../types';
import { ImportIcon, SettingsIcon, LogsIcon, StarIcon } from './Icons';

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
      label: 'Import',
      shortcut: '1',
      icon: <ImportIcon />
    },
    { 
      id: 'settings', 
      label: 'Settings',
      shortcut: '2',
      icon: <SettingsIcon />
    },
    { 
      id: 'logs', 
      label: 'Logs',
      shortcut: '3',
      icon: <LogsIcon />
    }
  ];

  return (
    <header className="app-header">
      <div className="app-header-left">
        <span className="app-mark" aria-hidden="true" />
        <div className="app-title-stack">
          <h1 className="app-title">
            EProductSnippet
          </h1>
          {isLoading && <span className="app-status">Working…</span>}
        </div>
      </div>
      
      <nav className="app-nav">
        {/* What's New button */}
        {onWhatsNewClick && (
          <button
            className={`app-nav-item whats-new-trigger ${showWhatsNewBadge ? 'has-update' : ''}`}
            onClick={onWhatsNewClick}
            title="Что нового"
            aria-label="Что нового"
          >
            <StarIcon />
            {showWhatsNewBadge && <span className="app-nav-dot" />}
          </button>
        )}
        
        {/* Divider */}
        {onWhatsNewClick && <div className="app-nav-divider" />}
        
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`app-nav-item ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => onTabChange(tab.id)}
            disabled={isLoading}
            title={`${tab.label} (${tab.shortcut})`}
            aria-label={`${tab.label} (${tab.shortcut})`}
            aria-current={activeTab === tab.id ? 'page' : undefined}
          >
            {tab.icon}
            {tab.id === 'logs' && errorCount !== undefined && errorCount > 0 && (
              <span className="app-nav-badge">{errorCount}</span>
            )}
          </button>
        ))}
      </nav>
    </header>
  );
});

Header.displayName = 'Header';
