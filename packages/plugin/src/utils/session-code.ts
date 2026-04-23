/**
 * Session code utilities.
 *
 * A session code is a 6-character A-Z 0-9 string that scopes plugin ↔ extension
 * requests to the cloud relay. Plugin generates it; extension either receives
 * it via auto-pair URL handshake (see background.ts) or gets it typed manually
 * from the options page.
 */

const SESSION_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export const SESSION_CODE_LENGTH = 6;
export const SESSION_CODE_PATTERN = /^[A-Z0-9]{6}$/;

/**
 * Query-string parameter used for the plugin ↔ extension auto-pair handshake.
 * MUST stay in sync with `PAIR_QUERY_PARAM` in `packages/extension/src/background.ts`.
 * A contract test verifies both sides match.
 */
export const PAIR_QUERY_PARAM = 'contentify_pair';

/** Host of the handshake URL. Extension host_permissions cover `*.ya.ru` and root. */
export const PAIR_HANDSHAKE_HOST = 'https://ya.ru/';

export function generateSessionCode(): string {
  let code = '';
  for (let i = 0; i < SESSION_CODE_LENGTH; i++) {
    code += SESSION_CODE_CHARS.charAt(Math.floor(Math.random() * SESSION_CODE_CHARS.length));
  }
  return code;
}

export function isValidSessionCode(code: unknown): code is string {
  return typeof code === 'string' && SESSION_CODE_PATTERN.test(code);
}

/** Build the ya.ru handshake URL carrying a session code for the extension to pick up. */
export function buildPairUrl(sessionCode: string): string {
  return `${PAIR_HANDSHAKE_HOST}?${PAIR_QUERY_PARAM}=${encodeURIComponent(sessionCode)}`;
}
