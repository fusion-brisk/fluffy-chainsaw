import React, { useState, useMemo, useEffect, useRef, useCallback, memo } from 'react';
import { debounce } from '../../utils';
import { VirtualList } from '../VirtualList';

interface LogsViewProps {
  logs: string[];
  onClearLogs: () => void;
  onCopyLogs: () => void;
}

type LogFilter = 'all' | 'errors' | 'warnings' | 'success';

// Threshold for switching to virtual scroll
const VIRTUAL_SCROLL_THRESHOLD = 100;
const LOG_ITEM_HEIGHT = 28; // Height of each log entry in pixels

export const LogsView: React.FC<LogsViewProps> = memo(({
  logs,
  onClearLogs,
  onCopyLogs
}) => {
  const [activeFilter, setActiveFilter] = useState<LogFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [containerHeight, setContainerHeight] = useState(300);
  
  // Debounced search update
  const updateDebouncedQuery = useMemo(
    () => debounce((query: string) => setDebouncedQuery(query), 150),
    []
  );
  
  // Update debounced query when search changes
  useEffect(() => {
    updateDebouncedQuery(searchQuery);
  }, [searchQuery, updateDebouncedQuery]);

  // Auto-scroll functionality (for non-virtual mode)
  const logsContainerRef = useRef<HTMLDivElement>(null);
  
  // Measure container height for virtual scroll
  const containerWrapperRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const updateHeight = () => {
      if (containerWrapperRef.current) {
        const rect = containerWrapperRef.current.getBoundingClientRect();
        setContainerHeight(Math.max(200, rect.height - 20)); // -20 for padding
      }
    };
    
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  // Filter logs based on selected filter (uses debounced query for search)
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
          default:
            return true;
        }
      });
    }

    // Apply debounced search query
    if (debouncedQuery.trim()) {
      const query = debouncedQuery.toLowerCase();
      filtered = filtered.filter(log => log.toLowerCase().includes(query));
    }

    return filtered;
  }, [logs, activeFilter, debouncedQuery]);

  // Count logs by category
  const counts = useMemo(() => {
    return {
      all: logs.length,
      errors: logs.filter(log => log.includes('❌') || log.toLowerCase().includes('error')).length,
      warnings: logs.filter(log => log.includes('⚠️') || log.toLowerCase().includes('warning')).length,
      success: logs.filter(log => log.includes('✅') || log.toLowerCase().includes('success') || log.toLowerCase().includes('готово')).length
    };
  }, [logs]);

  // Decide whether to use virtual scroll
  const useVirtualScroll = filteredLogs.length > VIRTUAL_SCROLL_THRESHOLD;

  // Auto-scroll to bottom when new logs arrive (only for non-virtual mode)
  useEffect(() => {
    if (!useVirtualScroll && logsContainerRef.current && filteredLogs.length > 0) {
      const container = logsContainerRef.current;
      // Scroll to bottom with smooth animation for better UX
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [filteredLogs, useVirtualScroll]);

  const getLogClass = useCallback((log: string): string => {
    if (log.includes('❌') || log.toLowerCase().includes('error')) return 'error';
    if (log.includes('⚠️') || log.toLowerCase().includes('warning')) return 'warning';
    if (log.includes('✅') || log.toLowerCase().includes('success')) return 'success';
    return '';
  }, []);
  
  // Render function for virtual list
  const renderLogItem = useCallback((log: string, index: number) => (
    <div className={`logs-view-entry ${getLogClass(log)}`}>
      {log}
    </div>
  ), [getLogClass]);

  return (
    <div className="logs-view">
      {/* Header with controls */}
      <div className="logs-view-header">
        <div className="logs-view-title">
          Logs
          <span className="logs-view-count">({filteredLogs.length}{filteredLogs.length !== logs.length ? ` of ${logs.length}` : ''})</span>
        </div>
        <div className="logs-view-actions">
          <button 
            className="logs-view-btn"
            onClick={onCopyLogs}
            disabled={logs.length === 0}
            title="Copy all logs to clipboard"
          >
            Copy
          </button>
          <button 
            className="logs-view-btn logs-view-btn-danger"
            onClick={onClearLogs}
            disabled={logs.length === 0}
            title="Clear all logs"
          >
            Clear
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
            Errors {counts.errors > 0 && <span className="logs-filter-badge">{counts.errors}</span>}
          </button>
          <button
            className={`logs-filter-btn ${activeFilter === 'warnings' ? 'active' : ''}`}
            onClick={() => setActiveFilter('warnings')}
            disabled={counts.warnings === 0}
          >
            Warnings {counts.warnings > 0 && <span className="logs-filter-badge">{counts.warnings}</span>}
          </button>
          <button
            className={`logs-filter-btn ${activeFilter === 'success' ? 'active' : ''}`}
            onClick={() => setActiveFilter('success')}
            disabled={counts.success === 0}
          >
            Success {counts.success > 0 && <span className="logs-filter-badge">{counts.success}</span>}
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
      <div className="logs-view-content" ref={containerWrapperRef}>
        {filteredLogs.length === 0 ? (
          <div className="logs-view-empty">
            {logs.length === 0 ? (
              <>
                <div className="logs-view-empty-icon">—</div>
                <div className="logs-view-empty-title">No logs yet</div>
                <div className="logs-view-empty-subtitle">
                  Import a file to see processing logs
                </div>
              </>
            ) : (
              <>
                <div className="logs-view-empty-icon">—</div>
                <div className="logs-view-empty-title">No matching logs</div>
                <div className="logs-view-empty-subtitle">
                  Try changing the filter or search query
                </div>
              </>
            )}
          </div>
        ) : useVirtualScroll ? (
          /* Virtual scroll for large log lists */
          <VirtualList
            items={filteredLogs}
            itemHeight={LOG_ITEM_HEIGHT}
            containerHeight={containerHeight}
            renderItem={renderLogItem}
            overscan={10}
            className="logs-view-virtual"
            autoScrollToBottom={true}
          />
        ) : (
          /* Regular rendering for small lists */
          <div className="logs-view-entries" ref={logsContainerRef}>
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
});

LogsView.displayName = 'LogsView';
