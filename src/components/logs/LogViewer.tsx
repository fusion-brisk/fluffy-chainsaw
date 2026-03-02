/**
 * LogViewer — Scrollable log message viewer with filtering and export
 *
 * Receives log messages collected by the UI thread from code thread postMessage.
 * Provides level filtering, JSON export, and clear functionality.
 */

import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { LogLevel } from '../../logger';

export interface LogMessage {
  level: LogLevel;
  message: string;
  timestamp: number;
}

interface LogViewerProps {
  messages: LogMessage[];
  onClose: () => void;
  onClear: () => void;
}

const LEVEL_LABELS: Record<number, string> = {
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.SUMMARY]: 'INFO',
  [LogLevel.VERBOSE]: 'VERBOSE',
  [LogLevel.DEBUG]: 'DEBUG',
};

const LEVEL_CSS: Record<number, string> = {
  [LogLevel.ERROR]: 'log-viewer-entry--error',
  [LogLevel.SUMMARY]: 'log-viewer-entry--summary',
  [LogLevel.VERBOSE]: 'log-viewer-entry--verbose',
  [LogLevel.DEBUG]: 'log-viewer-entry--debug',
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export const LogViewer: React.FC<LogViewerProps> = memo(({ messages, onClose, onClear }) => {
  const [minLevel, setMinLevel] = useState<LogLevel>(LogLevel.SUMMARY);
  const listRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  const filtered = messages.filter(m => m.level <= minLevel);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (autoScrollRef.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [filtered.length]);

  // Detect manual scroll to disable auto-scroll
  const handleScroll = useCallback(() => {
    if (!listRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 30;
  }, []);

  const handleExport = useCallback(() => {
    const json = JSON.stringify(filtered, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contentify-logs-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered]);

  return (
    <div className="log-viewer">
      {/* Header */}
      <div className="log-viewer-header">
        <button
          type="button"
          className="btn-back-pill"
          onClick={onClose}
        >
          &larr; Back
        </button>
        <span className="log-viewer-title">Logs</span>
        <span className="log-viewer-count">{filtered.length}</span>
      </div>

      {/* Toolbar */}
      <div className="log-viewer-toolbar">
        <select
          className="scope-select log-viewer-filter"
          value={minLevel}
          onChange={e => setMinLevel(Number(e.target.value) as LogLevel)}
        >
          <option value={LogLevel.ERROR}>Errors only</option>
          <option value={LogLevel.SUMMARY}>Summary+</option>
          <option value={LogLevel.VERBOSE}>Verbose+</option>
          <option value={LogLevel.DEBUG}>All (Debug)</option>
        </select>
        <div className="log-viewer-actions">
          <button type="button" className="btn-text-sm" onClick={handleExport}>
            Export JSON
          </button>
          <button type="button" className="btn-text-sm" onClick={onClear}>
            Clear
          </button>
        </div>
      </div>

      {/* Log list */}
      <div
        className="log-viewer-list"
        ref={listRef}
        onScroll={handleScroll}
      >
        {filtered.length === 0 ? (
          <div className="log-viewer-empty">No log messages</div>
        ) : (
          filtered.map((msg, i) => (
            <div
              key={i}
              className={`log-viewer-entry ${LEVEL_CSS[msg.level] || ''}`}
            >
              <span className="log-viewer-entry-time">{formatTime(msg.timestamp)}</span>
              <span className="log-viewer-entry-level">{LEVEL_LABELS[msg.level] || '?'}</span>
              <span className="log-viewer-entry-msg">{msg.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
});

LogViewer.displayName = 'LogViewer';
