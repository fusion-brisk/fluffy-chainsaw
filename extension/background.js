/**
 * Contentify Extension — Background Service Worker
 * 
 * Handles toolbar icon click → parse page → send to Figma
 * 
 * Relay modes:
 * 1. Native Host (recommended) — auto-starts relay via Native Messaging
 * 2. Manual — user runs relay server manually
 */

const DEFAULT_RELAY_URL = 'http://localhost:3847';
const NATIVE_HOST_NAME = 'com.contentify.relay';

// === Retry Configuration ===
const RETRY_DELAYS = [1000, 3000, 10000]; // Exponential backoff: 1s, 3s, 10s
const MAX_RETRIES = 3;

// === Retry Queue ===
// Stores pending pushes that failed and need retry
let retryQueue = [];
let isRetrying = false;

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

// Build human-readable summary for clipboard (debug-friendly, no raw data)
function buildItemsSummary(rows) {
  return rows.map(row => ({
    title: row['#OrganicTitle'] || '',
    priceText: row['#OrganicPrice'] ? `${row['#OrganicPrice']} ${row['#Currency'] || '₽'}` : '',
    shopName: row['#ShopName'] || '',
    snippetType: row['#SnippetType'] || 'Organic'
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
    // Don't clear if there are pending retries
    if (retryQueue.length === 0) {
      chrome.action.setBadgeText({ text: '' });
    }
  }, ms);
}

// === Retry Queue Functions ===

/**
 * Add item to retry queue
 */
function addToRetryQueue(item) {
  retryQueue.push({
    ...item,
    retryCount: 0,
    addedAt: Date.now()
  });
  updateRetryBadge();
  console.log(`[Retry] Added to queue, size: ${retryQueue.length}`);
  
  // Also save to storage for clipboard fallback
  savePendingDataToStorage(item);
  
  // Start retry process if not already running
  if (!isRetrying) {
    processRetryQueue();
  }
}

/**
 * Save pending data to chrome.storage.local for clipboard fallback
 */
async function savePendingDataToStorage(item) {
  try {
    await chrome.storage.local.set({
      pendingData: {
        payload: item.payload,
        meta: item.meta,
        savedAt: Date.now()
      }
    });
    console.log('[Fallback] Data saved to storage for clipboard fallback');
  } catch (err) {
    console.error('[Fallback] Failed to save to storage:', err);
  }
}

/**
 * Clear pending data from storage (called after successful delivery)
 */
async function clearPendingDataFromStorage() {
  try {
    await chrome.storage.local.remove('pendingData');
    console.log('[Fallback] Cleared pending data from storage');
  } catch (err) {
    console.error('[Fallback] Failed to clear storage:', err);
  }
}

/**
 * Update badge to show pending retries
 */
function updateRetryBadge() {
  if (retryQueue.length > 0) {
    setBadge(`${retryQueue.length}↻`, '#D29922'); // Yellow/orange for pending
  }
}

/**
 * Process retry queue with exponential backoff
 */
async function processRetryQueue() {
  if (isRetrying || retryQueue.length === 0) return;
  
  isRetrying = true;
  console.log(`[Retry] Processing queue, ${retryQueue.length} items`);
  
  while (retryQueue.length > 0) {
    const item = retryQueue[0];
    const delay = RETRY_DELAYS[Math.min(item.retryCount, RETRY_DELAYS.length - 1)];
    
    console.log(`[Retry] Attempt ${item.retryCount + 1}/${MAX_RETRIES} in ${delay}ms`);
    setBadge(`${retryQueue.length}↻`, '#D29922');
    
    // Wait before retry
    await new Promise(r => setTimeout(r, delay));
    
    // Try to send
    const success = await attemptPush(item);
    
    if (success) {
      // Remove from queue on success
      retryQueue.shift();
      console.log(`[Retry] Success! Remaining: ${retryQueue.length}`);
      
      // Clear pending data from storage on success
      clearPendingDataFromStorage();
      
      if (retryQueue.length === 0) {
        setBadge('✓', '#3FB950');
        clearBadgeAfter(2000);
        
        // Open Figma on successful retry
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab) {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: () => {
                const a = document.createElement('a');
                a.href = 'figma://';
                a.style.display = 'none';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
              }
            });
          }
        } catch {
          // Deeplink failed, ignore
        }
      } else {
        updateRetryBadge();
      }
    } else {
      // Increment retry count
      item.retryCount++;
      
      if (item.retryCount >= MAX_RETRIES) {
        // Max retries reached, remove from queue
        retryQueue.shift();
        console.log(`[Retry] Max retries reached, dropping item. Remaining: ${retryQueue.length}`);
        
        if (retryQueue.length === 0) {
          setBadge('✗', '#E5534B');
          clearBadgeAfter(3000);
        }
      }
    }
  }
  
  isRetrying = false;
}

/**
 * Attempt to push data to relay
 * Returns true on success, false on failure
 */
