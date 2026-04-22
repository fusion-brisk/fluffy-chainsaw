/**
 * Contentify Extension — Configuration
 *
 * Cloud relay base URL (Yandex Cloud API Gateway).
 * Baked into the bundle; no env override.
 * Paths: /push /peek /ack /reject /status /clear /health
 * All paths (except /health) require ?session=<6-char-A-Z0-9>
 */
export const CLOUD_RELAY_URL = 'https://d5dtufo5i8flvjqbfak6.628pfjdx.apigw.yandexcloud.net';

/** chrome.storage.local key for the user's session code (6-char A-Z0-9). */
export const SESSION_CODE_KEY = 'sessionCode';

/** Regex that a valid session code must match. */
export const SESSION_CODE_PATTERN = /^[A-Z0-9]{6}$/;
