/**
 * Contentify Extension — Popup (cloud-only)
 *
 * Single-click to parse & send to cloud relay. If the session code is
 * missing, the popup surfaces it and offers an "Open options" button
 * instead of the default action.
 */

import { CLOUD_RELAY_URL } from './config';
import { isYandexPage, getSessionCode } from './shared-utils';

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
const sessionRow = document.getElementById('sessionRow');
const sessionLabel = document.getElementById('sessionLabel');
const sessionAction = document.getElementById('sessionAction') as HTMLButtonElement | null;

let isProcessing = false;

// Get current tab
async function getCurrentTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Check cloud relay availability (best-effort, 1.5s timeout)
async function checkCloudRelay(sessionCode: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${CLOUD_RELAY_URL}/health?session=${encodeURIComponent(sessionCode)}`,
      {
        signal: AbortSignal.timeout(1500),
      },
    );
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
  } catch {
    /* no cached rules */
  }
  return null;
}

// Parse page data
async function parsePageData(tabId: number): Promise<ParseResult | undefined> {
  // Inject shared parsing rules before content script
  const rules = await loadCachedRules();
  if (rules) {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (r: unknown) => {
        (window as Window).__contentifyParsingRules = r;
      },
      args: [rules],
    });
  }

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    files: ['dist/content.js'],
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
      case 'missing':
        indicator.textContent = '🔑';
        break;
      default:
        indicator.textContent = '📤';
    }
  }
}

// Build a safe status node for the session row (no innerHTML).
function buildSessionLabel(configured: boolean, sessionCode: string | null): void {
  if (!sessionLabel) return;
  // Clear existing children.
  while (sessionLabel.firstChild) {
    sessionLabel.removeChild(sessionLabel.firstChild);
  }

  const iconSpan = document.createElement('span');
  iconSpan.className = configured ? 'session-check' : 'session-warn';
  iconSpan.textContent = configured ? '✓' : '⚠️';
  sessionLabel.appendChild(iconSpan);

  const textNode = document.createTextNode(configured ? ' Session ' : ' Session code не задан');
  sessionLabel.appendChild(textNode);

  if (configured && sessionCode) {
    const codeEl = document.createElement('code');
    codeEl.textContent = `${sessionCode.slice(0, 2)}••••`;
    sessionLabel.appendChild(codeEl);
  }
}

// Render session-code status strip at bottom of popup
function renderSessionStatus(sessionCode: string | null): void {
  if (!sessionRow || !sessionLabel || !sessionAction) return;

  const configured = Boolean(sessionCode);
  sessionRow.className = `session-row ${configured ? 'configured' : 'missing'}`;
  buildSessionLabel(configured, sessionCode);
  sessionAction.textContent = configured ? 'Change' : 'Open options';
}

// Main send handler (cloud-only)
async function handleClick(): Promise<void> {
  if (isProcessing) return;

  const sessionCode = await getSessionCode();
  if (!sessionCode) {
    setState('missing', 'Нет session code', 'Откройте настройки');
    chrome.runtime.openOptionsPage();
    return;
  }

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
      productCard: productCard,
    };

    const meta = {
      url: tab.url,
      parsedAt: new Date().toISOString(),
      snippetCount: rows.length,
      wizardCount: wizards.length,
    };

    // Send to cloud relay
    let relaySuccess = false;

    try {
      const res = await fetch(
        `${CLOUD_RELAY_URL}/push?session=${encodeURIComponent(sessionCode)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payload, meta }),
          signal: AbortSignal.timeout(5000),
        },
      );
      relaySuccess = res.ok;
    } catch {
      // Cloud relay not reachable
    }

    // Result
    const wizardSuffix = wizards.length > 0 ? ` + ${wizards.length} wizard` : '';
    const pcSuffix = productCard ? ' + sidebar' : '';
    if (relaySuccess) {
      setState('success', `${rows.length}${wizardSuffix}${pcSuffix} → Figma`, 'Готово');
    } else {
      setState('error', 'Cloud relay недоступен', 'Проверьте session code и сеть');
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
  const sessionCode = await getSessionCode();
  renderSessionStatus(sessionCode);

  sessionAction?.addEventListener('click', (e) => {
    e.stopPropagation();
    chrome.runtime.openOptionsPage();
  });

  // Check if on Yandex page
  if (!isYandexPage(tab?.url)) {
    setState('disabled', 'Не Яндекс', 'Откройте ya.ru');
    mainView?.addEventListener('click', handleClick);
    return;
  }

  if (!sessionCode) {
    setState('missing', 'Нет session code', 'Откройте настройки');
    mainView?.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
    return;
  }

  // Best-effort health check for indicator colour
  const relayOk = await checkCloudRelay(sessionCode);
  if (relayOk) {
    setState('ready', 'Готов', 'Клик → Figma');
  } else {
    setState('ready', 'Готов', 'Cloud relay недоступен — попробуйте');
  }

  mainView?.addEventListener('click', handleClick);
})();

export {};
