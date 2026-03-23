/**
 * StatusBar — Compact connection status indicators
 *
 * Shows Relay and Extension connection status as pills in top-right corner.
 * When all connected: compact "Все ОК ✓" that expands on hover.
 * When any disconnected: always expanded with problem items highlighted.
 */

import React, { memo, useState } from 'react';

interface StatusBarProps {
  relayConnected: boolean;
  extensionInstalled: boolean;
  mcpConnected?: boolean;
  onRelayClick?: () => void;
  onExtensionClick?: () => void;
  onLogsClick?: () => void;
  onInspectorClick?: () => void;
}

type StatusType = 'connected' | 'offline' | 'active' | 'setup';

interface StatusPillProps {
  label: string;
  tooltip?: string;
  status: StatusType;
  onClick?: () => void;
}

const StatusPill: React.FC<StatusPillProps> = memo(({ label, tooltip, status, onClick }) => {
  const isClickable = !!onClick;

  const getStatusIcon = () => {
    switch (status) {
      case 'connected':
      case 'active':
        return '●';
      case 'setup':
        return '⚠';
      case 'offline':
      default:
        return '○';
    }
  };

  const getStatusLabel = () => {
    switch (status) {
      case 'connected':
        return 'Подключён';
      case 'active':
        return 'Активно';
      case 'setup':
        return 'Настроить';
      case 'offline':
      default:
        return 'Офлайн';
    }
  };

  return (
    <button
      type="button"
      className={`status-pill status-pill--${status} ${isClickable ? 'status-pill--clickable' : ''}`}
      onClick={isClickable ? onClick : undefined}
      disabled={!isClickable}
      aria-label={`${label}: ${getStatusLabel()}`}
      title={tooltip}
    >
      <span className="status-pill-icon">{getStatusIcon()}</span>
      <span className="status-pill-label">{label}</span>
    </button>
  );
});

StatusPill.displayName = 'StatusPill';

export const StatusBar: React.FC<StatusBarProps> = memo(({
  relayConnected,
  extensionInstalled,
  mcpConnected,
  onRelayClick,
  onExtensionClick,
  onLogsClick,
  onInspectorClick
}) => {
  const allGood = relayConnected && extensionInstalled;
  const [expanded, setExpanded] = useState(false);

  // When something is disconnected, always show full pills
  const showPills = !allGood || expanded;

  return (
    <div
      className="status-bar"
      onMouseEnter={() => { if (allGood) setExpanded(true); }}
      onMouseLeave={() => setExpanded(false)}
    >
      {onInspectorClick && (
        <button
          type="button"
          className="status-pill status-pill--log status-pill--clickable"
          onClick={onInspectorClick}
          aria-label="Инспектор компонентов"
        >
          <span className="status-pill-icon" style={{ fontSize: '10px' }}>&#9881;</span>
          <span className="status-pill-label">Инспектор</span>
        </button>
      )}
      {onLogsClick && (
        <button
          type="button"
          className="status-pill status-pill--log status-pill--clickable"
          onClick={onLogsClick}
          aria-label="Просмотр логов"
        >
          <span className="status-pill-icon" style={{ fontSize: '10px' }}>&#9776;</span>
          <span className="status-pill-label">Логи</span>
        </button>
      )}

      {/* Compact "all OK" badge — only when everything connected and not hovered */}
      {allGood && !showPills && (
        <span className="status-bar-ok">Все ОК ✓</span>
      )}

      {/* Full pills — always shown when disconnected, on hover when all OK */}
      {showPills && (
        <>
          {mcpConnected !== undefined && (
            <StatusPill
              label="MCP"
              tooltip={mcpConnected
                ? 'Подключение к Claude Code / Cursor'
                : 'Не подключён. Запустите figma-console-mcp в Claude Code или Cursor'}
              status={mcpConnected ? 'connected' : 'offline'}
            />
          )}
          <StatusPill
            label="Relay"
            tooltip="Сервер передачи данных"
            status={relayConnected ? 'connected' : 'offline'}
            onClick={onRelayClick}
          />
          <StatusPill
            label="Расширение"
            tooltip="Chrome-расширение для парсинга SERP"
            status={extensionInstalled ? 'active' : 'setup'}
            onClick={onExtensionClick}
          />
        </>
      )}
    </div>
  );
});

StatusBar.displayName = 'StatusBar';
