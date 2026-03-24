/**
 * StatusBar — Compact connection status indicators
 *
 * Shows connection status as a single indicator with click-to-expand details.
 * Inspector and Logs buttons are icon-only to save space.
 * No hover logic — all interactions are click-based.
 */

import React, { memo, useState } from 'react';

interface StatusBarProps {
  relayConnected: boolean;
  extensionInstalled: boolean;
  mcpConnected?: boolean;
  hasPendingData?: boolean;
  onRelayClick?: () => void;
  onExtensionClick?: () => void;
  onInspectorClick?: () => void;
  onClearQueue?: () => void;
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

/**
 * Find the first problem service for error state display.
 */
function getFirstProblem(
  relayConnected: boolean,
  extensionInstalled: boolean,
  mcpConnected?: boolean
): { name: string; key: 'relay' | 'extension' | 'mcp' } | null {
  if (mcpConnected === false) return { name: 'MCP', key: 'mcp' };
  if (!relayConnected) return { name: 'Relay', key: 'relay' };
  if (!extensionInstalled) return { name: 'Расширение', key: 'extension' };
  return null;
}

export const StatusBar: React.FC<StatusBarProps> = memo(({
  relayConnected,
  extensionInstalled,
  mcpConnected,
  hasPendingData,
  onRelayClick,
  onExtensionClick,
  onInspectorClick,
  onClearQueue
}) => {
  const allGood = relayConnected && extensionInstalled;
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);

  const problem = getFirstProblem(relayConnected, extensionInstalled, mcpConnected);

  const handleProblemAction = () => {
    if (!problem) return;
    if (problem.key === 'relay' && onRelayClick) onRelayClick();
    if (problem.key === 'extension' && onExtensionClick) onExtensionClick();
  };

  return (
    <div className="status-bar">
      {/* Icon-only buttons for Inspector and Logs */}
      {onInspectorClick && (
        <button
          type="button"
          className="status-pill status-pill--log status-pill--clickable"
          onClick={onInspectorClick}
          aria-label="Инспектор компонентов"
          title="Инспектор компонентов"
        >
          <span className="status-pill-icon" style={{ fontSize: '10px' }}>&#9881;</span>
        </button>
      )}
      {/* Logs button removed — access via Ctrl+Shift+L */}

      {/* Clear queue action — visible when relay has pending data */}
      {hasPendingData && onClearQueue && (
        confirmingClear ? (
          <span className="status-bar-clear-confirm">
            <button
              type="button"
              className="status-pill status-pill--danger status-pill--clickable"
              onClick={() => { setConfirmingClear(false); onClearQueue(); }}
              aria-label="Подтвердить очистку"
            >
              <span className="status-pill-label">Да, очистить</span>
            </button>
            <button
              type="button"
              className="status-pill status-pill--log status-pill--clickable"
              onClick={() => setConfirmingClear(false)}
              aria-label="Отменить"
            >
              <span className="status-pill-label">Нет</span>
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="status-pill status-pill--danger-subtle status-pill--clickable"
            onClick={() => setConfirmingClear(true)}
            aria-label="Очистить очередь"
            title="Очистить очередь данных"
          >
            <span className="status-pill-icon" style={{ fontSize: '10px' }}>✕</span>
            <span className="status-pill-label">Очередь</span>
          </button>
        )
      )}

      {/* Status indicator */}
      {allGood && !detailsOpen && (
        <button
          type="button"
          className="status-bar-ok status-bar-ok--clickable"
          onClick={() => setDetailsOpen(true)}
          aria-label="Показать статус подключений"
          title="Нажмите для подробностей"
        >
          Все ОК ✓
        </button>
      )}

      {/* Error state — always show first problem */}
      {!allGood && problem && !detailsOpen && (
        <span className="status-bar-error">
          <span className="status-bar-error-text">⚠ {problem.name} офлайн</span>
          {(problem.key === 'relay' || problem.key === 'extension') && (
            <button
              type="button"
              className="status-pill status-pill--setup status-pill--clickable"
              onClick={handleProblemAction}
              aria-label={`Настроить ${problem.name}`}
            >
              <span className="status-pill-label">Настроить</span>
            </button>
          )}
          <button
            type="button"
            className="status-pill status-pill--log status-pill--clickable"
            onClick={() => setDetailsOpen(true)}
            aria-label="Подробнее"
            title="Показать все подключения"
          >
            <span className="status-pill-label">...</span>
          </button>
        </span>
      )}

      {/* Expanded details — click to toggle */}
      {detailsOpen && (
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
          <button
            type="button"
            className="status-pill status-pill--log status-pill--clickable"
            onClick={() => setDetailsOpen(false)}
            aria-label="Свернуть"
            title="Свернуть статус"
          >
            <span className="status-pill-icon" style={{ fontSize: '10px' }}>✕</span>
          </button>
        </>
      )}
    </div>
  );
});

StatusBar.displayName = 'StatusBar';
