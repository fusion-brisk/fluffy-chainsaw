/**
 * Contentify Extension — Background Service Worker
 *
 * Handles toolbar icon click → parse page → send to Figma
 *
 * Relay modes:
 * 1. Native Host (recommended) — auto-starts relay via Native Messaging
 * 2. Manual — user runs relay server manually
 */

import { isYandexPage, getRelayUrl } from './shared-utils';

declare global {
  interface Window {
    __contentifyParsingRules?: unknown;
    __contentifyResult?: unknown;
  }
}

interface RetryQueueItem {
  payload: unknown;
  meta: unknown;
  retryCount: number;
  addedAt: number;
}

interface ParseResult {
  error?: string;
  rows?: Record<string, string>[];
  wizards?: unknown[];
  productCard?: unknown;
}

interface PageDimensions {
  scrollHeight: number;
  innerHeight: number;
  innerWidth: number;
  scrollY: number;
  devicePixelRatio: number;
}

interface ScreenshotResult {
  screenshots: string[];
  totalHeight: number;
  viewportHeight: number;
  viewportWidth: number;
  devicePixelRatio: number;
}

interface RulesData {
  version?: string;
  rules?: unknown;
}

const DEFAULT_RELAY_URL = 'http://localhost:3847';
const NATIVE_HOST_NAME = 'com.contentify.relay';

// === Retry Configuration ===
const RETRY_DELAYS = [1000, 3000, 10000]; // Exponential backoff: 1s, 3s, 10s
const MAX_RETRIES = 3;

// === Retry Queue ===
// Stores pending pushes that failed and need retry
let retryQueue: RetryQueueItem[] = [];
let isRetrying = false;

// === Native Messaging ===

let nativePort: chrome.runtime.Port | null = null;
let nativeHostAvailable: boolean | null = null; // null = unknown, true = available, false = not available
let relayStarted = false;

/**
 * Подключается к Native Host и запускает relay
 */
function connectToNativeHost(): Promise<boolean> {
  if (nativePort) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    try {
      nativePort = chrome.runtime.connectNative(NATIVE_HOST_NAME);

      nativePort.onMessage.addListener((message: Record<string, unknown>) => {
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

    } catch (e: unknown) {
      console.log('[NativeHost] Connect error:', e);
      nativeHostAvailable = false;
      resolve(false);
    }
  });
}

/**
 * Проверяет, доступен ли relay (через health endpoint)
 */
