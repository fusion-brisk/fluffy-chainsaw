/**
 * Contentify Extension — Background Service Worker
 *
 * Handles toolbar icon click → parse page → send to cloud relay.
 *
 * Architecture: cloud-only. No Native Host, no localhost.
 * Requires a session code (set via options page) that matches the one
 * entered in the Figma plugin.
 */

import { CLOUD_RELAY_URL, SESSION_CODE_KEY, SESSION_CODE_PATTERN } from './config';
import { isYandexPage, getSessionCode } from './shared-utils';

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
  /** 'feed' when content script detected ya.ru rhythm feed */
  sourceType?: 'feed' | 'serp';
  /** Feed card rows (when sourceType='feed') */
  feedCards?: Record<string, string>[];
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

// === Retry Configuration ===
const RETRY_DELAYS = [1000, 3000, 10000]; // Exponential backoff: 1s, 3s, 10s
const MAX_RETRIES = 3;

// === Retry Queue ===
// Stores pending pushes that failed and need retry
let retryQueue: RetryQueueItem[] = [];
let isRetrying = false;

/**
 * Build a cloud relay URL with the session code appended.
 */
function buildCloudUrl(path: string, sessionCode: string): string {
  return `${CLOUD_RELAY_URL}${path}?session=${encodeURIComponent(sessionCode)}`;
}

// === Heads-up signaling ===
//
// Lightweight progress signal sent to relay alongside (and before) the heavy
// payload upload. Plugin polls /status, sees `headsUp` field, renders narrative.
// Fire-and-forget: never blocks main upload, never throws.
//
// Throttling: only the `uploading_screenshots` phase is throttled (it fires per
// screenshot). Other phases are sent immediately. Trailing-edge implementation
// guarantees the final K/M value always lands.

type HeadsUpPhase = 'parsing' | 'uploading_json' | 'uploading_screenshots' | 'finalizing' | 'error';

interface HeadsUpOpts {
  current?: number;
  total?: number;
  message?: string;
}

const HEADS_UP_THROTTLE_MS = 200;
let headsUpLastSentAt = 0;
let headsUpPending: { phase: HeadsUpPhase; opts: HeadsUpOpts } | null = null;
let headsUpTrailingTimer: ReturnType<typeof setTimeout> | null = null;

async function postHeadsUp(
  sessionCode: string,
  phase: HeadsUpPhase,
  opts: HeadsUpOpts,
): Promise<void> {
  try {
    await fetch(buildCloudUrl('/push', sessionCode), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'heads-up', phase, ...opts }),
      signal: AbortSignal.timeout(3000),
    });
  } catch (err) {
    // Fire-and-forget — log only.
    console.log('[HeadsUp] push failed:', (err as Error).message);
  }
}

