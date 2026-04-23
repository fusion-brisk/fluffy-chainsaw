/**
 * CompactStrip — unified 56px compact bar for checking, ready, processing, success, error states.
 *
 * Layout: [status-icon] [status-text] [spacer] [menu ⋮]
 * Processing/success: 3px progress bar at absolute bottom.
 * Menu: dropdown below strip (desktop) or bottom sheet overlay (mobile/iPad).
 *
 * On desktop: iframe resizes to fit menu, then shrinks back on close.
 * On mobile: fullscreen overlay with bottom sheet inside expanded iframe.
 */

import React, { memo, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { PluginPlatform } from '../hooks/usePlatform';

export type CompactStripMode = 'checking' | 'ready' | 'processing' | 'success' | 'error';

interface MenuItem {
  id: string;
  label: string;
  icon: string;
  danger?: boolean;
  /** If defined, item only shows when this is true */
  condition?: boolean;
}

interface CompactStripProps {
  mode: CompactStripMode;
  connected: boolean;
  current?: number;
  total?: number;
  count?: number;
  duration?: number;
  errorMessage?: string;
  /** Dynamic processing message — overrides the default "X из Y" / "Обработка..." */
  processingMessage?: string;
  lastQuery?: string;
  lastImportCount?: number;
  lastImportTime?: number;
  hasPendingData?: boolean;
  hasSelection?: boolean;
  platform: PluginPlatform;
  /** Total window height when menu is closed (includes banners above strip) */
  baseHeight?: number;
  onRequestResize: (height: number) => void;
  onMenuAction: (action: string) => void;
}

const AUTO_DISMISS_DELAY = 3000;
const ERROR_DISMISS_DELAY = 5000;
const STRIP_HEIGHT = 56;

function formatRelativeTime(timestamp: number): string {
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  if (diff < 60) return 'только что';
  const minutes = Math.floor(diff / 60);
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  return 'давно';
}

function formatSnippetCount(count: number): string {
  if (count === 1) return '1 сниппет';
  if (count >= 2 && count <= 4) return `${count} сниппета`;
  return `${count} сниппетов`;
}

export const CompactStrip: React.FC<CompactStripProps> = memo(
  ({
    mode,
    connected,
    current,
    total,
    count,
    duration,
    errorMessage,
    processingMessage,
    lastQuery,
    lastImportCount,
    lastImportTime,
    hasPendingData,
    hasSelection,
    platform,
    baseHeight = STRIP_HEIGHT,
    onRequestResize,
    onMenuAction,
  }) => {
    const [menuOpen, setMenuOpen] = useState(false);
    const [showTooltip, setShowTooltip] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const menuBtnRef = useRef<HTMLButtonElement>(null);
    const autoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Build menu items
    const menuItems: MenuItem[] = useMemo(
      () => [
        { id: 'logs', label: 'Логи', icon: '\u2261' },
        { id: 'inspector', label: 'Инспектор', icon: '\u2699' },
        { id: 'setup', label: 'Настройки', icon: '\u2638' },
        { id: 'whatsNew', label: 'Что нового', icon: '\u2726' },
        {
          id: 'breakpointSkeletons',
          label: 'Макеты брейкпоинтов',
          icon: '\u25A6',
        },
        {
          id: 'exportHtml',
          label: 'Экспортировать HTML',
          icon: '\u2913',
          condition: !!hasSelection,
        },
        // Danger zone
        {
          id: 'clearQueue',
          label: 'Очистить очередь',
          icon: '\u2715',
          danger: true,
          condition: !!hasPendingData,
        },
        { id: 'resetSnippets', label: 'Сбросить сниппеты', icon: '\u21BA', danger: true },
      ],
      [hasPendingData, hasSelection],
    );

    // Compute menu height for desktop resize
    const menuHeight = useMemo(() => {
      const visibleItems = menuItems.filter(
        (item) => item.condition === undefined || item.condition,
      );
      const hasDanger = visibleItems.some((item) => item.danger);
      // Each item ~36px (padding 8px + line-height ~20px), divider 9px (1px + 4px*2), container padding 8px top+bottom
      return visibleItems.length * 36 + (hasDanger ? 9 : 0) + 16;
    }, [menuItems]);

    // Close menu helper
    const closeMenu = useCallback(() => {
      setMenuOpen(false);
      onRequestResize(baseHeight);
    }, [baseHeight, onRequestResize]);

    // Toggle menu
    const toggleMenu = useCallback(() => {
      if (menuOpen) {
        closeMenu();
      } else {
        if (platform === 'desktop') {
          // Desktop: resize iframe to fit menu below strip, then show
          onRequestResize(baseHeight + menuHeight);
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              setMenuOpen(true);
            });
          });
        } else {
          // Mobile: resize to extended, show bottom sheet overlay
          onRequestResize(520);
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              setMenuOpen(true);
            });
          });
        }
      }
    }, [menuOpen, menuHeight, baseHeight, platform, onRequestResize, closeMenu]);

    // Click outside (desktop)
    useEffect(() => {
      if (!menuOpen || platform !== 'desktop') return;
      const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as Node;
        if (containerRef.current && !containerRef.current.contains(target)) {
          closeMenu();
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [menuOpen, platform, closeMenu]);

    // Escape key closes menu, arrow keys navigate menu items
    useEffect(() => {
      if (!menuOpen) return;
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeMenu();
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const items = containerRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
          if (!items || items.length === 0) return;
          const current = document.activeElement as HTMLElement;
          const idx = Array.from(items).indexOf(current);
          if (e.key === 'ArrowDown') {
            const next = idx < items.length - 1 ? idx + 1 : 0;
            items[next].focus();
          } else {
            const prev = idx > 0 ? idx - 1 : items.length - 1;
            items[prev].focus();
          }
        }
      };
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }, [menuOpen, closeMenu]);

    // Close menu on mode change (e.g. data arrives while menu is open)
    useEffect(() => {
      if (menuOpen) {
        setMenuOpen(false);
        // Don't call onRequestResize here — ui.tsx will resize for the new state
      }
    }, [mode]); // intentionally omit menuOpen/setMenuOpen — only react to mode changes

    // Auto-dismiss for success and error
    useEffect(() => {
      if (mode === 'success') {
        autoDismissRef.current = setTimeout(() => {
          onMenuAction('dismiss-success');
        }, AUTO_DISMISS_DELAY);
      } else if (mode === 'error') {
        autoDismissRef.current = setTimeout(() => {
          onMenuAction('dismiss-error');
        }, ERROR_DISMISS_DELAY);
      }
      return () => {
        if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
      };
    }, [mode, onMenuAction]);

    const handleMenuItemClick = useCallback(
      (action: string) => {
        // Cancel auto-dismiss timer on any manual action
        if (autoDismissRef.current) {
          clearTimeout(autoDismissRef.current);
          autoDismissRef.current = null;
        }
        setMenuOpen(false);
        // Panel-opening actions handle their own resize — skip intermediate shrink to avoid flicker
        const panelActions = ['logs', 'inspector', 'setup', 'whatsNew'];
        if (!panelActions.includes(action)) {
          onRequestResize(baseHeight);
        }
        onMenuAction(action);
      },
      [onMenuAction, baseHeight, onRequestResize],
    );

    const handleErrorClick = useCallback(() => {
      if (mode === 'error') {
        onMenuAction('dismiss-error');
      }
    }, [mode, onMenuAction]);

    // Build status icon
    let statusIcon: React.ReactNode;
    switch (mode) {
      case 'checking':
        statusIcon = <div className="compact-strip__spinner" />;
        break;
      case 'ready':
        statusIcon = connected ? (
          <div className="compact-strip__dot compact-strip__dot--ok" />
        ) : (
          <div className="compact-strip__dot compact-strip__dot--offline" />
        );
        break;
      case 'processing':
        statusIcon = <div className="compact-strip__spinner compact-strip__spinner--brand" />;
        break;
      case 'success':
        statusIcon = (
          <span className="compact-strip__icon compact-strip__icon--success">{'\u2713'}</span>
        );
        break;
      case 'error':
        statusIcon = (
          <span className="compact-strip__icon compact-strip__icon--error">{'\u2717'}</span>
        );
        break;
    }

    // Build status text
    let statusText: string;
    switch (mode) {
      case 'checking':
        statusText = 'Подключение\u2026';
        break;
      case 'ready':
        statusText = connected ? 'Подключено' : 'Relay офлайн';
        break;
      case 'processing':
        // Prefer the sandbox-provided message ("Размещаем 15 из 78…" etc) so the user
        // sees what's happening rather than a bare numeric counter. Fall back to the
        // counter, then to the generic placeholder.
        if (processingMessage && processingMessage.trim()) {
          statusText = processingMessage;
        } else if (current != null && total != null && total > 0) {
          statusText = `${current} из ${total}`;
        } else {
          statusText = 'Обработка\u2026';
        }
        break;
      case 'success': {
        const parts: string[] = [];
        if (count != null && count > 0) {
          const word = count === 1 ? 'элемент' : count < 5 ? 'элемента' : 'элементов';
          parts.push(`${count} ${word}`);
        }
        if (duration != null && duration > 0) {
          parts.push(`${(duration / 1000).toFixed(1)} сек`);
        }
        statusText = parts.length > 0 ? parts.join(' \u00B7 ') : 'Импорт завершён';
        break;
      }
      case 'error':
        statusText = errorMessage || 'Ошибка импорта';
        break;
    }

    // Progress bar width
    const progressPercent =
      mode === 'processing' && current != null && total != null && total > 0
        ? Math.min(100, Math.round((current / total) * 100))
        : 0;

    // Tooltip for last query
    const tooltipText = lastQuery
      ? `Последний: «${lastQuery}»${lastImportCount ? ` · ${formatSnippetCount(lastImportCount)}` : ''}${lastImportTime ? ` · ${formatRelativeTime(lastImportTime)}` : ''}`
      : undefined;

    // Render menu items (shared between desktop/mobile)
    const renderMenuItems = (touchMode: boolean) => {
      const visibleItems = menuItems.filter(
        (item) => item.condition === undefined || item.condition,
      );
      let renderedDivider = false;

      return visibleItems.map((item) => {
        const elements: React.ReactNode[] = [];

        // Separator before first danger item
        if (item.danger && !renderedDivider) {
          renderedDivider = true;
          elements.push(<div key="divider" className="compact-strip__menu-separator" />);
        }

        elements.push(
          <button
            key={item.id}
            type="button"
            className={`compact-strip__menu-item${item.danger ? ' compact-strip__menu-item--danger' : ''}${touchMode ? ' compact-strip__menu-item--touch' : ''}`}
            role="menuitem"
            onClick={() => handleMenuItemClick(item.id)}
          >
            <span className="compact-strip__menu-icon">{item.icon}</span>
            {item.label}
          </button>,
        );

        return elements;
      });
    };

    return (
      <div
        ref={containerRef}
        className={`compact-strip compact-strip--${mode}`}
        onClick={mode === 'error' ? handleErrorClick : undefined}
      >
        {/* Strip row: 56px */}
        <div className="compact-strip__content">
          {statusIcon}

          <span
            className="compact-strip__text"
            title={tooltipText}
            onMouseEnter={() => tooltipText && setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            {statusText}
          </span>

          <div className="compact-strip__spacer" />

          <button
            ref={menuBtnRef}
            type="button"
            className={`compact-strip__menu-btn${menuOpen ? ' compact-strip__menu-btn--active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              toggleMenu();
            }}
            aria-label="Меню"
            aria-expanded={menuOpen}
          >
            {'\u22EE'}
          </button>
        </div>

        {/* Progress bar — processing */}
        {mode === 'processing' && (
          <div className="compact-strip__progress">
            <div
              className="compact-strip__progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}

        {/* Progress bar — success (shrinks over 3s) */}
        {mode === 'success' && (
          <div className="compact-strip__progress">
            <div className="compact-strip__progress-fill compact-strip__progress-fill--success" />
          </div>
        )}

        {/* Tooltip */}
        {showTooltip && tooltipText && <div className="compact-strip__tooltip">{tooltipText}</div>}

        {/* Desktop menu — dropdown below strip */}
        {menuOpen && platform === 'desktop' && (
          <div className="compact-strip__menu" role="menu">
            {renderMenuItems(false)}
          </div>
        )}

        {/* Mobile menu — bottom sheet overlay */}
        {menuOpen && platform === 'mobile' && (
          <div className="compact-strip__menu-overlay" onClick={closeMenu}>
            <div
              className="compact-strip__menu-sheet"
              role="menu"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="compact-strip__menu-sheet-handle" />
              {renderMenuItems(true)}
            </div>
          </div>
        )}
      </div>
    );
  },
);

CompactStrip.displayName = 'CompactStrip';
