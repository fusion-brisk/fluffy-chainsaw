import React from 'react';

interface LogViewerProps {
  logs: string[];
  showLogs: boolean;
  onToggleLogs: () => void;
  onClearLogs: () => void;
  onCopyLogs: () => void;
}

export const LogViewer: React.FC<LogViewerProps> = ({ 
  logs, 
  showLogs, 
  onToggleLogs, 
  onClearLogs, 
  onCopyLogs 
}) => {
  return (
    <div className="logs-drawer">
      <div className="logs-header" onClick={onToggleLogs}>
        <span className="text-small font-medium">Log ({logs.length})</span>
        <span className="text-small">{showLogs ? 'Hide' : 'Show'}</span>
      </div>
      
      <div className={`logs-content ${showLogs ? 'open' : ''}`}>
        {logs.map((log, index) => (
          <div key={index} className={`log-entry ${log.includes('❌') ? 'error' : ''} ${log.includes('✅') ? 'success' : ''}`}>
            {log}
          </div>
        ))}
        
        {logs.length > 0 && (
          <div className="logs-actions">
            <button onClick={onCopyLogs}>Copy</button>
            <button onClick={onClearLogs}>Clear</button>
          </div>
        )}
      </div>
    </div>
  );
};

