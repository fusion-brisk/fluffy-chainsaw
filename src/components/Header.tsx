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
  const tabs: { id: TabType; icon: React.ReactNode; label: string }[] = [
    { 
      id: 'import', 
      label: 'Import',
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 2v8M8 2L5 5M8 2l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M3 10v3a1 1 0 001 1h8a1 1 0 001-1v-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      )
    },
    { 
      id: 'settings', 
      label: 'Settings',
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M8 1v2M8 13v2M1 8h2M13 8h2M2.93 2.93l1.41 1.41M11.66 11.66l1.41 1.41M2.93 13.07l1.41-1.41M11.66 4.34l1.41-1.41" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      )
    },
    { 
      id: 'logs', 
      label: 'Logs',
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M5 6h6M5 8h6M5 10h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      )
    }
  ];

  return (
    <header className="app-header">
      <div className="app-header-left">
        <h1 className="app-title">Contentify</h1>
        {isLoading && <span className="app-status">Working...</span>}
      </div>
      
      <nav className="app-nav">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`app-nav-item ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => onTabChange(tab.id)}
            disabled={isLoading}
            title={tab.label}
            aria-label={tab.label}
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
};
