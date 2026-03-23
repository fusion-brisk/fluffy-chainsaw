// @ts-nocheck
/**
 * Contentify Extension — Popup (Relay-Only Architecture)
 *
 * Single-click to parse & send to relay server.
 */

// Elements
const mainView = document.getElementById('mainView');
const indicator = document.getElementById('indicator');
const statusEl = document.getElementById('status');
const hintEl = document.getElementById('hint');

let isProcessing = false;

// Check if page is Yandex
function isYandexPage(url) {
  try {
    const hostname = new URL(url).hostname;
    return hostname.includes('yandex') || hostname.includes('ya.ru');
  } catch {
    return false;
  }
}

// Get current tab
async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Get relay URL from storage
async function getRelayUrl() {
  const { relayUrl } = await chrome.storage.local.get('relayUrl');
  return relayUrl || 'http://localhost:3847';
}

// Check relay availability (non-blocking)
async function checkRelay(url) {
  try {
    const res = await fetch(`${url}/status`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

// Load cached parsing rules (shared with plugin)
async function loadCachedRules() {
  try {
    const cached = await chrome.storage.local.get('parsingRulesCache');
    if (cached.parsingRulesCache?.rules) {
      return cached.parsingRulesCache.rules;
    }
  } catch { /* no cached rules */ }
  return null;
}

// Parse page data
async function parsePageData(tabId) {
  // Inject shared parsing rules before content script
  const rules = await loadCachedRules();
  if (rules) {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (r) => { window.__contentifyParsingRules = r; },
      args: [rules]
    });
  }

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    files: ['dist/content.js']
  });
  return results[0]?.result;
}

// Update UI state
function setState(state, message, hint = '') {
  indicator.className = `indicator ${state}`;
  statusEl.className = `status ${state}`;
  statusEl.textContent = message;
  hintEl.textContent = hint;
  mainView.className = `main-view ${state}`;

  // Update indicator icon
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

// Main send handler (relay-only)
async function handleClick() {
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
    const parseResult = await parsePageData(tab.id);

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

  } catch (err) {
    console.error('Error:', err);
    setState('error', 'Ошибка', err.message || 'Попробуйте снова');
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
  mainView.addEventListener('click', handleClick);
})();