async function checkRelayHealth(url: string): Promise<boolean> {
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
async function ensureRelayRunning(): Promise<boolean> {
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

// Set badge text and color
function setBadge(text: string, color: string): void {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
}

// Clear badge after delay
function clearBadgeAfter(ms: number): void {
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
function addToRetryQueue(item: { payload: unknown; meta: unknown }): void {
  retryQueue.push({
    ...item,
    retryCount: 0,
    addedAt: Date.now()
  });
  updateRetryBadge();
  console.log(`[Retry] Added to queue, size: ${retryQueue.length}`);

  // Save to storage for retry persistence
  savePendingDataToStorage(item);

  // Start retry process if not already running
  if (!isRetrying) {
    processRetryQueue();
  }
}

/**
 * Save pending data to chrome.storage.local for retry persistence
 */
async function savePendingDataToStorage(item: { payload: unknown; meta: unknown }): Promise<void> {
  try {
    await chrome.storage.local.set({
      pendingData: {
        payload: item.payload,
        meta: item.meta,
        savedAt: Date.now()
      }
    });
    console.log('[Fallback] Data saved to storage for retry');
  } catch (err: unknown) {
    console.error('[Fallback] Failed to save to storage:', err);
  }
}

/**
 * Clear pending data from storage (called after successful delivery)
 */
async function clearPendingDataFromStorage(): Promise<void> {
  try {
    await chrome.storage.local.remove('pendingData');
    console.log('[Fallback] Cleared pending data from storage');
  } catch (err: unknown) {
    console.error('[Fallback] Failed to clear storage:', err);
  }
}

/**
 * Update badge to show pending retries
 */
function updateRetryBadge(): void {
  if (retryQueue.length > 0) {
    setBadge(`${retryQueue.length}↻`, '#D29922'); // Yellow/orange for pending
  }
}

/**
 * Process retry queue with exponential backoff
 */
async function processRetryQueue(): Promise<void> {
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
          if (tab?.id) {
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
async function attemptPush(item: RetryQueueItem): Promise<boolean> {
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
  } catch (err: unknown) {
    console.log(`[Retry] Push failed:`, (err as Error).message);
    return false;
  }
}

// === Full-Page Screenshot Capture ===

const MAX_CAPTURES = 20; // Cap to avoid runaway on infinite-scroll pages
const SCROLL_SETTLE_MS = 500; // Wait for lazy-load + respect captureVisibleTab rate limit

/**
 * Captures full-page screenshot by scrolling through the page.
 * Resizes viewport to match Figma layout width and hides sticky header / technical UI.
 * Returns { screenshots: [dataUrl, ...], totalHeight, viewportHeight, viewportWidth, devicePixelRatio }
 */
async function captureFullPage(tabId: number, platform: string): Promise<ScreenshotResult> {
  const targetWidth = platform === 'touch' ? 393 : 1440;

  // --- Resize window to match Figma layout width ---
  const tabInfo = await chrome.tabs.get(tabId);
  const win = await chrome.windows.get(tabInfo.windowId);
  const originalWindowWidth = win.width!;

  const [{ result: currentInnerWidth }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => window.innerWidth
  });
  const chromeWidth = win.width! - (currentInnerWidth as number);
  const newWindowWidth = targetWidth + chromeWidth;

  let didResize = false;
  if (newWindowWidth !== win.width) {
    await chrome.windows.update(win.id!, { width: newWindowWidth });
    didResize = true;
    await new Promise(r => setTimeout(r, 300));
  }

  // --- Hide technical UI only (header + ProductsModePanel stay for first segment) ---
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const style = document.createElement('style');
      style.id = 'contentify-screenshot-fix';
      style.textContent = [
        '#ulitochka-container { display: none !important; }',
        '.YndxBug { display: none !important; }',
      ].join('\n');
      document.head.appendChild(style);
    }
  });

  // Read page dimensions (header still visible)
  const [{ result: dims }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      innerWidth: window.innerWidth,
      scrollY: window.scrollY,
      devicePixelRatio: window.devicePixelRatio || 1
    })
  });

  const { scrollHeight, innerHeight, innerWidth, scrollY: originalScrollY, devicePixelRatio } = dims as PageDimensions;
  const screenshots: string[] = [];

  // --- Segment 0: capture WITH header (natural page top) ---
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => window.scrollTo(0, 0)
  });
  await new Promise(r => setTimeout(r, SCROLL_SETTLE_MS));
  screenshots.push(await chrome.tabs.captureVisibleTab(null as unknown as number, { format: 'jpeg', quality: 80 }));

  // --- Hide header + sticky ProductsModePanel for remaining segments ---
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const fix = document.getElementById('contentify-screenshot-fix');
      if (fix) fix.textContent += '\n.HeaderDesktop, .HeaderPhone { display: none !important; }\n.ProductsModePanel { display: none !important; }';
    }
  });

  // Measure how much content shifted up after hiding header
  const [{ result: newScrollHeight }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => document.documentElement.scrollHeight
  });
  const headerOffset = scrollHeight - (newScrollHeight as number);

  // Remaining segments: adjust scroll to account for hidden header
  const remainingCount = Math.min(
    Math.ceil(Math.max(0, (newScrollHeight as number) - (innerHeight - headerOffset)) / innerHeight),
    MAX_CAPTURES - 1
  );

  for (let i = 0; i < remainingCount; i++) {
    const scrollTo = (i + 1) * innerHeight - headerOffset;

    await chrome.scripting.executeScript({
      target: { tabId },
      func: (y: number) => window.scrollTo(0, y),
      args: [scrollTo]
    });

    await new Promise(r => setTimeout(r, SCROLL_SETTLE_MS));
    screenshots.push(await chrome.tabs.captureVisibleTab(null as unknown as number, { format: 'jpeg', quality: 80 }));
  }

  // Restore: scroll position, hidden elements, window size
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (y: number) => {
      window.scrollTo(0, y);
      const fix = document.getElementById('contentify-screenshot-fix');
      if (fix) fix.remove();
    },
    args: [originalScrollY]
  });

  if (didResize) {
    await chrome.windows.update(win.id!, { width: originalWindowWidth });
  }

  return {
    screenshots,
    totalHeight: scrollHeight,
    viewportHeight: innerHeight,
    viewportWidth: innerWidth,
    devicePixelRatio
  };
}

