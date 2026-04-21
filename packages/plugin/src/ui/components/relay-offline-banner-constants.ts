/**
 * Shared constants for the "Relay offline" recovery path.
 *
 * These strings are duplicated in `packages/relay/src/routes/update.ts` (programmatic form
 * with uid pre-resolved) and `packages/relay/src/setup.ts` (as HOST_NAME/PORT). When editing
 * any of those, grep for RELAY_SERVICE_NAME and keep them in sync.
 */

/** launchd service label — must match `com.contentify.relay` plist `Label` key. */
export const RELAY_SERVICE_NAME = 'com.contentify.relay';

/** Relay HTTP/WS port. Mirrors PORT in relay/src/setup.ts and PORTS.RELAY in config.ts. */
export const RELAY_PORT = 3847;

/**
 * Human-copyable restart command. Uses shell substitution `$(id -u)` so the user can paste
 * verbatim into Terminal without knowing their uid. The relay's programmatic path in
 * `update.ts:spawn(...)` uses the resolved uid from `os.userInfo().uid` instead (different
 * form because execFile/spawn with shell=false doesn't expand `$(...)`).
 */
export const RELAY_RESTART_SHELL_COMMAND = `launchctl kickstart -k gui/$(id -u)/${RELAY_SERVICE_NAME}`;
