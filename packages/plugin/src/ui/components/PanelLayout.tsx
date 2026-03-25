/**
 * PanelLayout — Unified layout wrapper for secondary panels (logs, inspector).
 *
 * Provides consistent header with back navigation, scrollable content area,
 * and optional sticky footer. Used at the 'extended' window tier (420x520).
 */

import React, { memo } from 'react';

interface PanelLayoutProps {
  title: string;
  onBack: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export const PanelLayout: React.FC<PanelLayoutProps> = memo(({ title, onBack, footer, children }) => (
  <div className="panel-layout">
    <div className="panel-layout__header">
      <button
        type="button"
        className="panel-layout__back"
        onClick={onBack}
        aria-label="Назад"
      >
        &larr; Назад
      </button>
      <span className="panel-layout__title">{title}</span>
    </div>
    <div className="panel-layout__content">
      {children}
    </div>
    {footer && (
      <div className="panel-layout__footer">
        {footer}
      </div>
    )}
  </div>
));

PanelLayout.displayName = 'PanelLayout';
