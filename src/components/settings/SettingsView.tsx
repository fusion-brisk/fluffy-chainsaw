import React, { useState, useMemo, useEffect, memo } from 'react';
import { ParsingRulesMetadata } from '../../types';
import { debounce } from '../../utils';

interface SettingsViewProps {
  remoteUrl: string;
  onUpdateUrl: (url: string) => void;
  parsingRulesMetadata: ParsingRulesMetadata | null;
  onRefreshRules: () => void;
  onResetCache: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = memo(({
  remoteUrl,
  onUpdateUrl,
  parsingRulesMetadata,
  onRefreshRules,
  onResetCache
}) => {
  const [localUrl, setLocalUrl] = useState(remoteUrl);
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [debouncedFilter, setDebouncedFilter] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'json'>('table');
  
  // Debounced filter update
  const updateDebouncedFilter = useMemo(
    () => debounce((text: string) => setDebouncedFilter(text), 150),
    []
  );
  
  // Update debounced filter when text changes
  useEffect(() => {
    updateDebouncedFilter(filterText);
  }, [filterText, updateDebouncedFilter]);

  React.useEffect(() => {
    setLocalUrl(remoteUrl);
  }, [remoteUrl]);

  const handleSaveUrl = () => {
    onUpdateUrl(localUrl.trim());
    setIsEditingUrl(false);
  };

  const handleCancelUrl = () => {
    setLocalUrl(remoteUrl);
    setIsEditingUrl(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveUrl();
    } else if (e.key === 'Escape') {
      handleCancelUrl();
    }
  };

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
      case 'remote': return '↗';
      case 'cached': return '•';
      case 'embedded': return '○';
      default: return '?';
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

  const rules = parsingRulesMetadata?.rules;
  const filteredRules = useMemo(() => {
    if (!rules) return [];
    return Object.entries(rules.rules).filter(([key]) => 
      key.toLowerCase().includes(debouncedFilter.toLowerCase())
    );
  }, [rules, debouncedFilter]);

  const renderTableView = () => (
    <div className="settings-rules-table">
      <div className="settings-rules-table-header">
        <div className="settings-rules-cell">Field</div>
        <div className="settings-rules-cell">Selectors</div>
        <div className="settings-rules-cell">Type</div>
      </div>
      <div className="settings-rules-table-body">
        {filteredRules.map(([fieldName, rule]) => (
          <div key={fieldName} className="settings-rules-table-row">
            <div className="settings-rules-cell settings-rules-field">
              {fieldName}
            </div>
            <div className="settings-rules-cell">
              {rule.domSelectors.length > 0 ? (
                <span className="settings-rules-count">
                  {rule.domSelectors.length} selector{rule.domSelectors.length > 1 ? 's' : ''}
                </span>
              ) : (
                <span className="settings-rules-empty">—</span>
              )}
            </div>
            <div className="settings-rules-cell">
              <span className="settings-rules-type-badge">
                {rule.type || 'text'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderJsonView = () => (
    <pre className="settings-rules-json">
      {JSON.stringify(rules, null, 2)}
    </pre>
  );

  return (
    <div className="settings-view">
      {/* Remote Config Section */}
      <section className="settings-section">
        <div className="settings-section-header">
          <h3 className="settings-section-title">Remote Config</h3>
        </div>
        
        <div className="settings-section-content">
          <label className="settings-label">
            GitHub Raw URL:
          </label>
          
          {isEditingUrl ? (
            <div className="settings-url-edit">
              <input
                type="text"
                className="settings-url-input"
                value={localUrl}
                onChange={(e) => setLocalUrl(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="https://raw.githubusercontent.com/..."
                autoFocus
              />
              <div className="settings-url-actions">
                <button
                  className="settings-btn settings-btn-primary"
                  onClick={handleSaveUrl}
                >
                  Save
                </button>
                <button
                  className="settings-btn"
                  onClick={handleCancelUrl}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="settings-url-display">
              <div className="settings-url-value" title={remoteUrl}>
                {remoteUrl || <span className="settings-url-empty">Not configured</span>}
              </div>
              <button
                className="settings-btn settings-btn-icon"
                onClick={() => setIsEditingUrl(true)}
                title="Edit"
              >
                Edit
              </button>
            </div>
          )}
          
          <div className="settings-hint">
            URL to parsing-rules.json for automatic updates
          </div>
        </div>
      </section>

      {/* Parsing Rules Section */}
      {parsingRulesMetadata && (
        <section className="settings-section">
          <div className="settings-section-header">
            <h3 className="settings-section-title">
              Parsing Rules
              <span className="settings-version-badge">v{rules?.version}</span>
            </h3>
            <div className="settings-section-actions">
              <button 
                className="settings-btn" 
                onClick={onRefreshRules}
                title="Check for updates"
              >
                Refresh
              </button>
              {parsingRulesMetadata.source !== 'embedded' && (
                <button 
                  className="settings-btn settings-btn-danger" 
                  onClick={onResetCache}
                  title="Reset to defaults"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          <div className="settings-section-content">
            {/* Metadata */}
            <div className="settings-rules-metadata">
              <div className="settings-rules-meta-row">
                <span className="settings-rules-meta-label">Source:</span>
                <span className="settings-rules-meta-value">
                  {getSourceIcon(parsingRulesMetadata.source)} {getSourceLabel(parsingRulesMetadata.source)}
                </span>
              </div>
              <div className="settings-rules-meta-row">
                <span className="settings-rules-meta-label">Updated:</span>
                <span className="settings-rules-meta-value">
                  {formatDate(parsingRulesMetadata.lastUpdated)}
                </span>
              </div>
              {parsingRulesMetadata.remoteUrl && (
                <div className="settings-rules-meta-row">
                  <span className="settings-rules-meta-label">URL:</span>
                  <span className="settings-rules-meta-value settings-rules-meta-url" title={parsingRulesMetadata.remoteUrl}>
                    {parsingRulesMetadata.remoteUrl}
                  </span>
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="settings-rules-controls">
              <input
                type="text"
                className="settings-rules-filter"
                placeholder="Filter fields..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
              />
              <div className="settings-rules-view-toggle">
                <button
                  className={`settings-rules-view-btn ${viewMode === 'table' ? 'active' : ''}`}
                  onClick={() => setViewMode('table')}
                >
                  Table
                </button>
                <button
                  className={`settings-rules-view-btn ${viewMode === 'json' ? 'active' : ''}`}
                  onClick={() => setViewMode('json')}
                >
                  JSON
                </button>
              </div>
            </div>

            {/* Rules Display */}
            <div className="settings-rules-body">
              {viewMode === 'table' ? renderTableView() : renderJsonView()}
            </div>

            <div className="settings-rules-footer">
              {filteredRules.length} of {rules ? Object.keys(rules.rules).length : 0} fields
            </div>
          </div>
        </section>
      )}
    </div>
  );
});

SettingsView.displayName = 'SettingsView';
