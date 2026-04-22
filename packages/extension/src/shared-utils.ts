/**
 * Shared utilities for extension scripts
 */

import { SESSION_CODE_KEY, SESSION_CODE_PATTERN } from './config';

/** Check if a URL belongs to a Yandex page */
export function isYandexPage(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const hostname = new URL(url).hostname;
    return hostname.includes('yandex') || hostname.includes('ya.ru');
  } catch {
    return false;
  }
}

/**
 * Read the 6-char session code from chrome.storage.local.
 * Returns null if missing or malformed.
 */
export async function getSessionCode(): Promise<string | null> {
  const stored = await chrome.storage.local.get(SESSION_CODE_KEY);
  const value = stored[SESSION_CODE_KEY];
  return typeof value === 'string' && SESSION_CODE_PATTERN.test(value) ? value : null;
}

export {};
