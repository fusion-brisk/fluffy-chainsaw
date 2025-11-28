import React, { useState } from 'react';
import { ParsingRulesMetadata } from '../types';

interface ParsingRulesViewerProps {
  metadata: ParsingRulesMetadata | null;
  showRules: boolean;
  onToggleRules: () => void;
  onRefreshRules: () => void;
  onResetCache: () => void;
}

export const ParsingRulesViewer: React.FC<ParsingRulesViewerProps> = ({
  metadata,
  showRules,
  onToggleRules,
  onRefreshRules,
  onResetCache
}) => {
  const [filterText, setFilterText] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'json'>('table');

  if (!metadata) return null;

  const rules = metadata.rules;
  
  const filteredRules = Object.entries(rules.rules).filter(([key]) => 
    key.toLowerCase().includes(filterText.toLowerCase())
  );

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleString('ru-RU', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getSourceIcon = (source: string): string => {
    switch (source) {
      case 'remote': return '🌐';
      case 'cached': return '💾';
      case 'embedded': return '📦';
      default: return '❓';
    }
  };

  const getSourceLabel = (source: string): string => {
    switch (source) {
      case 'remote': return 'Remote';
      case 'cached': return 'Cached';
      case 'embedded': return 'Embedded';
      default: return 'Unknown';
    }
  };

  const renderTableView = () => (
    <div className="rules-table-container">
      <div className="rules-table-header">
        <div className="rules-table-cell">Field</div>
        <div className="rules-table-cell">DOM Selectors</div>
        <div className="rules-table-cell">JSON Keys</div>
        <div className="rules-table-cell">Type</div>
      </div>
      <div className="rules-table-body">
        {filteredRules.map(([fieldName, rule]) => (
          <div key={fieldName} className="rules-table-row">
            <div className="rules-table-cell rules-field-name">
              {fieldName}
            </div>
            <div className="rules-table-cell">
              {rule.domSelectors.length > 0 ? (
                <ul className="rules-list">
                  {rule.domSelectors.slice(0, 3).map((sel, idx) => (
                    <li key={idx} className="rules-list-item">{sel}</li>
                  ))}
                  {rule.domSelectors.length > 3 && (
                    <li className="rules-list-more">+{rule.domSelectors.length - 3} more...</li>
                  )}
                </ul>
              ) : (
                <span className="rules-empty">—</span>
              )}
            </div>
            <div className="rules-table-cell">
              {rule.jsonKeys.length > 0 ? (
                <ul className="rules-list">
                  {rule.jsonKeys.slice(0, 3).map((key, idx) => (
                    <li key={idx} className="rules-list-item">{key}</li>
                  ))}
                  {rule.jsonKeys.length > 3 && (
                    <li className="rules-list-more">+{rule.jsonKeys.length - 3} more...</li>
                  )}
                </ul>
              ) : (
                <span className="rules-empty">—</span>
              )}
            </div>
            <div className="rules-table-cell">
              <span className="rules-type-badge">
                {rule.type || 'text'}
              </span>
              {rule.domAttribute && (
                <span className="rules-attribute">[{rule.domAttribute}]</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderJsonView = () => (
    <pre className="rules-json">
      {JSON.stringify(rules, null, 2)}
    </pre>
  );

  return (
    <div className="rules-drawer">
      <div className="rules-header" onClick={onToggleRules}>
        <span>⚙️ Parsing Rules (v{rules.version})</span>
        <span className="rules-toggle">{showRules ? '▼' : '▲'}</span>
      </div>
      
      {showRules && (
        <div className="rules-content open">
          <div className="rules-metadata">
            <div className="rules-meta-row">
              <span className="rules-meta-label">Source:</span>
              <span className="rules-meta-value">
                {getSourceIcon(metadata.source)} {getSourceLabel(metadata.source)}
              </span>
            </div>
            <div className="rules-meta-row">
              <span className="rules-meta-label">Updated:</span>
              <span className="rules-meta-value">{formatDate(metadata.lastUpdated)}</span>
            </div>
            {metadata.remoteUrl && (
              <div className="rules-meta-row">
                <span className="rules-meta-label">URL:</span>
                <span className="rules-meta-value rules-meta-url" title={metadata.remoteUrl}>
                  {metadata.remoteUrl}
                </span>
              </div>
            )}
          </div>

          <div className="rules-controls">
            <input
              type="text"
              className="rules-filter-input"
              placeholder="Filter fields..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
            />
            <div className="rules-view-toggle">
              <button
                className={`rules-view-btn ${viewMode === 'table' ? 'active' : ''}`}
                onClick={() => setViewMode('table')}
              >
                Table
              </button>
              <button
                className={`rules-view-btn ${viewMode === 'json' ? 'active' : ''}`}
                onClick={() => setViewMode('json')}
              >
                JSON
              </button>
            </div>
            <button 
              className="rules-refresh-btn" 
              onClick={onRefreshRules} 
              title="Check for updates"
            >
              🔄
            </button>
            {metadata.source !== 'embedded' && (
              <button 
                className="rules-reset-btn" 
                onClick={onResetCache} 
                title="Reset to defaults"
              >
                🗑️
              </button>
            )}
          </div>

          <div className="rules-body">
            {viewMode === 'table' ? renderTableView() : renderJsonView()}
          </div>

          <div className="rules-footer">
            <span className="rules-count">
              {filteredRules.length} of {Object.keys(rules.rules).length} fields
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