async function sendHeadsUp(phase: HeadsUpPhase, opts: HeadsUpOpts = {}): Promise<void> {
  const sessionCode = await getSessionCode();
  if (!sessionCode) return;

  const isProgress = phase === 'uploading_screenshots';
  if (!isProgress) {
    headsUpLastSentAt = Date.now();
    void postHeadsUp(sessionCode, phase, opts);
    return;
  }

  const now = Date.now();
  if (now - headsUpLastSentAt >= HEADS_UP_THROTTLE_MS) {
    headsUpLastSentAt = now;
    void postHeadsUp(sessionCode, phase, opts);
    return;
  }

  // Trailing edge: schedule the latest value to fire after the throttle window.
  headsUpPending = { phase, opts };
  if (headsUpTrailingTimer == null) {
    const delay = HEADS_UP_THROTTLE_MS - (now - headsUpLastSentAt);
    headsUpTrailingTimer = setTimeout(() => {
      headsUpTrailingTimer = null;
      if (headsUpPending) {
        const { phase: p, opts: o } = headsUpPending;
        headsUpPending = null;
        headsUpLastSentAt = Date.now();
        void postHeadsUp(sessionCode, p, o);
      }
    }, delay);
  }
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

/**
 * Flag the missing session code in the toolbar.
 * The popup shows a button to open options when clicked.
 */
function setMissingSessionBadge(): void {
  setBadge('!', '#E5534B');
}

/**
 * Counterpart to `setMissingSessionBadge` — called after auto-pairing stores
 * a session code. Does nothing if there are retries pending (their badge wins).
 */
function clearMissingSessionBadge(): void {
  if (retryQueue.length === 0) {
    chrome.action.setBadgeText({ text: '' });
  }
}

// === Retry Queue Functions ===

/**
 * Save pending data to chrome.storage.local for retry persistence
 */
async function savePendingDataToStorage(item: { payload: unknown; meta: unknown }): Promise<void> {
  try {
    await chrome.storage.local.set({
      pendingData: {
        payload: item.payload,
        meta: item.meta,
        savedAt: Date.now(),
      },
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
    await new Promise((r) => setTimeout(r, delay));

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
              },
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
 * Attempt to push data to cloud relay.
 * Returns true on success, false on failure (missing session, network, non-2xx).
 */
async function attemptPush(item: RetryQueueItem): Promise<boolean> {
  const sessionCode = await getSessionCode();
  if (!sessionCode) {
    console.log('[Push] Session code missing, skipping retry attempt');
    return false;
  }

  try {
    const res = await fetch(buildCloudUrl('/push', sessionCode), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload: item.payload,
        meta: item.meta,
      }),
      signal: AbortSignal.timeout(5000),
    });

    return res.ok;
  } catch (err: unknown) {
    console.log(`[Retry] Push failed:`, (err as Error).message);
    return false;
  }
}

/**
 * Add item to retry queue
 */
function addToRetryQueue(item: { payload: unknown; meta: unknown }): void {
  retryQueue.push({
    ...item,
    retryCount: 0,
    addedAt: Date.now(),
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

// === Full-Page Screenshot Capture ===

const MAX_CAPTURES = 20; // Cap to avoid runaway on infinite-scroll pages
const SCROLL_SETTLE_MS = 500; // Wait for lazy-load + respect captureVisibleTab rate limit

/**
 * Captures full-page screenshot by scrolling through the page.
 * Resizes viewport to match Figma layout width and hides sticky header / technical UI.
 * Returns { screenshots: [dataUrl, ...], totalHeight, viewportHeight, viewportWidth, devicePixelRatio }
 */
async function captureFullPage(
  tabId: number,
  platform: string,
  maxContentHeight: number | undefined,
  onSegmentCaptured: (current: number, total: number) => void,
): Promise<ScreenshotResult> {
  const targetWidth = platform === 'touch' ? 393 : 1440;

  // --- Resize window to match Figma layout width ---
  const tabInfo = await chrome.tabs.get(tabId);
  const win = await chrome.windows.get(tabInfo.windowId);
  const originalWindowWidth = win.width!;

  const [{ result: currentInnerWidth }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => window.innerWidth,
  });
  const chromeWidth = win.width! - (currentInnerWidth as number);
  const newWindowWidth = targetWidth + chromeWidth;

  let didResize = false;
  if (newWindowWidth !== win.width) {
    await chrome.windows.update(win.id!, { width: newWindowWidth });
    didResize = true;
    await new Promise((r) => setTimeout(r, 300));
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
    },
  });

  // Read page dimensions (header still visible)
  const [{ result: dims }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      innerWidth: window.innerWidth,
      scrollY: window.scrollY,
      devicePixelRatio: window.devicePixelRatio || 1,
    }),
  });

  const {
    scrollHeight,
    innerHeight,
    innerWidth,
    scrollY: originalScrollY,
    devicePixelRatio,
  } = dims as PageDimensions;
  const screenshots: string[] = [];

  // --- Segment 0: capture WITH header (natural page top) ---
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => window.scrollTo(0, 0),
  });
  await new Promise((r) => setTimeout(r, SCROLL_SETTLE_MS));
  screenshots.push(
    await chrome.tabs.captureVisibleTab(null as unknown as number, { format: 'jpeg', quality: 80 }),
  );
  // Compute final total for narrative: 1 (segment-0) + remainingCount (capped later)
  const projectedTotal =
    1 +
    Math.min(Math.ceil(Math.max(0, scrollHeight - innerHeight) / innerHeight), MAX_CAPTURES - 1);
  onSegmentCaptured(1, projectedTotal);

  // --- Hide header + sticky ProductsModePanel for remaining segments ---
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const fix = document.getElementById('contentify-screenshot-fix');
      if (fix)
        fix.textContent +=
          '\n.HeaderDesktop, .HeaderPhone { display: none !important; }\n.ProductsModePanel { display: none !important; }';
    },
  });

  // Measure how much content shifted up after hiding header
  const [{ result: rawNewScrollHeight }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => document.documentElement.scrollHeight,
  });
  const headerOffset = scrollHeight - (rawNewScrollHeight as number);

  // Clamp to maxContentHeight if provided (feed pages — only capture rendered cards)
  const effectiveScrollHeight = maxContentHeight
    ? Math.min(rawNewScrollHeight as number, maxContentHeight - headerOffset)
    : (rawNewScrollHeight as number);

  // Remaining segments: adjust scroll to account for hidden header
  const remainingCount = Math.min(
    Math.ceil(Math.max(0, effectiveScrollHeight - (innerHeight - headerOffset)) / innerHeight),
    MAX_CAPTURES - 1,
  );

  for (let i = 0; i < remainingCount; i++) {
    const scrollTo = (i + 1) * innerHeight - headerOffset;

    await chrome.scripting.executeScript({
      target: { tabId },
      func: (y: number) => window.scrollTo(0, y),
      args: [scrollTo],
    });

    await new Promise((r) => setTimeout(r, SCROLL_SETTLE_MS));
    screenshots.push(
      await chrome.tabs.captureVisibleTab(null as unknown as number, {
        format: 'jpeg',
        quality: 80,
      }),
    );
    onSegmentCaptured(i + 2, 1 + remainingCount);
  }

  // Restore: scroll position, hidden elements, window size
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (y: number) => {
      window.scrollTo(0, y);
      const fix = document.getElementById('contentify-screenshot-fix');
      if (fix) fix.remove();
    },
    args: [originalScrollY],
  });

  if (didResize) {
    await chrome.windows.update(win.id!, { width: originalWindowWidth });
  }

  return {
    screenshots,
    totalHeight: maxContentHeight ? Math.min(scrollHeight, maxContentHeight) : scrollHeight,
    viewportHeight: innerHeight,
    viewportWidth: innerWidth,
    devicePixelRatio,
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

  // Check session code upfront — no point parsing if we can't push
  const sessionCode = await getSessionCode();
  if (!sessionCode) {
    console.log('[Contentify] Session code missing — opening options page');
    setMissingSessionBadge();
    chrome.runtime.openOptionsPage();
    return;
  }

  // Show loading state
  setBadge('...', '#5865F2');
  // Fire-and-forget: tell plugin "we're starting" before any heavy work.
  void sendHeadsUp('parsing');

  // Declare at higher scope for access in catch block
  let parseResult: ParseResult | null = null;

  try {
    // Load shared parsing rules (cached, non-blocking)
    const rules = await loadParsingRules();

    // Inject parsing rules into page before content script
    if (rules) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id! },
        func: (r: unknown) => {
          (window as Window).__contentifyParsingRules = r;
        },
        args: [rules],
      });
    }

    // Parse page using content script
    // Note: esbuild wraps content.js in extra IIFE, swallowing the return value.
    // Content script stores result in window.__contentifyResult as fallback.
    await chrome.scripting.executeScript({
      target: { tabId: tab.id! },
      files: ['dist/content.js'],
    });

    // Read result from page context (esbuild IIFE prevents direct return)
    const [{ result: pageResult }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id! },
      func: () => (window as Window).__contentifyResult,
    });

    parseResult = pageResult as ParseResult | null;

    const isFeed = parseResult?.sourceType === 'feed';

    if (isFeed) {
      // --- Feed pipeline ---
      if (!parseResult || !parseResult.feedCards?.length) {
        setBadge('0', '#E5534B');
        clearBadgeAfter(2000);
        return;
      }
    } else {
      // --- SERP pipeline ---
      if (!parseResult || parseResult.error || !parseResult.rows?.length) {
        setBadge('0', '#E5534B');
        clearBadgeAfter(2000);
        return;
      }
    }

    const rows = parseResult.rows || [];
    const wizards = parseResult.wizards || [];
    const productCard = parseResult.productCard || null;

    // Capture screenshot
    let screenshots: string[] = [];
    let screenshotMeta: Record<string, unknown> | null = null;
    const { captureScreenshots = true } = await chrome.storage.local.get('captureScreenshots');
    if (captureScreenshots) {
      const platform = isFeed
        ? 'desktop'
        : rows.find((r) => r['#platform'])?.['#platform'] || 'desktop';

      // Feed: measure rendered content height and use as scroll limit
      let maxContentHeight: number | undefined;
      if (isFeed) {
        try {
          const [{ result: feedHeight }] = await chrome.scripting.executeScript({
            target: { tabId: tab.id! },
            func: () => {
              const feed = document.querySelector('[class*="masonry-feed--rythm-feed"]');
              if (!feed) return 0;
              const items = feed.querySelectorAll('[class*="masonry-feed__item--rythm-feed"]');
              let maxBottom = 0;
              items.forEach((item) => {
                // Skip skeleton/placeholder cards
                if (item.querySelector('[data-test-id="skeleton-card"]')) return;
                const rect = item.getBoundingClientRect();
                const absBottom = rect.bottom + window.scrollY;
                if (absBottom > maxBottom) maxBottom = absBottom;
              });
              return Math.ceil(maxBottom);
            },
          });
          maxContentHeight = (feedHeight as number) || undefined;
          console.log(`[Screenshot] Feed rendered content height: ${maxContentHeight}px`);
        } catch (e: unknown) {
          console.log('[Screenshot] Feed height measurement failed:', (e as Error).message);
        }
      }

      try {
        const result = await captureFullPage(
          tab.id!,
          platform,
          maxContentHeight,
          (current, total) => {
            void sendHeadsUp('uploading_screenshots', { current, total });
          },
        );
        screenshots = result.screenshots;
        screenshotMeta = {
          totalHeight: result.totalHeight,
          viewportHeight: result.viewportHeight,
          viewportWidth: result.viewportWidth,
          devicePixelRatio: result.devicePixelRatio,
          count: result.screenshots.length,
        };
        const totalKB = screenshots.reduce((sum, s) => sum + s.length, 0);
        console.log(
          `[Screenshot] Captured ${screenshots.length} segments, total: ${Math.round(totalKB / 1024)}KB`,
        );
      } catch (screenshotErr: unknown) {
        console.log('[Screenshot] Failed:', (screenshotErr as Error).message);
      }
    }

    // Build payload
    const payload: Record<string, unknown> = {
      schemaVersion: 3,
      source: { url: tab.url, title: tab.title },
      capturedAt: new Date().toISOString(),
    };

    if (isFeed) {
      payload.sourceType = 'feed';
      payload.feedCards = parseResult.feedCards;
    } else {
      payload.rawRows = rows;
      payload.wizards = wizards;
      payload.productCard = productCard;
    }

    // Screenshots — common for both SERP and feed
    if (screenshots.length > 0) {
      payload.screenshots = screenshots;
      if (screenshotMeta) payload.screenshotMeta = screenshotMeta;
    }

    const itemCount = isFeed ? parseResult.feedCards?.length || 0 : rows.length;
    const meta = {
      url: tab.url,
      parsedAt: new Date().toISOString(),
      // Wall-clock ms right before /push. Plugin computes (peek-time − pushedAt) to
      // measure relay RTT + polling latency. Safe because both sides run on the same OS.
      pushedAt: Date.now(),
      snippetCount: isFeed ? 0 : rows.length,
      wizardCount: isFeed ? 0 : wizards.length,
      feedCardCount: isFeed ? itemCount : undefined,
      extensionVersion: chrome.runtime.getManifest().version,
    };

    // Heads-up: about to upload the structured payload.
    void sendHeadsUp('uploading_json');

    // Send to cloud relay
    let relaySuccess = false;

    try {
      const res = await fetch(buildCloudUrl('/push', sessionCode), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload, meta }),
        signal: AbortSignal.timeout(5000),
      });
      relaySuccess = res.ok;
      if (!res.ok) {
        console.log('[Relay] Push failed with status', res.status);
      }
    } catch (relayErr: unknown) {
      console.log('[Relay] Request failed:', (relayErr as Error).message);
    }

    if (relaySuccess) {
      void sendHeadsUp('finalizing');
    }

    const pcLabel = !isFeed && productCard ? '+PC' : '';
    setBadge(`${itemCount}${pcLabel}`, '#3FB950');
    clearBadgeAfter(3000);

    if (relaySuccess) {
      clearPendingDataFromStorage();
    } else {
      // Queue for retry if cloud relay didn't accept the push
      addToRetryQueue({ payload, meta });
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
        },
      });
    } catch {
      // Deeplink failed, ignore
    }
  } catch (err: unknown) {
    void sendHeadsUp('error', { message: (err as Error).message?.slice(0, 200) ?? 'Parse failed' });
    console.error('Parse/copy error:', err);
    setBadge('!', '#E5534B');
    clearBadgeAfter(2000);
  }
}

