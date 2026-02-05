/**
 * StatusBar — Compact connection status indicators
 * 
 * Shows Relay and Extension connection status as pills in top-right corner.
 * Dims to 60% opacity when all connections are OK.
 */

import React, { memo } from 'react';

interface StatusBarProps {
  relayConnected: boolean;
  extensionInstalled: boolean;
  onRelayClick?: () => void;
  onExtensionClick?: () => void;
}

type StatusType = 'connected' | 'offline' | 'active' | 'setup';

interface StatusPillProps {
  label: string;
  status: StatusType;
  onClick?: () => void;
}

const StatusPill: React.FC<StatusPillProps> = memo(({ label, status, onClick }) => {
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
  onRelayClick,
  onExtensionClick
}) => {
  const allGood = relayConnected && extensionInstalled;
  
  return (
    <div className={`status-bar ${allGood ? 'status-bar--dim' : ''}`}>
      <StatusPill
        label="Relay"
        status={relayConnected ? 'connected' : 'offline'}
        onClick={onRelayClick}
      />
      <StatusPill
        label="Расширение"
        status={extensionInstalled ? 'active' : 'setup'}
        onClick={onExtensionClick}
      />
    </div>
  );
});

StatusBar.displayName = 'StatusBar';