// Main handler for icon click
async function handleIconClick(tab: chrome.tabs.Tab): Promise<void> {
  // Check if on Yandex page
  if (!isYandexPage(tab.url)) {
    setBadge('✗', '#E5534B');
    clearBadgeAfter(2000);
    return;
  }

  // Show loading state
  setBadge('...', '#5865F2');

  // Declare at higher scope for access in catch block
  let parseResult: ParseResult | null = null;

  try {
    // Load shared parsing rules (cached, non-blocking)
    const rules = await loadParsingRules();

    // Inject parsing rules into page before content script
    if (rules) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id! },
        func: (r: unknown) => { (window as Window).__contentifyParsingRules = r; },
        args: [rules]
      });
    }

    // Parse page using content script
    // Note: esbuild wraps content.js in extra IIFE, swallowing the return value.
    // Content script stores result in window.__contentifyResult as fallback.
    await chrome.scripting.executeScript({
      target: { tabId: tab.id! },
      files: ['dist/content.js']
    });

    // Read result from page context (esbuild IIFE prevents direct return)
    const [{ result: pageResult }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id! },
      func: () => (window as Window).__contentifyResult
    });

    parseResult = pageResult as ParseResult | null;

    if (!parseResult || parseResult.error || !parseResult.rows?.length) {
      setBadge('0', '#E5534B');
      clearBadgeAfter(2000);
      return;
    }

    const rows = parseResult.rows;
    const wizards = parseResult.wizards || [];
    const productCard = parseResult.productCard || null;

    // Capture full-page screenshot (scroll + capture loop)
    // Determine platform to match Figma layout width
    const platform = rows.find(r => r['#platform'])?.['#platform'] || 'desktop';
    let screenshots: string[] = [];
    let screenshotMeta: Record<string, unknown> | null = null;
    try {
      const result = await captureFullPage(tab.id!, platform);
      screenshots = result.screenshots;
      screenshotMeta = {
        totalHeight: result.totalHeight,
        viewportHeight: result.viewportHeight,
        viewportWidth: result.viewportWidth,
        devicePixelRatio: result.devicePixelRatio,
        count: result.screenshots.length
      };
      const totalKB = screenshots.reduce((sum, s) => sum + s.length, 0);
      console.log(`[Screenshot] Captured ${screenshots.length} segments, total: ${Math.round(totalKB / 1024)}KB`);
    } catch (screenshotErr: unknown) {
      console.log('[Screenshot] Failed:', (screenshotErr as Error).message);
    }

    // Build payload (schemaVersion 3: rawRows + wizards)
    const payload = {
      schemaVersion: 3,
      source: { url: tab.url, title: tab.title },
      capturedAt: new Date().toISOString(),
      rawRows: rows,
      wizards: wizards,
      productCard: productCard,
      screenshots: screenshots.length > 0 ? screenshots : undefined,
      screenshotMeta: screenshotMeta
    };

    const meta = {
      url: tab.url,
      parsedAt: new Date().toISOString(),
      snippetCount: rows.length,
      wizardCount: wizards.length,
      extensionVersion: chrome.runtime.getManifest().version
    };

    // Send to relay
    const relayUrl = await getRelayUrl();
    let relaySuccess = false;

    try {
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
    } catch (relayErr: unknown) {
      console.log('[Relay] Not available:', (relayErr as Error).message);
    }

    const pcLabel = productCard ? '+PC' : '';
    setBadge(`${rows.length}${pcLabel}`, '#3FB950');
    clearBadgeAfter(3000);

    if (relaySuccess) {
      clearPendingDataFromStorage();
    } else {
      // Save for retry if relay was unavailable
      savePendingDataToStorage({ payload, meta });
    }

    // Open Figma via deeplink
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id! },
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

  } catch (err: unknown) {
    console.error('Parse/copy error:', err);
    setBadge('!', '#E5534B');
    clearBadgeAfter(2000);
  }
}

