/**
 * Tests for the restart command constants shared by RelayOfflineBanner and (informally)
 * kept in sync with packages/relay/src/routes/update.ts.
 *
 * Guards against:
 *   - Accidental change to RELAY_SERVICE_NAME (must match plist Label in relay/setup.ts)
 *   - Shell-substitution form regressing to a pre-expanded form (user-facing copy would
 *     then contain "gui/501/..." which wouldn't work for any other machine)
 *   - Port drift (local relay port stays 3847 for the legacy self-healing banner)
 */

import { describe, it, expect } from 'vitest';
import {
  RELAY_SERVICE_NAME,
  RELAY_PORT,
  RELAY_RESTART_SHELL_COMMAND,
} from '../../src/ui/components/relay-offline-banner-constants';

describe('relay-offline-banner-constants', () => {
  it('RELAY_SERVICE_NAME matches plist Label used in relay/setup.ts', () => {
    expect(RELAY_SERVICE_NAME).toBe('com.contentify.relay');
  });

  it('RELAY_PORT stays 3847 (legacy local relay port, kept for banner continuity)', () => {
    expect(RELAY_PORT).toBe(3847);
  });

  it('RELAY_RESTART_SHELL_COMMAND uses shell substitution (not resolved uid)', () => {
    // Must contain literal `$(id -u)` so any user can paste it into Terminal without
    // knowing their uid. If someone "helpfully" resolves it at build time we regress.
    expect(RELAY_RESTART_SHELL_COMMAND).toContain('$(id -u)');
    expect(RELAY_RESTART_SHELL_COMMAND).not.toMatch(/gui\/\d+\//);
  });

  it('RELAY_RESTART_SHELL_COMMAND starts with launchctl kickstart', () => {
    // Format: `launchctl kickstart -k gui/$(id -u)/<service>`
    expect(RELAY_RESTART_SHELL_COMMAND).toMatch(/^launchctl kickstart -k /);
  });

  it('RELAY_RESTART_SHELL_COMMAND ends with the service name', () => {
    expect(RELAY_RESTART_SHELL_COMMAND.endsWith(`/${RELAY_SERVICE_NAME}`)).toBe(true);
  });
});