// === Context Menu (screenshot toggle) ===

const MENU_ID_SCREENSHOTS = 'toggle-screenshots';

/**
 * Create context menu on every SW startup.
 * onInstalled only fires on install/update, but SW restarts on every wake.
 * removeAll + create ensures no stale/duplicate entries.
 */
async function createContextMenu(): Promise<void> {
  const { captureScreenshots = true } = await chrome.storage.local.get('captureScreenshots');
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID_SCREENSHOTS,
      title: 'Захватывать скриншоты',
      type: 'checkbox',
      checked: captureScreenshots,
      contexts: ['action'],
    });
  });
}

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === MENU_ID_SCREENSHOTS) {
    await chrome.storage.local.set({ captureScreenshots: !!info.checked });
    console.log(`[Settings] Screenshots ${info.checked ? 'enabled' : 'disabled'}`);
  }
});

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

chrome.tabs.onUpdated.addListener(
  (_tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
    if (changeInfo.status === 'complete') {
      updateIconForTab(tab);
    }
  },
);

// === Auto-pairing handshake ===
//
// The Figma plugin opens `https://ya.ru/?contentify_pair=XYZ` via figma.openExternal.
// We detect that URL here, save the code to chrome.storage.local, push a pair-ack to
// the relay (so the plugin knows the handshake succeeded), then close the helper tab.
//
// Accepting on Yandex domains only — host_permissions already scope us there, this is
// defence-in-depth to ensure the listener never reacts to a hostile redirect.

