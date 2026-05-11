/**
 * @vitest-environment node
 *
 * Source-contract tests for Phase 4 lifecycle cleanup changes.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '../../src/ui');
const READ = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('ui.tsx — conditional banner mounting', () => {
  const source = READ('ui.tsx');

  it('UpdateBanner wrapper is conditionally mounted, not always rendered', () => {
    // The wrapper div should only exist when the banner content would render.
    expect(source).toMatch(/versionCheck\.extensionUpdate && \(\s*<div ref=\{updateBannerRef\}/);
  });

  it('CloudUnreachableBanner wrapper is conditionally mounted', () => {
    expect(source).toMatch(/showCloudUnreachableBanner && \(\s*<div ref=\{cloudBannerRef\}/);
  });

  it('PairedBanner wrapper is conditionally mounted', () => {
    expect(source).toMatch(/pairedFlashVisible && \(\s*<div ref=\{pairedBannerRef\}/);
  });

  it('OnboardingTip wrapper is conditionally mounted', () => {
    expect(source).toMatch(/onboardingTipVisible && \(\s*<div ref=\{onboardingTipRef\}/);
  });

  it('compactStripMode is computed via switch, not nested ternary', () => {
    expect(source).toMatch(/compactStripMode[\s\S]{0,200}switch \(appState\)/);
    // Old nested ternary signature should be gone
    expect(source).not.toMatch(/appState === 'error'\s*\?\s*'error'\s*:/);
  });
});

describe('CompactStrip — mode-change resize', () => {
  const source = READ('components/CompactStrip.tsx');

  it('mode-change effect resizes back to baseHeight to avoid 1-frame overlap', () => {
    // The effect should now call onRequestResize(baseHeight) when closing the menu.
    expect(source).toMatch(
      /useEffect\(\(\)\s*=>\s*\{\s*if \(menuOpen\)\s*\{[\s\S]{0,300}onRequestResize\(baseHeight\)/,
    );
  });
});

describe('SetupFlow — timeout coordination + double-call guard', () => {
  const source = READ('components/SetupFlow.tsx');

  it('PAIR_TIMEOUT_MS is 20s (defers to parent 15s checking-timeout)', () => {
    expect(source).toMatch(/PAIR_TIMEOUT_MS\s*=\s*20[_\s]?000/);
  });

  it('startPairWaiting skips arming the timer when relay is offline', () => {
    expect(source).toMatch(/if \(!relayConnected\) return/);
  });

  it('completedRef guards against double onComplete calls', () => {
    expect(source).toContain('completedRef');
    expect(source).toMatch(/completedRef\.current\s*=\s*true/);
  });
});

describe('Confetti — resize listener', () => {
  const source = READ('components/Confetti.tsx');

  it('registers a window resize listener for the canvas', () => {
    expect(source).toMatch(/addEventListener\(['"]resize['"]/);
    expect(source).toMatch(/removeEventListener\(['"]resize['"]/);
  });
});