// Listen for icon clicks
chrome.action.onClicked.addListener(handleIconClick);

// Update icon state when tab changes
chrome.tabs.onActivated.addListener(async ({ tabId }: { tabId: number }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    updateIconForTab(tab);
  } catch {
    // Tab might not exist
  }
});

chrome.tabs.onUpdated.addListener((_tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
  if (changeInfo.status === 'complete') {
    updateIconForTab(tab);
  }
});

// Update icon appearance based on current tab
// Uses chrome.runtime.getURL to avoid MV3 service worker "Failed to fetch" bug
function updateIconForTab(tab: chrome.tabs.Tab): void {
  const variant = isYandexPage(tab.url) ? 'green' : 'gray';
  const title = isYandexPage(tab.url) ? 'Отправить в Figma' : 'Откройте страницу Яндекса';
  chrome.action.setIcon({
    path: {
      16: chrome.runtime.getURL(`icons/icon16-${variant}.png`),
      48: chrome.runtime.getURL(`icons/icon48-${variant}.png`),
      128: chrome.runtime.getURL(`icons/icon128-${variant}.png`)
    }
  });
  chrome.action.setTitle({ title });
}

// === Parsing Rules (shared with plugin) ===

const PARSING_RULES_URL = 'https://raw.githubusercontent.com/fusion-brisk/fluffy-chainsaw/main/config/parsing-rules.json';
const RULES_CACHE_KEY = 'parsingRulesCache';
const RULES_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Загружает parsing rules из кэша или удалённого конфига
 * Используется для синхронизации селекторов между extension и plugin
 */
async function loadParsingRules(): Promise<unknown> {
  try {
    // Try cache first
    const cached = await chrome.storage.local.get(RULES_CACHE_KEY);
    if (cached[RULES_CACHE_KEY]) {
      const { rules, fetchedAt } = cached[RULES_CACHE_KEY] as { rules: RulesData; fetchedAt: number };
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
      const rules = await res.json() as RulesData;
      if (rules?.version && rules?.rules) {
        await chrome.storage.local.set({
          [RULES_CACHE_KEY]: { rules, fetchedAt: Date.now() }
        });
        console.log(`[Rules] Fetched remote rules v${rules.version}`);
        return rules;
      }
    }
  } catch (e: unknown) {
    console.log('[Rules] Remote fetch failed:', (e as Error).message);
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
  loadParsingRules().catch((e: unknown) => console.log('[Rules] Background load failed:', e));

  // Пробуем Native Host в фоне (не блокируя)
  const connected = await connectToNativeHost();
  if (connected) {
    console.log('[Contentify] Native Host connected, relay should be running');
  } else {
    console.log('[Contentify] Native Host not available, relay needs manual start');
    console.log('[Contentify] Run: cd native-host && ./install-macos.sh (or .bat for Windows)');
  }
})();

export {};
