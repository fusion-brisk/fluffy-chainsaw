/**
 * SetupFlow — single-screen onboarding wizard.
 *
 * Old 3-step wizard replaced by one screen with three inline states:
 *   - idle:      primary "Подключить расширение" + secondary "У меня нет расширения"
 *   - waiting:   spinner + "Ждём подтверждение…" + "Отмена / повторить"
 *   - timed-out: after 15s no pair-ack → "Расширение не отвечает" + auto-expanded
 *                install instructions + retry button
 *
 * Transitions out of SetupFlow are driven by the parent (`handlePaired` →
 * `markExtensionInstalled` → `appState='checking'`). We don't own a "next"
 * button; once paired the parent unmounts us automatically.
 *
 * Fallback (install instructions) always visible as secondary action — 90% of
 * first-time users don't have the extension yet, so the install path must not
 * hide behind a toggle.
 *
 * Offline detection: when `relayConnected === false` we show a banner above
 * the primary button so the user knows why pairing won't complete.
 */

import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { EXTENSION_URLS } from '../../config';
import { buildPairUrl } from '../../utils/index';

interface SetupFlowProps {
  /** Pre-generated session code (baked into the pair URL; never shown to user). */
  sessionCode: string | null;
  /** Reachability of the cloud relay — offline banner driver. */
  relayConnected: boolean;
  /** Set true when pair-ack lands; parent transitions out at this point. */
  extensionInstalled: boolean;
  onComplete: () => void;
  onBack: () => void;
  /**
   * Repair mode — user opened SetupFlow from the menu with extension already
   * flagged as installed. Shows a different copy, makes the button "Переподключить",
   * and keeps the explanation about why this exists.
   */
  allowRepair?: boolean;
}

/** How long to wait for pair-ack before surfacing the timeout UI. */
const PAIR_TIMEOUT_MS = 15_000;

type PairState = 'idle' | 'waiting' | 'timed-out';

