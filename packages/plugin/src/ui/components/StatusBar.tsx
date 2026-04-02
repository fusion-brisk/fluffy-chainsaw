/**
 * StatusBar — Fixed bottom bar with connection status
 *
 * Shows connection status as a single line with click-to-expand detail popup.
 * Inspector and Logs buttons are icon-only on the right side.
 * All interactions are click-based (no hover logic).
 */

import React, { memo, useState, useRef, useEffect, useCallback } from 'react';

interface StatusBarProps {
  relayConnected: boolean;
  extensionInstalled: boolean;
  hasPendingData?: boolean;
  onRelayClick?: () => void;
  onExtensionClick?: () => void;
  onInspectorClick?: () => void;
  onLogsClick?: () => void;
  onClearQueue?: () => void;
}

/**
 * Find the first problem service for error state display.
 */
function getFirstProblem(
  relayConnected: boolean,
  extensionInstalled: boolean,
): { name: string; key: 'relay' | 'extension' } | null {
  if (!relayConnected) return { name: 'Relay', key: 'relay' };
  if (!extensionInstalled) return { name: 'Расширение', key: 'extension' };
  return null;
}

interface ServiceRowProps {
  label: string;
  connected: boolean;
}

const ServiceRow: React.FC<ServiceRowProps> = ({ label, connected }) => (
  <div className="status-bar__popup-row">
    <span className="status-bar__popup-label">{label}</span>
    <span
      className={`status-bar__dot ${connected ? 'status-bar__dot--ok' : 'status-bar__dot--error'}`}
    />
    <span className="status-bar__popup-value">{connected ? 'онлайн' : 'офлайн'}</span>
  </div>
);

export const StatusBar: React.FC<StatusBarProps> = memo(
  ({
    relayConnected,
    extensionInstalled,
    hasPendingData,
    onRelayClick,
    onExtensionClick,
    onInspectorClick,
    onLogsClick,
    onClearQueue,
  }) => {
    const allGood = relayConnected && extensionInstalled;
    const [popupOpen, setPopupOpen] = useState(false);
    const popupRef = useRef<HTMLDivElement>(null);
    const statusRef = useRef<HTMLButtonElement>(null);

    const problem = getFirstProblem(relayConnected, extensionInstalled);

    const handleProblemAction = useCallback(() => {
      if (!problem) return;
      if (problem.key === 'relay' && onRelayClick) onRelayClick();
      if (problem.key === 'extension' && onExtensionClick) onExtensionClick();
    }, [problem, onRelayClick, onExtensionClick]);

    const togglePopup = useCallback(() => {
      setPopupOpen((prev) => !prev);
    }, []);

    // Click-outside to close popup
    useEffect(() => {
      if (!popupOpen) return;

      const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as Node;
        if (
          popupRef.current &&
          !popupRef.current.contains(target) &&
          statusRef.current &&
          !statusRef.current.contains(target)
        ) {
          setPopupOpen(false);
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [popupOpen]);

    return (
      <div className="status-bar">
        {/* Status text — clickable to toggle popup */}
        {allGood ? (
          <button
            ref={statusRef}
            type="button"
            className="status-bar__status-btn"
            onClick={togglePopup}
            aria-label="Показать статус подключений"
          >
            <span className="status-bar__dot status-bar__dot--ok" />
            <span className="status-bar__status-text">Подключено</span>
          </button>
        ) : (
          <span className="status-bar__error-group">
            <button
              ref={statusRef}
              type="button"
              className="status-bar__status-btn status-bar__status-btn--error"
              onClick={togglePopup}
              aria-label="Показать статус подключений"
            >
              <span className="status-bar__warning-icon">&#9888;</span>
              <span className="status-bar__status-text">
                {problem ? `${problem.name} офлайн` : 'Проблема'}
              </span>
            </button>
            {problem && (problem.key === 'relay' || problem.key === 'extension') && (
              <button
                type="button"
                className="status-bar__setup-btn"
                onClick={handleProblemAction}
                aria-label={`Настроить ${problem.name}`}
              >
                Настроить
              </button>
            )}
          </span>
        )}

        {/* Right-side icon buttons */}
        <div className="status-bar__actions">
          {onInspectorClick && (
            <button
              type="button"
              className="status-bar__icon-btn"
              onClick={onInspectorClick}
              aria-label="Инспектор компонентов"
              title="Инспектор компонентов"
            >
              &#9881;
            </button>
          )}
          {onLogsClick && (
            <button
              type="button"
              className="status-bar__icon-btn"
              onClick={onLogsClick}
              aria-label="Журнал"
              title="Журнал"
            >
              &#8801;
            </button>
          )}
        </div>

        {/* Detail popup — appears above the bar */}
        {popupOpen && (
          <div ref={popupRef} className="status-bar__popup">
            <ServiceRow label="Relay" connected={relayConnected} />
            <ServiceRow label="Расширение" connected={extensionInstalled} />
            {hasPendingData && onClearQueue && (
              <>
                <div className="status-bar__popup-divider" />
                <button
                  type="button"
                  className="status-bar__popup-action"
                  onClick={() => {
                    onClearQueue();
                    setPopupOpen(false);
                  }}
                >
                  Очистить очередь
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );
  },
);

StatusBar.displayName = 'StatusBar';
