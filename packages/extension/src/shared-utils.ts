/**
 * Shared utilities for extension scripts
 */

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

/** Get relay URL from chrome storage */
export async function getRelayUrl(): Promise<string> {
  const { relayUrl } = await chrome.storage.local.get('relayUrl');
  return (relayUrl as string) || 'http://localhost:3847';
}

export {};