async function attemptPush(item) {
  const relayUrl = await getRelayUrl();
  
  try {
    const res = await fetch(`${relayUrl}/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload: item.payload,
        meta: item.meta
      }),
      signal: AbortSignal.timeout(5000)
    });
    
    return res.ok;
  } catch (err) {
    console.log(`[Retry] Push failed:`, err.message);
    return false;
  }
}

/**
 * Copy data to clipboard via content script
 * Service workers can't access clipboard directly, so we inject a script
 */
async function copyToClipboard(tabId, data) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (jsonData) => {
        // Copy to clipboard using modern API with fallback
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(jsonData).catch(() => {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = jsonData;
            textarea.style.cssText = 'position:fixed;left:-9999px;';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
          });
        } else {
          // execCommand fallback
          const textarea = document.createElement('textarea');
          textarea.value = jsonData;
          textarea.style.cssText = 'position:fixed;left:-9999px;';
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
        }
      },
      args: [data]
    });
    console.log('[Clipboard] Data copied to clipboard');
    return true;
  } catch (e) {
    console.error('[Clipboard] Failed to copy:', e);
    return false;
  }
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
  
  // Declare at higher scope for access in catch block
  let parseResult = null;
  
  try {
    // Load shared parsing rules (cached, non-blocking)
    const rules = await loadParsingRules();
    
    // Inject parsing rules into page before content script
    if (rules) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (r) => { window.__contentifyParsingRules = r; },
        args: [rules]
      });
    }
    
    // Parse page using content script
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });
    
    parseResult = results[0]?.result;
    
    if (!parseResult || parseResult.error || !parseResult.rows?.length) {
      setBadge('0', '#E5534B');
      clearBadgeAfter(2000);
      return;
    }
    
    const rows = parseResult.rows;
    const wizards = parseResult.wizards || [];
    
    // Build payload (schemaVersion 3: rawRows + wizards)
    const payload = {
      schemaVersion: 3,
      source: { url: tab.url, title: tab.title },
      capturedAt: new Date().toISOString(),
      rawRows: rows,
      wizards: wizards
    };
    
    const meta = { 
      url: tab.url, 
      parsedAt: new Date().toISOString(), 
      snippetCount: rows.length,
      wizardCount: wizards.length
    };
    
    // ALWAYS copy to clipboard first (clipboard-first architecture)
    // Clipboard payload includes human-readable items summary for debug
    const clipboardData = JSON.stringify({
      type: 'contentify-paste',
      payload: {
        ...payload,
        items: buildItemsSummary(rows) // Debug-only summary, no _rawCSVRow
      },
      meta
    });
    
    await copyToClipboard(tab.id, clipboardData);
    
    // Try to send to relay (optional, non-blocking)
    const relayUrl = await getRelayUrl();
    let relaySuccess = false;
    
    try {
      // Quick relay check
      const relayOk = await ensureRelayRunning();
      if (relayOk) {
        const res = await fetch(`${relayUrl}/push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payload, meta }),
          signal: AbortSignal.timeout(3000)
        });
        relaySuccess = res.ok;
      }
    } catch (relayErr) {
      console.log('[Relay] Not available, using clipboard fallback:', relayErr.message);
    }
    
    // Success! Data is copied (and optionally sent to relay)
    setBadge(`${rows.length}`, '#3FB950');
    clearBadgeAfter(3000);
    
    // Clear any pending fallback data
    if (relaySuccess) {
      clearPendingDataFromStorage();
    } else {
      // Save for retry if relay was unavailable
      savePendingDataToStorage({ payload, meta });
    }
    
    // Open Figma via deeplink
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
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
    console.error('Parse/copy error:', err);
    setBadge('!', '#E5534B');
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

// === Parsing Rules (shared with plugin) ===

const PARSING_RULES_URL = 'https://raw.githubusercontent.com/fusion-brisk/fluffy-chainsaw/main/config/parsing-rules.json';
const RULES_CACHE_KEY = 'parsingRulesCache';
const RULES_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Загружает parsing rules из кэша или удалённого конфига
 * Используется для синхронизации селекторов между extension и plugin
 */
async function loadParsingRules() {
  try {
    // Try cache first
    const cached = await chrome.storage.local.get(RULES_CACHE_KEY);
    if (cached[RULES_CACHE_KEY]) {
      const { rules, fetchedAt } = cached[RULES_CACHE_KEY];
      if (Date.now() - fetchedAt < RULES_CACHE_TTL && rules?.version) {
        console.log(`[Rules] Using cached rules v${rules.version}`);
        return rules;
      }
    }
  } catch { /* cache miss */ }

  // Fetch remote
  try {
    const res = await fetch(PARSING_RULES_URL, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const rules = await res.json();
      if (rules?.version && rules?.rules) {
        await chrome.storage.local.set({
          [RULES_CACHE_KEY]: { rules, fetchedAt: Date.now() }
        });
        console.log(`[Rules] Fetched remote rules v${rules.version}`);
        return rules;
      }
    }
  } catch (e) {
    console.log('[Rules] Remote fetch failed:', e.message);
  }

  // Return null — content.js will use its hardcoded selectors
  return null;
}

// === Startup ===

// При загрузке Service Worker — пробуем подключиться к Native Host
// Это запустит relay автоматически, если host установлен
(async () => {
  console.log('[Contentify] Background service worker loaded');
  
  // Загружаем parsing rules в фоне
  loadParsingRules().catch(e => console.log('[Rules] Background load failed:', e));
  
  // Пробуем Native Host в фоне (не блокируя)
  const connected = await connectToNativeHost();
  if (connected) {
    console.log('[Contentify] Native Host connected, relay should be running');
  } else {
    console.log('[Contentify] Native Host not available, relay needs manual start');
    console.log('[Contentify] Run: cd native-host && ./install-macos.sh (or .bat for Windows)');
  }
})();
