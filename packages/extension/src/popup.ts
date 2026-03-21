// @ts-nocheck
/**
 * Contentify Extension — Popup (Clipboard-First Architecture)
 * 
 * Single-click to parse & copy to clipboard.
 * Relay is optional for automatic transfer.
 * Always works without requiring any setup.
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

// Build human-readable summary for clipboard (debug-friendly, no raw data)
function buildItemsSummary(rows) {
  return rows.map(row => ({
    title: row['#OrganicTitle'] || '',
    priceText: row['#OrganicPrice'] ? `${row['#OrganicPrice']} ${row['#Currency'] || '₽'}` : '',
    shopName: row['#ShopName'] || '',
    snippetType: row['#SnippetType'] || 'Organic'
  }));
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
    case 'copied':
      indicator.textContent = '📋';
      break;
    default:
      indicator.textContent = '📤';
  }
}

// Copy data to clipboard
async function copyToClipboard(data) {
  try {
    await navigator.clipboard.writeText(data);
    return true;
  } catch (err) {
    console.error('Clipboard copy failed:', err);
    return false;
  }
}

// Main send handler (clipboard-first)
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
    
    // Always copy to clipboard first (clipboard-first architecture)
    // Clipboard payload includes human-readable items summary for debug
    const clipboardData = JSON.stringify({
      type: 'contentify-paste',
      payload: {
        ...payload,
        items: buildItemsSummary(rows) // Debug-only summary, no _rawCSVRow
      },
      meta
    });
    
    const copySuccess = await copyToClipboard(clipboardData);
    
    if (!copySuccess) {
      setState('error', 'Ошибка копирования', 'Попробуйте снова');
      isProcessing = false;
      return;
    }
    
    // Try to send to relay (optional, non-blocking)
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
      // Relay not available — clipboard fallback is already done
    }
    
    // Success!
    const wizardSuffix = wizards.length > 0 ? ` + ${wizards.length} wizard` : '';
    const pcSuffix = productCard ? ' + sidebar' : '';
    if (relaySuccess) {
      setState('success', `${rows.length}${wizardSuffix}${pcSuffix} → Figma`, 'Автоматически!');
    } else {
      setState('copied', `${rows.length}${wizardSuffix}${pcSuffix} скопировано`, 'Вставьте в Figma (⌘V)');
    }
    
    // Close popup after short delay
    setTimeout(() => window.close(), relaySuccess ? 1000 : 1500);
    
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
  
  // Ready to parse and copy
  // Check relay for indicator only
  const relayUrl = await getRelayUrl();
  const relayOk = await checkRelay(relayUrl);
  
  if (relayOk) {
    setState('ready', 'Готов', 'Клик → Figma');
  } else {
    setState('ready', 'Готов', 'Клик → Скопировать');
  }
  
  // Bind click to main view
  mainView.addEventListener('click', handleClick);
})();
