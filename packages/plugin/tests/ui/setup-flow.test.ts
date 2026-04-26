/**
 * @vitest-environment node
 *
 * SetupFlow source-level contract tests. We don't have @testing-library/react
 * in this package, so instead we read the source file and assert the
 * structural invariants a new onboarding must satisfy:
 *
 * - single-screen architecture (no STEPS array, no StepIndicator wiring)
 * - idle / waiting / timed-out state machine present
 * - 15s pair timeout wired up
 * - offline detection renders a banner when relayConnected === false
 * - fallback "У меня нет расширения" action is always visible (not gated by toggle)
 * - repair-mode copy divergence is preserved
 *
 * These are cheap guardrails against accidentally reverting the UX refactor.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SETUP_FLOW_SOURCE = fs.readFileSync(
  path.join(__dirname, '../../src/ui/components/SetupFlow.tsx'),
  'utf8',
);

const UI_SOURCE = fs.readFileSync(path.join(__dirname, '../../src/ui/ui.tsx'), 'utf8');

const SPLASH_SOURCE = fs.readFileSync(
  path.join(__dirname, '../../src/ui/components/SetupSplash.tsx'),
  'utf8',
);

const ONBOARDING_TIP_SOURCE = fs.readFileSync(
  path.join(__dirname, '../../src/ui/components/OnboardingTip.tsx'),
  'utf8',
);

describe('SetupFlow — single-screen contract', () => {
  it('has no multi-step STEPS array or StepIndicator (simplified to 1 screen)', () => {
    // Previous 2/3-step wizard defined a `STEPS: readonly WizardStep[]` array.
    // The single-screen refactor removed both this and the StepIndicator import.
    expect(SETUP_FLOW_SOURCE).not.toMatch(/STEPS:\s*readonly\s+WizardStep/);
    expect(SETUP_FLOW_SOURCE).not.toContain("from './StepIndicator'");
  });

  it('defines the three pair-state variants', () => {
    expect(SETUP_FLOW_SOURCE).toMatch(/type PairState = 'idle' \| 'waiting' \| 'timed-out'/);
  });

  it('wires a 15 s pair timeout', () => {
    // 15_000 or 15000 acceptable; the key is the timeout path exists.
    expect(SETUP_FLOW_SOURCE).toMatch(/PAIR_TIMEOUT_MS\s*=\s*15[_\s]?000/);
    expect(SETUP_FLOW_SOURCE).toMatch(/setPairState\('timed-out'\)/);
  });

  it('renders offline banner when relayConnected is false', () => {
    expect(SETUP_FLOW_SOURCE).toMatch(/!relayConnected && \(/);
    expect(SETUP_FLOW_SOURCE).toContain('setup-flow__offline');
    expect(SETUP_FLOW_SOURCE).toContain('Нет связи с облаком');
  });

  it('primary pair button is disabled when offline', () => {
    expect(SETUP_FLOW_SOURCE).toMatch(/disabled=\{!sessionCode \|\| !relayConnected\}/);
  });

  it('install fallback ("У меня нет расширения") is always visible in idle state', () => {
    // Old version hid it behind a collapsible toggle. New version renders it
    // as a permanent secondary CTA so first-time users (who don't have the
    // extension) see it immediately.
    expect(SETUP_FLOW_SOURCE).not.toMatch(/showFallback/);
    expect(SETUP_FLOW_SOURCE).not.toMatch(/setShowFallback/);
    expect(SETUP_FLOW_SOURCE).toContain('У меня нет расширения');
  });

  it('timed-out branch renders numbered install steps with a single retry CTA', () => {
    // Apr-26 design audit: the previous "two equal buttons (download | retry)"
    // layout was replaced with numbered steps (1–4) + a single retry button
    // labelled "Я установил — повторить". This is the Critical fix from the
    // Claude Design audit (Valley of Despair → guided steps).
    expect(SETUP_FLOW_SOURCE).toContain('setup-flow__timeout');
    expect(SETUP_FLOW_SOURCE).toContain('setup-flow__steps');
    expect(SETUP_FLOW_SOURCE).toContain('setup-flow__step-number');
    expect(SETUP_FLOW_SOURCE).toContain('Я установил — повторить');
  });

  it('waiting branch surfaces a cancel action so the user never feels stuck', () => {
    expect(SETUP_FLOW_SOURCE).toContain('setup-flow__waiting');
    expect(SETUP_FLOW_SOURCE).toContain('handleCancelWait');
  });

  it('repair-mode title and button label differ from initial onboarding', () => {
    expect(SETUP_FLOW_SOURCE).toContain('Переподключение расширения');
    expect(SETUP_FLOW_SOURCE).toContain('Переподключить расширение');
  });

  it('initial-onboarding leads with a value prop, not just the mechanic', () => {
    // Apr-26 design audit: subtitle was rewritten to put the user benefit
    // ("заполняем макеты данными из живого Яндекса") BEFORE the mechanic.
    // The mechanic ("плагин свяжется с браузером автоматически") is preserved
    // as the second clause so the click affordance is still legible.
    expect(SETUP_FLOW_SOURCE).toContain('Подключите расширение Яндекса');
    expect(SETUP_FLOW_SOURCE).toContain('Заполняем макеты данными из живого Яндекса');
    expect(SETUP_FLOW_SOURCE).toContain('Плагин свяжется с браузером автоматически');
  });

  it('no forward Next button in the initial-onboarding footer', () => {
    // Parent unmounts SetupFlow on pair-ack; we shouldn't expose a manual "Next".
    expect(SETUP_FLOW_SOURCE).not.toMatch(/setup-flow__btn-next/);
    // The only footer button is "Закрыть" in repair mode.
    expect(SETUP_FLOW_SOURCE).toContain('Закрыть');
  });
});

describe('SetupSplash contract', () => {
  it('renders a spinner and a loading label (not a silent empty div)', () => {
    // Splash reuses CompactStrip's 12px spinner so the visual handoff
    // splash → strip('checking') is seamless. Any spinner class is acceptable;
    // the test just asserts a spinner node and the loading label exist.
    expect(SPLASH_SOURCE).toMatch(/(compact-strip__spinner|setup-flow__spinner)/);
    expect(SPLASH_SOURCE).toContain('Запуск Contentify');
  });

  it('is accessible — has role=status for screen readers', () => {
    expect(SPLASH_SOURCE).toContain('role="status"');
  });
});

describe('OnboardingTip contract', () => {
  it('renders a dismiss button and action-oriented copy', () => {
    expect(ONBOARDING_TIP_SOURCE).toContain('onboarding-tip__close');
    expect(ONBOARDING_TIP_SOURCE).toContain('нажмите иконку Contentify');
  });

  it('is gated by a visible prop (parent controls lifecycle)', () => {
    expect(ONBOARDING_TIP_SOURCE).toMatch(/visible:\s*boolean/);
    expect(ONBOARDING_TIP_SOURCE).toMatch(/if\s*\(!visible\)\s*return null/);
  });
});

describe('ui.tsx startup flow contract', () => {
  it('replaces the 100 ms checking→ready timer with a timeout→error path', () => {
    // Old behavior: `setTimeout(() => setAppState('ready'), 100)` flipped to ready
    // regardless of relay state, causing a brief "Relay офлайн" flash.
    // New behavior: silent probe up to 15 s; if relay.connected never flips,
    // surface an explicit error with a user-actionable message. The 15 s budget
    // is sized to fit Yandex Cloud API Gateway cold starts (3-5 s first hit).
    expect(UI_SOURCE).not.toMatch(/setAppState\('ready'\)[\s\S]{0,80}100\s*\)/);
    expect(UI_SOURCE).toMatch(
      /Не удалось подключиться[\s\S]{0,200}setAppState\('error'\)[\s\S]{0,200}}, 15000\)/,
    );
  });

  it('cloud-unreachable banner is hidden during the silent checking probe', () => {
    // Banner would flash "cloud unreachable" during the 5 s checking state —
    // exactly the startup flicker we want to avoid. It must only appear in
    // 'ready' (user paired, relay just dropped) or 'error' (timeout landed).
    const match = UI_SOURCE.match(/showCloudUnreachableBanner[\s\S]{0,400}/);
    expect(match).not.toBeNull();
    expect(match![0]).not.toContain("appState === 'checking'");
  });

  it('dismiss-error routes by reachability to avoid a ready→checking flash', () => {
    // Transient import errors: relay is up → go directly to ready.
    // Startup timeout errors: relay is down → enter checking so the 5 s probe
    // effect can retry (and surface the same error again if still unreachable).
    expect(UI_SOURCE).toMatch(/dismiss-error[\s\S]{0,400}if \(relayConnected\)/);
  });

  it('returning user does not grow the window to setup size on startup', () => {
    // Previously `onSetupSkippedLoaded` always called `resizeUI('setup')`, which
    // grew the window to 420×520 for ~100 ms before shrinking back to compact
    // once the transition effect fired — a visible flicker. Now the skip path
    // returns early so the compact size persists through the whole handshake.
    // Match the handler body: a `skipped` branch that returns early before the
    // `resizeUI('setup')` call below it.
    expect(UI_SOURCE).toMatch(/if \(skipped\)[\s\S]{0,500}return;[\s\S]{0,400}resizeUI\('setup'\)/);
  });

  it('SetupFlow render is gated on !extensionInstalled to avoid compact flash', () => {
    // Without this guard, the wizard would render for one frame inside the
    // compact 320×56 window between `setup-skipped-loaded` (sets
    // extensionInstalled) and the transition effect (flips appState).
    expect(UI_SOURCE).toMatch(/<SetupFlow[\s\S]{0,800}extensionInstalled/);
    expect(UI_SOURCE).toMatch(/!extensionInstalled && \(\s*<SetupFlow/);
  });
});

describe('ui.tsx onboarding wiring', () => {
  it('asks sandbox for onboarding-seen flag at startup', () => {
    expect(UI_SOURCE).toContain("{ type: 'check-onboarding-seen' }");
  });

  it('persists dismissal via mark-onboarding-seen', () => {
    expect(UI_SOURCE).toContain("{ type: 'mark-onboarding-seen' }");
  });

  it('hides the tip automatically on first real import', () => {
    // Reveal gate includes extensionInstalled + ready; auto-hide happens on
    // confirming/processing/success transitions. Both paths must exist.
    expect(UI_SOURCE).toMatch(
      /appState === 'confirming' \|\| appState === 'processing' \|\| appState === 'success'/,
    );
  });

  it('uses SetupSplash component instead of a raw empty div', () => {
    expect(UI_SOURCE).toContain('<SetupSplash />');
    expect(UI_SOURCE).not.toMatch(/className="setup-flow__splash"\s+aria-label/);
  });
});