const PAIR_QUERY_PARAM = 'contentify_pair';

function isYandexHost(host: string): boolean {
  return (
    host === 'ya.ru' ||
    host.endsWith('.ya.ru') ||
    host === 'yandex.ru' ||
    host.endsWith('.yandex.ru') ||
    host === 'yandex.com' ||
    host.endsWith('.yandex.com')
  );
}

function extractPairCode(urlString: string | undefined): string | null {
  if (!urlString) return null;
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return null;
  }
  if (!isYandexHost(url.hostname)) return null;
  const raw = url.searchParams.get(PAIR_QUERY_PARAM);
  if (!raw || !SESSION_CODE_PATTERN.test(raw)) return null;
  return raw;
}

async function sendPairAck(code: string): Promise<void> {
  try {
    await fetch(buildCloudUrl('/push', code), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload: { sourceType: 'pair-ack', ts: Date.now() },
        meta: { extensionVersion: chrome.runtime.getManifest().version },
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err: unknown) {
    // Non-fatal: plugin can still detect pairing on next real import.
    console.log('[Pair] Ack push failed:', (err as Error).message);
  }
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // React as early as possible so the user doesn't see the Yandex page flash.
  if (changeInfo.status !== 'loading' && changeInfo.status !== 'complete') return;

  const code = extractPairCode(tab.url ?? changeInfo.url);
  if (!code) return;

  // Silent overwrite per spec: last-pair-wins. Log the transition for diagnostics.
  const existing = await getSessionCode();
  if (existing && existing !== code) {
    console.log(`[Pair] Overwriting session code ${existing} → ${code}`);
  } else {
    console.log(`[Pair] Storing new session code ${code}`);
  }

  await chrome.storage.local.set({ [SESSION_CODE_KEY]: code });
  await sendPairAck(code);

  // Close the helper tab — the user's Figma plugin UI will show the confirmation.
  try {
    await chrome.tabs.remove(tabId);
  } catch {
    /* tab may have already been closed */
  }

  // Session is configured now — clear the missing-session badge if it was up.
  clearMissingSessionBadge();
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
      128: chrome.runtime.getURL(`icons/icon128-${variant}.png`),
    },
  });
  chrome.action.setTitle({ title });
}