export const SetupFlow: React.FC<SetupFlowProps> = memo(
  ({
    sessionCode,
    relayConnected,
    extensionInstalled,
    onComplete,
    onBack,
    allowRepair = false,
  }) => {
    // In initial onboarding, if the extension is already flagged installed we
    // shouldn't render at all — the parent transition effect will unmount us
    // within one React tick. `onComplete()` nudges the parent in case the
    // transition hasn't fired yet (defensive).
    useEffect(() => {
      if (!allowRepair && extensionInstalled) {
        onComplete();
      }
    }, [allowRepair, extensionInstalled, onComplete]);

    const [pairState, setPairState] = useState<PairState>('idle');
    const timeoutRef = useRef<number | null>(null);

    // Cleanup pending timeout on unmount.
    useEffect(() => {
      return () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      };
    }, []);

    // When pair-ack arrives, the parent unmounts us. But we also want to clear
    // the local timer in case something raced — defensive cleanup.
    useEffect(() => {
      if (extensionInstalled && timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }, [extensionInstalled]);

    const startPairWaiting = useCallback(() => {
      setPairState('waiting');
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => {
        timeoutRef.current = null;
        setPairState('timed-out');
      }, PAIR_TIMEOUT_MS);
    }, []);

    const handlePair = useCallback(() => {
      if (!sessionCode) return;
      // Opens the pair URL in a new browser tab. Extension's background SW
      // catches `?contentify_pair=` on ya.ru, stores the code, pushes a pair-ack
      // to the relay. Plugin polling picks up the ack → extensionInstalled=true
      // → parent unmounts SetupFlow.
      window.open(buildPairUrl(sessionCode), '_blank');
      startPairWaiting();
    }, [sessionCode, startPairWaiting]);

    const handleRetry = useCallback(() => {
      handlePair();
    }, [handlePair]);

    const handleCancelWait = useCallback(() => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setPairState('idle');
    }, []);

    const handleDownloadExtension = useCallback(() => {
      window.open(EXTENSION_URLS.EXTENSION_DOWNLOAD, '_blank');
    }, []);

    const isRepair = allowRepair && extensionInstalled;
    const title = isRepair
      ? 'Переподключение расширения'
      : allowRepair
        ? 'Подключение расширения'
        : 'Подключите расширение Яндекса';

    // Idle copy split into two lines so the value prop comes BEFORE the mechanic.
    // Repair mode keeps the original technical description (returning user, no
    // value-prop framing needed).
    const description = isRepair
      ? 'Плагин уже связан. Переподключите, если расширение не отвечает — session code перезапишется на обеих сторонах.'
      : 'Заполняем макеты данными из живого Яндекса в один клик. Плагин свяжется с браузером автоматически.';

    const primaryLabel = isRepair ? 'Переподключить расширение' : 'Подключить расширение';

    return (
      <div className="setup-flow setup-flow--single view-animate-in">
        <div className="setup-flow__content">
          <div className="setup-flow__illustration" aria-hidden>
            {/* Chrome ↔ Figma pairing glyph (static, purely decorative) */}
            <svg
              width="80"
              height="56"
              viewBox="0 0 80 56"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle
                cx="20"
                cy="28"
                r="18"
                stroke="var(--figma-color-border-brand, #0d99ff)"
                strokeWidth="2"
              />
              <text
                x="20"
                y="32"
                textAnchor="middle"
                fill="var(--figma-color-text, #333)"
                fontSize="14"
                fontFamily="sans-serif"
              ></text>
              <path
                d="M 42 28 L 58 28 M 54 24 L 58 28 L 54 32"
                stroke="var(--figma-color-text-secondary, #888)"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
              />
              <rect
                x="62"
                y="14"
                width="14"
                height="28"
                rx="2"
                stroke="var(--figma-color-border-brand, #0d99ff)"
                strokeWidth="2"
              />
              <line
                x1="65"
                y1="20"
                x2="73"
                y2="20"
                stroke="var(--figma-color-border-brand, #0d99ff)"
                strokeWidth="2"
              />
              <line
                x1="65"
                y1="28"
                x2="73"
                y2="28"
                stroke="var(--figma-color-border-brand, #0d99ff)"
                strokeWidth="2"
              />
              <line
                x1="65"
                y1="36"
                x2="70"
                y2="36"
                stroke="var(--figma-color-border-brand, #0d99ff)"
                strokeWidth="2"
              />
            </svg>
          </div>

          <h2 className="setup-flow__title">{title}</h2>
          <p className="setup-flow__description">{description}</p>

          {!relayConnected && (
            <div className="setup-flow__offline" role="alert">
              <span className="setup-flow__offline-icon" aria-hidden>
                ⚠
              </span>
              <span>Нет связи с облаком — проверьте интернет</span>
            </div>
          )}

          {/* IDLE — primary pair button + install fallback always visible */}
          {pairState === 'idle' && (
            <>
              <button
                type="button"
                className="btn-primary setup-flow__primary"
                onClick={handlePair}
                disabled={!sessionCode || !relayConnected}
                aria-label={`${primaryLabel} — открыть ya.ru для авто-сопряжения`}
              >
                {primaryLabel}
              </button>
              <p className="setup-flow__hint">
                Откроется вкладка ya.ru и закроется сама, как только расширение ответит.
              </p>

              <div className="setup-flow__divider" aria-hidden />

              <button
                type="button"
                className="btn-secondary"
                onClick={handleDownloadExtension}
                aria-label="Скачать расширение для Chrome"
              >
                У меня нет расширения
              </button>
              <p className="setup-flow__hint setup-flow__hint--muted">
                Скачайте .crx → <code>chrome://extensions</code> → включите режим разработчика →
                перетащите файл на страницу. Потом вернитесь сюда и нажмите «Подключить».
              </p>
            </>
          )}

          {/* WAITING — spinner + cancel */}
          {pairState === 'waiting' && (
            <div className="setup-flow__waiting" role="status" aria-live="polite">
              <div className="setup-flow__spinner" aria-hidden />
              <p className="setup-flow__waiting-title">Ждём ответ от расширения…</p>
              <p className="setup-flow__hint">Обычно занимает 2–3 секунды.</p>
              <button
                type="button"
                className="btn-text"
                onClick={handleCancelWait}
                aria-label="Отменить ожидание"
              >
                Отменить
              </button>
            </div>
          )}

          {/* TIMED-OUT — numbered install steps (visual scaffold for non-developer
              dizainers). The download button acts as step 1's CTA so the user has
              one obvious primary path. After install, the single "Я установил —
              повторить" button replaces the previous two equal-weight buttons,
              avoiding the choice paralysis where retry and download were peer
              CTAs. */}
          {pairState === 'timed-out' && (
            <div className="setup-flow__timeout" role="alert">
              <p className="setup-flow__timeout-title">Расширение не ответило</p>
              <p className="setup-flow__hint">
                Похоже, расширение ещё не установлено. Установите его за 4 шага:
              </p>
              <ol className="setup-flow__steps">
                <li className="setup-flow__step">
                  <span className="setup-flow__step-number" aria-hidden>
                    1
                  </span>
                  <span className="setup-flow__step-text">
                    <button
                      type="button"
                      className="setup-flow__step-link"
                      onClick={handleDownloadExtension}
                    >
                      Скачайте .crx файл ↓
                    </button>
                  </span>
                </li>
                <li className="setup-flow__step">
                  <span className="setup-flow__step-number" aria-hidden>
                    2
                  </span>
                  <span className="setup-flow__step-text">
                    Откройте <code>chrome://extensions</code>
                  </span>
                </li>
                <li className="setup-flow__step">
                  <span className="setup-flow__step-number" aria-hidden>
                    3
                  </span>
                  <span className="setup-flow__step-text">
                    Включите «Режим разработчика» в правом верхнем углу
                  </span>
                </li>
                <li className="setup-flow__step">
                  <span className="setup-flow__step-number" aria-hidden>
                    4
                  </span>
                  <span className="setup-flow__step-text">
                    Перетащите .crx файл на страницу расширений
                  </span>
                </li>
              </ol>
              <button
                type="button"
                className="btn-primary setup-flow__retry"
                onClick={handleRetry}
                disabled={!sessionCode || !relayConnected}
                aria-label="Я установил расширение, попробовать подключиться ещё раз"
              >
                Я установил — повторить
              </button>
            </div>
          )}
        </div>

        {/* Footer: only a back button in repair mode; no forward navigation —
            the parent transitions out on pair-ack. */}
        {allowRepair && (
          <div className="setup-flow__footer">
            <button
              type="button"
              className="btn-text"
              onClick={onBack}
              aria-label="Закрыть настройки"
            >
              &#8592; Закрыть
            </button>
          </div>
        )}
      </div>
    );
  },
);

SetupFlow.displayName = 'SetupFlow';
