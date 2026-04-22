/**
 * Tests for CloudUnreachableBanner — cloud-era replacement for RelayOfflineBanner.
 *
 * Guards against:
 *   - Launchctl regression: the banner must not leak any local-daemon recovery text.
 *     The banner is shown only when the cloud relay is unreachable, so surfacing
 *     `launchctl` would confuse users (it won't fix anything for them).
 *   - Copy regression: the banner must surface "проверьте интернет" guidance so
 *     users know where to start troubleshooting.
 *   - Module shape: the component must be exported under the expected name from
 *     the expected file path (caught by importing + reading source).
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { CloudUnreachableBanner } from '../../src/ui/components/CloudUnreachableBanner';

const COMPONENT_SOURCE = fs.readFileSync(
  path.join(__dirname, '../../src/ui/components/CloudUnreachableBanner.tsx'),
  'utf8',
);

describe('CloudUnreachableBanner', () => {
  it('is exported as a React component', () => {
    expect(CloudUnreachableBanner).toBeDefined();
    // React.memo wraps the function component, producing a memo object with `$$typeof`.
    // We just assert the export is truthy and callable-ish — this is the smoke check.
    expect(typeof CloudUnreachableBanner).toBe('object');
  });

  it('has displayName set for dev-tools readability', () => {
    expect(CloudUnreachableBanner.displayName).toBe('CloudUnreachableBanner');
  });

  it('surfaces the cloud-era headline', () => {
    expect(COMPONENT_SOURCE).toContain('Нет связи с Cloud Relay');
  });

  it('tells the user to check their internet connection', () => {
    expect(COMPONENT_SOURCE).toContain('Проверьте интернет-соединение');
  });

  it('exposes a retry action with user-friendly copy', () => {
    expect(COMPONENT_SOURCE).toContain('Попробовать снова');
  });

  it('does not leak launchctl/local-daemon recovery instructions', () => {
    // Cloud relay can't be restarted from the user's machine, so launchctl would
    // mislead them. Fail loudly if a future refactor reintroduces it.
    expect(COMPONENT_SOURCE).not.toMatch(/launchctl/i);
    expect(COMPONENT_SOURCE).not.toMatch(/kickstart/i);
    expect(COMPONENT_SOURCE).not.toMatch(/localhost:3847/);
  });

  it('renders the session code when provided so the user can verify setup', () => {
    expect(COMPONENT_SOURCE).toContain('sessionCode');
    expect(COMPONENT_SOURCE).toContain('Session code');
  });

  it('uses the cloud-unreachable-banner CSS class (not relay-offline-banner)', () => {
    expect(COMPONENT_SOURCE).toContain('cloud-unreachable-banner');
    expect(COMPONENT_SOURCE).not.toMatch(/relay-offline-banner/);
  });
});
