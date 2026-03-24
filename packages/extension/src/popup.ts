/**
 * Contentify Extension — Popup (Relay-Only Architecture)
 *
 * Single-click to parse & send to relay server.
 */

import { isYandexPage, getRelayUrl } from './shared-utils';

declare global {
  interface Window {
    __contentifyParsingRules?: unknown;
  }
}

interface ParseResult {
  error?: string;
  rows?: Record<string, string>[];
  wizards?: unknown[];
  productCard?: unknown;
}

// Elements
const mainView = document.getElementById('mainView');
const indicator = document.getElementById('indicator');
const statusEl = document.getElementById('status');
const hintEl = document.getElementById('hint');

let isProcessing = false;

// Get current tab
async function getCurrentTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Check relay availability (non-blocking)
async function checkRelay(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/status`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

// Load cached parsing rules (shared with plugin)
async function loadCachedRules(): Promise<unknown> {
  try {
    const cached = await chrome.storage.local.get('parsingRulesCache');
    const cache = cached.parsingRulesCache as Record<string, unknown> | undefined;
    if (cache?.rules) {
      return cache.rules;
    }
  } catch { /* no cached rules */ }
  return null;
}

// Parse page data
async function parsePageData(tabId: number): Promise<ParseResult | undefined> {
  // Inject shared parsing rules before content script
  const rules = await loadCachedRules();
  if (rules) {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (r: unknown) => { (window as Window).__contentifyParsingRules = r; },
      args: [rules]
    });
  }

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    files: ['dist/content.js']
  });
  return results[0]?.result as ParseResult | undefined;
}

// Update UI state
function setState(state: string, message: string, hint: string = ''): void {
  if (indicator) {
    indicator.className = `indicator ${state}`;
  }
  if (statusEl) {
    statusEl.className = `status ${state}`;
    statusEl.textContent = message;
  }
  if (hintEl) {
    hintEl.textContent = hint;
  }
  if (mainView) {
    mainView.className = `main-view ${state}`;
  }

  // Update indicator icon
  if (indicator) {
    switch (state) {
      case 'loading':
        indicator.textContent = '⏳';
        break;
      case 'success':
        indicator.textContent = '✅';
        break;
      case 'error':
        indicator.textContent = '❌';
        break;
      case 'disabled':
        indicator.textContent = '🌐';
        break;
      default:
        indicator.textContent = '📤';
    }
  }
}

// Main send handler (relay-only)
async function handleClick(): Promise<void> {
  if (isProcessing) return;

  isProcessing = true;
  setState('loading', 'Парсинг...', '');

  try {
    const tab = await getCurrentTab();

    if (!isYandexPage(tab.url)) {
      setState('disabled', 'Не Яндекс', 'Откройте ya.ru');
      isProcessing = false;
      return;
    }

    // Parse page
    const parseResult = await parsePageData(tab.id!);

    if (!parseResult || parseResult.error || !parseResult.rows?.length) {
      setState('error', 'Нет данных', parseResult?.error || 'Сниппеты не найдены');
      isProcessing = false;
      return;
    }

    const rows = parseResult.rows;
    const wizards = parseResult.wizards || [];
    const productCard = parseResult.productCard || null;

    // Build payload
    const totalItems = rows.length + wizards.length;
    setState('loading', `${totalItems} элементов...`, '');

    const payload = {
      schemaVersion: 3,
      source: { url: tab.url, title: tab.title },
      capturedAt: new Date().toISOString(),
      rawRows: rows,
      wizards: wizards,
      productCard: productCard
    };

    const meta = {
      url: tab.url,
      parsedAt: new Date().toISOString(),
      snippetCount: rows.length,
      wizardCount: wizards.length
    };

    // Send to relay
    const relayUrl = await getRelayUrl();
    let relaySuccess = false;

    try {
      const relayOk = await checkRelay(relayUrl);
      if (relayOk) {
        const res = await fetch(`${relayUrl}/push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payload, meta }),
          signal: AbortSignal.timeout(2000)
        });
        relaySuccess = res.ok;
      }
    } catch {
      // Relay not available
    }

    // Result
    const wizardSuffix = wizards.length > 0 ? ` + ${wizards.length} wizard` : '';
    const pcSuffix = productCard ? ' + sidebar' : '';
    if (relaySuccess) {
      setState('success', `${rows.length}${wizardSuffix}${pcSuffix} → Figma`, 'Автоматически!');
    } else {
      setState('error', `Relay недоступен`, 'Запустите relay сервер');
    }

    // Close popup after short delay
    if (relaySuccess) {
      setTimeout(() => window.close(), 1000);
    }

  } catch (err: unknown) {
    console.error('Error:', err);
    setState('error', 'Ошибка', (err as Error).message || 'Попробуйте снова');
  } finally {
    isProcessing = false;
  }
}

// Initialize
(async () => {
  const tab = await getCurrentTab();

  // Check if on Yandex page
  if (!isYandexPage(tab?.url)) {
    setState('disabled', 'Не Яндекс', 'Откройте ya.ru');
    return;
  }

  // Check relay for indicator
  const relayUrl = await getRelayUrl();
  const relayOk = await checkRelay(relayUrl);

  if (relayOk) {
    setState('ready', 'Готов', 'Клик → Figma');
  } else {
    setState('ready', 'Готов (relay offline)', 'Запустите relay сервер');
  }

  // Bind click to main view
  mainView?.addEventListener('click', handleClick);
})();

export {};
