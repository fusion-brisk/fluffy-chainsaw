import React from 'react';
import { TabType } from '../types';

interface HeaderProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  errorCount?: number;
  isLoading?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ 
  activeTab, 
  onTabChange, 
  errorCount,
  isLoading 
}) => {
  const tabs = [
    { id: 'import' as TabType, label: 'Import', icon: '📋', shortcut: '1' },
    { id: 'settings' as TabType, label: 'Settings', icon: '⚙️', shortcut: '2' },
    { id: 'logs' as TabType, label: 'Logs', icon: '📊', badge: errorCount, shortcut: '3' }
  ];

  return (
    <div className="header">
      <div className="header-title">
        <h2>Contentify</h2>
        {isLoading && <span className="header-status">Working...</span>}
      </div>
      <div className="header-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`header-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => onTabChange(tab.id)}
            disabled={isLoading}
            title={`${tab.label} (Press ${tab.shortcut})`}
            aria-label={`${tab.label} tab`}
            aria-current={activeTab === tab.id ? 'page' : undefined}
          >
            <span className="tab-icon">{tab.icon}</span>
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className="tab-badge" aria-label={`${tab.badge} errors`}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

