/**
 * EProductSnippet Extension — Popup with Relay Setup
 * 
 * Single-click to parse & send to Figma.
 * Shows setup UI when relay is not connected.
 */

// Elements
const mainView = document.getElementById('mainView');
const setupView = document.getElementById('setupView');
const indicator = document.getElementById('indicator');
const statusEl = document.getElementById('status');
const hintEl = document.getElementById('hint');
const copyBtn = document.getElementById('copyBtn');
const retryBtn = document.getElementById('retryBtn');
const installScript = document.getElementById('installScript');

let isProcessing = false;

// Install script
const INSTALL_SCRIPT = 'curl -fsSL https://raw.githubusercontent.com/fusion-brisk/fluffy-chainsaw/main/scripts/install-relay.sh | bash';

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

// Check relay availability
async function checkRelay(url) {
  try {
    const res = await fetch(`${url}/status`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

// Parse page data
async function parsePageData(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js']
  });
  return results[0]?.result;
}

// Transform rows for relay
function transformRowsForRelay(rows) {
  return rows.map(row => ({
    title: row['#OrganicTitle'] || '',
    priceText: row['#OrganicPrice'] ? `${row['#OrganicPrice']} ${row['#Currency'] || '₽'}` : '',
    href: row['#ProductURL'] || '',
    imageUrl: row['#OrganicImage'] || '',
    shopName: row['#ShopName'] || '',
    domain: row['#OrganicHost'] || '',
    faviconUrl: row['#FaviconImage'] || '',
    productRating: row['#ProductRating'] || '',
    shopRating: row['#ShopInfo-Ugc'] || row['#ShopRating'] || '',
    currentPrice: row['#OrganicPrice'] || '',
    oldPrice: row['#OldPrice'] || '',
    discountPercent: row['#DiscountPercent'] || '',
    discount: row['#discount'] || '',
    currency: row['#Currency'] || '₽',
    snippetType: row['#SnippetType'] || 'Organic',
    _rawCSVRow: row
  }));
}

// Show main view
function showMainView() {
  mainView.style.display = 'flex';
  setupView.classList.remove('visible');
}

// Show setup view
function showSetupView() {
  mainView.style.display = 'none';
  setupView.classList.add('visible');
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

// Main send handler
async function handleClick() {
  if (isProcessing) return;
  
  isProcessing = true;
  setState('loading', 'Отправка...', '');
  
  try {
    const tab = await getCurrentTab();
    
    if (!isYandexPage(tab.url)) {
      setState('disabled', 'Не страница Яндекса', 'Откройте ya.ru');
      isProcessing = false;
      return;
    }
    
    const relayUrl = await getRelayUrl();
    
    // Check relay
    const relayOk = await checkRelay(relayUrl);
    if (!relayOk) {
      showSetupView();
      isProcessing = false;
      return;
    }
    
    // Parse page
    setState('loading', 'Парсинг...', '');
    const parseResult = await parsePageData(tab.id);
    
    if (!parseResult || parseResult.error || !parseResult.rows?.length) {
      setState('error', 'Нет данных', parseResult?.error || 'Сниппеты не найдены');
      isProcessing = false;
      return;
    }
    
    const rows = parseResult.rows;
    
    // Send to relay
    setState('loading', `${rows.length} элементов...`, '');
    
    const payload = {
      schemaVersion: 1,
      source: { url: tab.url, title: tab.title },
      capturedAt: new Date().toISOString(),
      items: transformRowsForRelay(rows),
      rawRows: rows
    };
    
    const res = await fetch(`${relayUrl}/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload,
        meta: { url: tab.url, parsedAt: new Date().toISOString(), snippetCount: rows.length }
      })
    });
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    
    // Success!
    setState('success', `${rows.length} → Figma`, 'Готово!');
    
    // Close popup after short delay
    setTimeout(() => window.close(), 1200);
    
  } catch (err) {
    setState('error', 'Ошибка', err.message || 'Попробуйте снова');
  } finally {
    isProcessing = false;
  }
}

// Copy script to clipboard
async function handleCopy() {
  try {
    await navigator.clipboard.writeText(INSTALL_SCRIPT);
    copyBtn.textContent = '✓';
    copyBtn.classList.add('copied');
    setTimeout(() => {
      copyBtn.textContent = '📋';
      copyBtn.classList.remove('copied');
    }, 2000);
  } catch (err) {
    console.error('Copy failed:', err);
  }
}

// Retry connection
async function handleRetry() {
  retryBtn.textContent = '...';
  retryBtn.disabled = true;
  
  const relayUrl = await getRelayUrl();
  const relayOk = await checkRelay(relayUrl);
  
  if (relayOk) {
    showMainView();
    setState('ready', 'Готов', 'Клик для отправки');
  } else {
    retryBtn.textContent = 'Проверить';
    retryBtn.disabled = false;
  }
}

// Initialize
(async () => {
  const tab = await getCurrentTab();
  const relayUrl = await getRelayUrl();
  
  // Check relay availability first
  const relayOk = await checkRelay(relayUrl);
  
  if (!relayOk) {
    // Show setup view
    showSetupView();
    return;
  }
  
  // Check if on Yandex page
  if (!isYandexPage(tab?.url)) {
    setState('disabled', 'Не Яндекс', 'Откройте ya.ru');
    hintEl.textContent = '';
    return;
  }
  
  // Ready to send
  setState('ready', 'Готов', 'Клик для отправки');
  
  // Bind click to main view
  mainView.addEventListener('click', handleClick);
})();

// Event listeners
copyBtn.addEventListener('click', handleCopy);
retryBtn.addEventListener('click', handleRetry);
