import React, { useState, useMemo } from 'react';

interface LogsViewProps {
  logs: string[];
  onClearLogs: () => void;
  onCopyLogs: () => void;
}

type LogFilter = 'all' | 'errors' | 'warnings' | 'success' | 'info';

export const LogsView: React.FC<LogsViewProps> = ({ 
  logs, 
  onClearLogs, 
  onCopyLogs 
}) => {
  const [activeFilter, setActiveFilter] = useState<LogFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter logs based on selected filter
  const filteredLogs = useMemo(() => {
    let filtered = logs;

    // Apply category filter
    if (activeFilter !== 'all') {
      filtered = filtered.filter(log => {
        switch (activeFilter) {
          case 'errors':
            return log.includes('❌') || log.toLowerCase().includes('error');
          case 'warnings':
            return log.includes('⚠️') || log.toLowerCase().includes('warning') || log.toLowerCase().includes('warn');
          case 'success':
            return log.includes('✅') || log.toLowerCase().includes('success') || log.toLowerCase().includes('готово');
          case 'info':
            return log.includes('ℹ️') || log.includes('📂') || log.includes('📄') || log.includes('🔍');
          default:
            return true;
        }
      });
    }

    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(log => log.toLowerCase().includes(query));
    }

    return filtered;
  }, [logs, activeFilter, searchQuery]);

  // Count logs by category
  const counts = useMemo(() => {
    return {
      all: logs.length,
      errors: logs.filter(log => log.includes('❌') || log.toLowerCase().includes('error')).length,
      warnings: logs.filter(log => log.includes('⚠️') || log.toLowerCase().includes('warning')).length,
      success: logs.filter(log => log.includes('✅') || log.toLowerCase().includes('success')).length,
      info: logs.filter(log => log.includes('ℹ️') || log.includes('📂') || log.includes('📄')).length
    };
  }, [logs]);

  const getLogClass = (log: string): string => {
    if (log.includes('❌') || log.toLowerCase().includes('error')) return 'error';
    if (log.includes('⚠️') || log.toLowerCase().includes('warning')) return 'warning';
    if (log.includes('✅') || log.toLowerCase().includes('success')) return 'success';
    return '';
  };

  return (
    <div className="logs-view">
      {/* Header with controls */}
      <div className="logs-view-header">
        <div className="logs-view-title">
          📊 Logs
          <span className="logs-view-count">({filteredLogs.length} {filteredLogs.length !== logs.length ? `of ${logs.length}` : ''})</span>
        </div>
        <div className="logs-view-actions">
          <button 
            className="logs-view-btn"
            onClick={onCopyLogs}
            disabled={logs.length === 0}
            title="Copy all logs to clipboard"
          >
            📋 Copy
          </button>
          <button 
            className="logs-view-btn logs-view-btn-danger"
            onClick={onClearLogs}
            disabled={logs.length === 0}
            title="Clear all logs"
          >
            🗑️ Clear
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="logs-view-filters">
        <div className="logs-view-filter-buttons">
          <button
            className={`logs-filter-btn ${activeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setActiveFilter('all')}
          >
            All {counts.all > 0 && <span className="logs-filter-badge">{counts.all}</span>}
          </button>
          <button
            className={`logs-filter-btn ${activeFilter === 'errors' ? 'active' : ''}`}
            onClick={() => setActiveFilter('errors')}
            disabled={counts.errors === 0}
          >
            ❌ Errors {counts.errors > 0 && <span className="logs-filter-badge error">{counts.errors}</span>}
          </button>
          <button
            className={`logs-filter-btn ${activeFilter === 'warnings' ? 'active' : ''}`}
            onClick={() => setActiveFilter('warnings')}
            disabled={counts.warnings === 0}
          >
            ⚠️ Warnings {counts.warnings > 0 && <span className="logs-filter-badge warning">{counts.warnings}</span>}
          </button>
          <button
            className={`logs-filter-btn ${activeFilter === 'success' ? 'active' : ''}`}
            onClick={() => setActiveFilter('success')}
            disabled={counts.success === 0}
          >
            ✅ Success {counts.success > 0 && <span className="logs-filter-badge success">{counts.success}</span>}
          </button>
          <button
            className={`logs-filter-btn ${activeFilter === 'info' ? 'active' : ''}`}
            onClick={() => setActiveFilter('info')}
            disabled={counts.info === 0}
          >
            ℹ️ Info {counts.info > 0 && <span className="logs-filter-badge">{counts.info}</span>}
          </button>
        </div>

        <div className="logs-view-search">
          <input
            type="text"
            className="logs-search-input"
            placeholder="Search logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="logs-search-clear"
              onClick={() => setSearchQuery('')}
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Logs content */}
      <div className="logs-view-content">
        {filteredLogs.length === 0 ? (
          <div className="logs-view-empty">
            {logs.length === 0 ? (
              <>
                <div className="logs-view-empty-icon">📝</div>
                <div className="logs-view-empty-title">No logs yet</div>
                <div className="logs-view-empty-subtitle">
                  Import a file to see processing logs
                </div>
              </>
            ) : (
              <>
                <div className="logs-view-empty-icon">🔍</div>
                <div className="logs-view-empty-title">No logs match your filters</div>
                <div className="logs-view-empty-subtitle">
                  Try changing the filter or search query
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="logs-view-entries">
            {filteredLogs.map((log, index) => (
              <div 
                key={index} 
                className={`logs-view-entry ${getLogClass(log)}`}
              >
                {log}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer with stats */}
      {logs.length > 0 && (
        <div className="logs-view-footer">
          <div className="logs-view-stats">
            <span className="logs-view-stat">
              Total: {logs.length}
            </span>
            {counts.errors > 0 && (
              <span className="logs-view-stat error">
                Errors: {counts.errors}
              </span>
            )}
            {counts.warnings > 0 && (
              <span className="logs-view-stat warning">
                Warnings: {counts.warnings}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
