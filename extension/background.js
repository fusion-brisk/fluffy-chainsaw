/**
 * EProductSnippet Extension — Background Service Worker
 * 
 * Handles toolbar icon click → parse page → send to Figma
 * 
 * Relay modes:
 * 1. Native Host (recommended) — auto-starts relay via Native Messaging
 * 2. Manual — user runs relay server manually
 */

const DEFAULT_RELAY_URL = 'http://localhost:3847';
const NATIVE_HOST_NAME = 'com.eproductsnippet.relay';

// === Native Messaging ===

let nativePort = null;
let nativeHostAvailable = null; // null = unknown, true = available, false = not available
let relayStarted = false;

/**
 * Подключается к Native Host и запускает relay
 */
function connectToNativeHost() {
  if (nativePort) {
    return Promise.resolve(true);
  }
  
  return new Promise((resolve) => {
    try {
      nativePort = chrome.runtime.connectNative(NATIVE_HOST_NAME);
      
      nativePort.onMessage.addListener((message) => {
        console.log('[NativeHost] Message:', message);
        if (message.action === 'started' || message.running) {
          relayStarted = true;
          nativeHostAvailable = true;
        }
      });
      
      nativePort.onDisconnect.addListener(() => {
        const error = chrome.runtime.lastError;
        console.log('[NativeHost] Disconnected:', error?.message || 'unknown');
        nativePort = null;
        relayStarted = false;
        
        // Если host не найден — помечаем как недоступный
        if (error?.message?.includes('not found') || error?.message?.includes('Native host has exited')) {
          nativeHostAvailable = false;
        }
      });
      
      // Даём время на подключение
      setTimeout(() => {
        if (nativePort) {
          nativeHostAvailable = true;
          relayStarted = true;
          resolve(true);
        } else {
          resolve(false);
        }
      }, 500);
      
    } catch (e) {
      console.log('[NativeHost] Connect error:', e);
      nativeHostAvailable = false;
      resolve(false);
    }
  });
}

/**
 * Проверяет, доступен ли relay (через health endpoint)
 */
async function checkRelayHealth(url) {
  try {
    const res = await fetch(`${url}/health`, { 
      method: 'GET',
      signal: AbortSignal.timeout(2000)
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Гарантирует, что relay запущен
 * Сначала пробует Native Host, потом проверяет ручной запуск
 */
async function ensureRelayRunning() {
  const relayUrl = await getRelayUrl();
  
  // Если уже работает — ОК
  if (await checkRelayHealth(relayUrl)) {
    return true;
  }
  
  // Пробуем Native Host (если ещё не пробовали или он доступен)
  if (nativeHostAvailable !== false) {
    const connected = await connectToNativeHost();
    if (connected) {
      // Ждём немного, пока relay запустится
      await new Promise(r => setTimeout(r, 1000));
      if (await checkRelayHealth(relayUrl)) {
        return true;
      }
    }
  }
  
  // Relay недоступен
  return false;
}

// Check if page is Yandex
function isYandexPage(url) {
  if (!url) return false;
  try {
    const hostname = new URL(url).hostname;
    return hostname.includes('yandex') || hostname.includes('ya.ru');
  } catch {
    return false;
  }
}

// Get relay URL from storage
async function getRelayUrl() {
  const { relayUrl } = await chrome.storage.local.get('relayUrl');
  return relayUrl || DEFAULT_RELAY_URL;
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

// Set badge text and color
function setBadge(text, color) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
}

// Clear badge after delay
function clearBadgeAfter(ms) {
  setTimeout(() => {
    chrome.action.setBadgeText({ text: '' });
  }, ms);
}

// Main handler for icon click
async function handleIconClick(tab) {
  // Check if on Yandex page
  if (!isYandexPage(tab.url)) {
    setBadge('✗', '#E5534B');
    clearBadgeAfter(2000);
    return;
  }
  
  // Show loading state
  setBadge('...', '#5865F2');
  
  try {
    // Ensure relay is running (via Native Host or manual)
    const relayOk = await ensureRelayRunning();
    if (!relayOk) {
      console.warn('Relay not available, trying anyway...');
    }
    
    // Parse page using content script
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });
    
    const parseResult = results[0]?.result;
    
    if (!parseResult || parseResult.error || !parseResult.rows?.length) {
      setBadge('0', '#E5534B');
      clearBadgeAfter(2000);
      return;
    }
    
    const rows = parseResult.rows;
    const relayUrl = await getRelayUrl();
    
    // Build payload
    const payload = {
      schemaVersion: 1,
      source: { url: tab.url, title: tab.title },
      capturedAt: new Date().toISOString(),
      items: transformRowsForRelay(rows),
      rawRows: rows
    };
    
    // Send to relay
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
    setBadge(`${rows.length}`, '#3FB950');
    clearBadgeAfter(3000);
    
    // Open Figma via deeplink (execute in page context)
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // Create invisible link and click it to trigger deeplink
          const a = document.createElement('a');
          a.href = 'figma://';
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      });
    } catch {
      // Deeplink failed, ignore
    }
    
  } catch (err) {
    console.error('Send to Figma error:', err);
    
    // Показываем более информативный бейдж
    if (err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
      setBadge('⚡', '#E5534B'); // Relay not running
      console.log('Hint: Install Native Host or run "npm run relay" manually');
    } else {
      setBadge('!', '#E5534B');
    }
    clearBadgeAfter(2000);
  }
}

// Listen for icon clicks
chrome.action.onClicked.addListener(handleIconClick);

// Update icon state when tab changes
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    updateIconForTab(tab);
  } catch {
    // Tab might not exist
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    updateIconForTab(tab);
  }
});

// Update icon appearance based on current tab
function updateIconForTab(tab) {
  if (isYandexPage(tab.url)) {
    // On Yandex - ready to parse (green frog)
    chrome.action.setIcon({
      path: {
        16: 'icons/icon16-green.png',
        48: 'icons/icon48-green.png',
        128: 'icons/icon128-green.png'
      }
    });
    chrome.action.setTitle({ title: 'Отправить в Figma' });
  } else {
    // Not on Yandex (gray frog)
    chrome.action.setIcon({
      path: {
        16: 'icons/icon16-gray.png',
        48: 'icons/icon48-gray.png',
        128: 'icons/icon128-gray.png'
      }
    });
    chrome.action.setTitle({ title: 'Откройте страницу Яндекса' });
  }
}

// === Startup ===

// При загрузке Service Worker — пробуем подключиться к Native Host
// Это запустит relay автоматически, если host установлен
(async () => {
  console.log('[EProductSnippet] Background service worker loaded');
  
  // Пробуем Native Host в фоне (не блокируя)
  const connected = await connectToNativeHost();
  if (connected) {
    console.log('[EProductSnippet] Native Host connected, relay should be running');
  } else {
    console.log('[EProductSnippet] Native Host not available, relay needs manual start');
    console.log('[EProductSnippet] Run: cd native-host && ./install-macos.sh (or .bat for Windows)');
  }
})();