// === Parsing Rules (shared with plugin) ===

const PARSING_RULES_URL =
  'https://raw.githubusercontent.com/fusion-brisk/fluffy-chainsaw/main/config/parsing-rules.json';
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
      const { rules, fetchedAt } = cached[RULES_CACHE_KEY] as {
        rules: RulesData;
        fetchedAt: number;
      };
      if (Date.now() - fetchedAt < RULES_CACHE_TTL && rules?.version) {
        console.log(`[Rules] Using cached rules v${rules.version}`);
        return rules;
      }
    }
  } catch {
    /* cache miss */
  }

  // Fetch remote
  try {
    const res = await fetch(PARSING_RULES_URL, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const rules = (await res.json()) as RulesData;
      if (rules?.version && rules?.rules) {
        await chrome.storage.local.set({
          [RULES_CACHE_KEY]: { rules, fetchedAt: Date.now() },
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

(async () => {
  console.log('[Contentify] Background service worker loaded (cloud-only)');

  // Create context menu on every SW startup (not just onInstalled)
  createContextMenu();

  // One-time cleanup: remove legacy relayUrl from storage (Task 9 migration)
  chrome.storage.local.remove('relayUrl').catch(() => {
    /* ignore */
  });

  // Load parsing rules in the background (non-blocking)
  loadParsingRules().catch((e: unknown) => console.log('[Rules] Background load failed:', e));

  // Warn if session code is missing at startup
  const sessionCode = await getSessionCode();
  if (!sessionCode) {
    console.log('[Contentify] Session code not configured. Open options to set it.');
    setMissingSessionBadge();
  }
})();

export {};
