/**
 * ReadyView — Main waiting screen with empty state / last import card + footer actions
 *
 * Two modes:
 * - Empty state: illustration + instruction text (no lastQuery)
 * - Last import card: query, count, relative timestamp (has lastQuery)
 *
 * Footer: "Заполнить выделение" + "Сбросить" — sticky bottom.
 * WhatsNew shown as inline banner between StatusBar and content.
 */

import React, { memo, useMemo } from 'react';
import { SearchToFigmaIcon } from './Icons';
import { OnboardingHint } from './OnboardingHint';
import { WhatsNewBanner } from './WhatsNewBanner';

interface ReadyViewProps {
  lastQuery?: string;
  lastImportCount?: number;
  lastImportTime?: number;
  relayConnected?: boolean;
  isFirstTime?: boolean;
  hasSelection?: boolean;
  showWhatsNew?: boolean;
  currentVersion?: string;
  onShowExtensionGuide?: () => void;
  onReimport?: () => void;
  onFillSelection?: () => void;
  onReset?: () => void;
  onDismissOnboarding?: () => void;
  onDismissWhatsNew?: () => void;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  if (diff < 60) return 'только что';
  const minutes = Math.floor(diff / 60);
  if (minutes < 60) {
    if (minutes === 1) return '1 мин назад';
    if (minutes < 5) return `${minutes} мин назад`;
    return `${minutes} мин назад`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    if (hours === 1) return '1 ч назад';
    return `${hours} ч назад`;
  }
  return 'давно';
}

function formatSnippetCount(count: number): string {
  if (count === 1) return '1 сниппет';
  if (count >= 2 && count <= 4) return `${count} сниппета`;
  return `${count} сниппетов`;
}

export const ReadyView: React.FC<ReadyViewProps> = memo(({
  lastQuery,
  lastImportCount,
  lastImportTime,
  isFirstTime,
  hasSelection,
  showWhatsNew,
  currentVersion,
  onShowExtensionGuide,
  onReimport,
  onFillSelection,
  onReset,
  onDismissOnboarding,
  onDismissWhatsNew,
}) => {
  const relativeTime = useMemo(
    () => (lastImportTime ? formatRelativeTime(lastImportTime) : null),
    // Re-evaluate every render since time is relative
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lastImportTime, Date.now()],
  );

  const hasLastImport = !isFirstTime && !!lastQuery;

  return (
    <div className="ready-view--figma view-animate-in">
      {/* WhatsNew inline banner */}
      {!isFirstTime && showWhatsNew && currentVersion && onDismissWhatsNew && (
        <div className="ready-view-banner-slot">
          <WhatsNewBanner currentVersion={currentVersion} onDismiss={onDismissWhatsNew} />
        </div>
      )}

      {/* Scrollable content area */}
      <div className="ready-view-content">
        {/* First-time onboarding hint */}
        {isFirstTime && onDismissOnboarding && (
          <OnboardingHint onDismiss={onDismissOnboarding} />
        )}

        {/* Empty state (no last import) */}
        {!isFirstTime && !hasLastImport && (
          <div className="ready-view-empty">
            <SearchToFigmaIcon className="ready-view-illustration" />
            <p className="ready-view-primary-text">
              Откройте Яндекс в браузере
            </p>
            <p className="ready-view-secondary-text">
              Данные из поисковой выдачи появятся здесь автоматически
            </p>
          </div>
        )}

        {/* Last import card */}
        {hasLastImport && (
          <div className="ready-view-empty">
            <SearchToFigmaIcon className="ready-view-illustration" />
            <p className="ready-view-primary-text">
              Откройте Яндекс в браузере
            </p>
            <p className="ready-view-secondary-text">
              Данные из поисковой выдачи появятся здесь автоматически
            </p>

            <div
              className="ready-view-last-card"
              role="button"
              tabIndex={0}
              onClick={onReimport}
              onKeyDown={(e) => { if (e.key === 'Enter') onReimport?.(); }}
            >
              <div className="ready-view-last-card-header">Последний запрос</div>
              <div className="ready-view-last-card-query">&laquo;{lastQuery}&raquo;</div>
              <div className="ready-view-last-card-meta">
                {lastImportCount != null && (
                  <span>{formatSnippetCount(lastImportCount)}</span>
                )}
                {lastImportCount != null && relativeTime && (
                  <span className="ready-view-last-card-sep">&middot;</span>
                )}
                {relativeTime && <span>{relativeTime}</span>}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer actions — sticky bottom */}
      {!isFirstTime && (
        <div className="ready-view-footer">
          <button
            type="button"
            className="btn-primary ready-view-footer-btn"
            disabled={!hasSelection}
            onClick={onFillSelection}
          >
            Заполнить выделение
          </button>
          {onReset && (
            <button
              type="button"
              className="btn-text-sm ready-view-footer-reset"
              onClick={onReset}
            >
              Сбросить
            </button>
          )}
        </div>
      )}
    </div>
  );
});

ReadyView.displayName = 'ReadyView';
