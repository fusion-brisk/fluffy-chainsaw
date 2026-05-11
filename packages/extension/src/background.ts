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
  // --- Timing instrumentation (set by content.ts; forwarded into meta.timings) ---
  /** Wall-clock ms when content script's IIFE started executing. */
  parseStartedAt?: number;
  /** Total monotonic ms the content script's IIFE spent (includes extract + setup). */
  parseDurationMs?: number;
  /** Subset of parseDurationMs spent inside extractFeedCards (feed only). */
  parseFeedExtractMs?: number;
  /** Subset of parseDurationMs spent inside extractSnippets (serp only). */
  parseSerpExtractMs?: number;
  /** Cards/rows the content script returned (matches feedCards.length / rows.length). */
  parseCardCount?: number;
  parseRowCount?: number;
}

// Phase-timer factory extracted to ./phase-timer for direct unit testing —
// background.ts imports chrome.* globals at module top, which makes the SW
// hard to import in a node-based vitest run. See tests/extension/phase-timer.
// Re-exported here so the SW module remains a single import-target for
// downstream tooling.
import { makePhaseTimer } from './phase-timer';

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

function dataUrlToBase64(dataUrl: string): string {
  const m = /^data:image\/(jpe?g|png|webp);base64,(.+)$/i.exec(dataUrl);
  if (!m) throw new Error(`Unexpected dataUrl prefix: ${dataUrl.slice(0, 32)}`);
  return m[2];
}

async function uploadOneScreenshot(
  sessionCode: string,
  segIdx: number,
  dataUrl: string,
  totalSegments: number,
  kind: 'segment' | 'advert' = 'segment',
): Promise<{ key: string; url: string }> {
  const dataBase64 = dataUrlToBase64(dataUrl);
  const res = await fetch(buildCloudUrl('/upload-screenshot', sessionCode), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ segIdx, dataBase64, contentType: 'image/jpeg', totalSegments, kind }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`upload-screenshot ${res.status}: ${text.slice(0, 200)}`);
  }
  const body = (await res.json()) as { key: string; url: string };
  return body;
}

/**
 * @deprecated Removed from the import flow — left for now in case we want to
 * resurrect it for a different purpose (e.g. capturing a live preview of
 * advert structure). The runtime entry point in the import handler no longer
 * calls it; tree-shaking will drop it from the production bundle.
 *
 * Original purpose: clip advert wrapper regions out of the captured viewport
 * segments and upload each clip as its own image. Replaced by shadow-DOM
 * URL extraction in feed-parser.ts.
 */
async function cropAndUploadAdverts(
  feedCards: Array<Record<string, string>>,
  screenshots: string[],
  screenshotMeta: Record<string, unknown> | null,
  sessionCode: string,
): Promise<number> {
  if (screenshots.length === 0 || !screenshotMeta) {
    console.log(
      `[advert-clip] aborted: screenshots=${screenshots.length}, meta=${screenshotMeta ? 'yes' : 'null'}`,
    );
    return 0;
  }
  const dpr = (screenshotMeta.devicePixelRatio as number) || 1;
  const vh = (screenshotMeta.viewportHeight as number) || 0;
  if (vh <= 0) {
    console.log('[advert-clip] aborted: viewportHeight=0 in meta');
    return 0;
  }

  const segmentBitmaps: Array<ImageBitmap | null> = new Array(screenshots.length).fill(null);
  async function getSegmentBitmap(idx: number): Promise<ImageBitmap | null> {
    if (idx < 0 || idx >= screenshots.length) return null;
    if (segmentBitmaps[idx]) return segmentBitmaps[idx];
    try {
      const res = await fetch(screenshots[idx]);
      const blob = await res.blob();
      const bitmap = await createImageBitmap(blob);
      segmentBitmaps[idx] = bitmap;
      return bitmap;
    } catch (err) {
      console.warn('[advert-clip] segment decode failed idx=' + idx, err);
      return null;
    }
  }

  // Stats for diagnostics — emitted at end so the user sees a single line.
  let stats = {
    advertTotal: 0,
    hadDomImage: 0,
    missingRect: 0,
    invalidRect: 0,
    bitmapMissing: 0,
    canvasFail: 0,
    uploadFail: 0,
    uploaded: 0,
    crossSegment: 0,
  };

  let advertSlot = 0;
  for (let i = 0; i < feedCards.length; i++) {
    const card = feedCards[i];
    if (card['#Feed_CardType'] !== 'advert') continue;
    stats.advertTotal += 1;

    if (card['#Feed_ImageUrl']) {
      stats.hadDomImage += 1;
      continue;
    }
    const rectStr = card['#Feed_AdvertCaptureRect'];
    if (!rectStr) {
      stats.missingRect += 1;
      continue;
    }

    let rect: { x: number; y: number; w: number; h: number };
    try {
      rect = JSON.parse(rectStr);
    } catch {
      stats.invalidRect += 1;
      continue;
    }
    if (!(rect.w > 0 && rect.h > 0)) {
      stats.invalidRect += 1;
      continue;
    }

    // Page-Y span of the advert in CSS pixels.
    const segIdxTop = Math.floor(rect.y / vh);
    const segIdxBot = Math.floor((rect.y + rect.h - 1) / vh);
    if (segIdxTop >= screenshots.length) {
      stats.bitmapMissing += 1;
      continue;
    }
    if (segIdxBot > segIdxTop) stats.crossSegment += 1;

    const clipX = Math.max(0, Math.round(rect.x * dpr));
    const clipW = Math.round(rect.w * dpr);
    const clipH = Math.round(rect.h * dpr);

    let blob: Blob;
    try {
      const canvas = new OffscreenCanvas(clipW, clipH);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        stats.canvasFail += 1;
        continue;
      }
      // Stitch from one or more segments. For each segment in the rect's
      // page-Y range, copy the slice of the segment that overlaps the rect
      // into the canvas at the correct vertical offset.
      let drawnAny = false;
      let drawY = 0;
      for (let s = segIdxTop; s <= segIdxBot && s < screenshots.length; s++) {
        const bitmap = await getSegmentBitmap(s);
        if (!bitmap) continue;
        const segPageTop = s * vh;
        const segPageBot = segPageTop + vh;
        const sliceTopPage = Math.max(rect.y, segPageTop);
        const sliceBotPage = Math.min(rect.y + rect.h, segPageBot);
        if (sliceBotPage <= sliceTopPage) continue;

        const srcX = clipX;
        const srcY = Math.max(0, Math.round((sliceTopPage - segPageTop) * dpr));
        const srcW = clipW;
        const srcH = Math.round((sliceBotPage - sliceTopPage) * dpr);
        // Clamp to bitmap bounds (last segment may be shorter or page may
        // have grown after capture).
        const safeW = Math.min(srcW, Math.max(0, bitmap.width - srcX));
        const safeH = Math.min(srcH, Math.max(0, bitmap.height - srcY));
        if (safeW <= 0 || safeH <= 0) continue;
        ctx.drawImage(bitmap, srcX, srcY, safeW, safeH, 0, drawY, safeW, safeH);
        drawnAny = true;
        drawY += safeH;
      }
      if (!drawnAny) {
        stats.bitmapMissing += 1;
        continue;
      }
      blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
    } catch (err) {
      stats.canvasFail += 1;
      console.warn('[advert-clip] canvas op failed for card #' + i, err);
      continue;
    }

    let dataUrl: string;
    try {
      dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      stats.uploadFail += 1;
      console.warn('[advert-clip] dataUrl conversion failed', err);
      continue;
    }

    try {
      const result = await uploadOneScreenshot(
        sessionCode,
        advertSlot,
        dataUrl,
        feedCards.length,
        'advert',
      );
      card['#Feed_ImageUrl'] = result.url;
      stats.uploaded += 1;
      advertSlot += 1;
    } catch (err) {
      stats.uploadFail += 1;
      console.warn('[advert-clip] upload failed for card #' + i, err);
    }
  }
  console.log('[advert-clip] stats:', stats);
  return stats.uploaded;
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
      // Match the main /push budget: cold start + YDB write can take ~5–10 s.
      signal: AbortSignal.timeout(30000),
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

  // --- Hide technical UI + page header before ANY capture ---
  //
  // Why hide the header up-front (was deferred to segment 1+ previously):
  // when the plugin places the screenshot column next to the imported frame,
  // the user expects top-row alignment. With the header in segment 0, the
  // production-fid scroll started ~150px below the imported frame's top.
  // Hiding HeaderDesktop / ProductsModePanel from the very first capture
  // makes the screenshot strip's first segment begin at the same `y` as
  // the rythm-feed root in the imported frame.
  //
  // We still measure `headerOffset` after-the-fact for the scroll-step
  // arithmetic — but the visible result no longer leaks the chrome.
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const style = document.createElement('style');
      style.id = 'contentify-screenshot-fix';
      style.textContent = [
        '#ulitochka-container { display: none !important; }',
        '.YndxBug { display: none !important; }',
        '.HeaderDesktop, .HeaderPhone { display: none !important; }',
        '.ProductsModePanel { display: none !important; }',
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

  // Header was already hidden up-front (see contentify-screenshot-fix style),
  // so `headerOffset` here is 0 — preserved as a variable to keep arithmetic
  // below readable and to leave a knob for partial-hide scenarios.
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

  // Wall-clock anchor for the whole click→push pipeline. Used for the final
  // `[Timing] handleIconClick total` line + meta.timings.totalMs.
  const handleClickStartedAt = Date.now();
  const phaseTimer = makePhaseTimer();

  // Declare at higher scope for access in catch block
  let parseResult: ParseResult | null = null;

  try {
    // Load shared parsing rules (cached, non-blocking)
    phaseTimer.markStart('loadRulesMs');
    const rules = await loadParsingRules();
    phaseTimer.markEnd('loadRulesMs');

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

    // Pre-flush feed lazy-load BEFORE running the content script.
    //
    // ya.ru rythm-feed renders ~70 cards but only loads images for the first
    // ~8 (those near the viewport). The rest stay with placeholder src and
    // `naturalWidth=0` until they scroll into view. Without this flush, our
    // parser collects empty/duplicate URLs for all bottom cards — the visible
    // symptom is the "balaclava-model" image cloned across many Posts cards
    // in the imported Figma frame.
    //
    // We scroll to bottom in 800px steps with a settle delay so the
    // IntersectionObserver fires and lazy-loaders kick in, then scroll back
    // to top before parsing. Idempotent for non-feed pages (the marker class
    // is feed-only); ~3-4 seconds wall-clock on a 70-card feed.
    const [{ result: isFeedPage }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id! },
      func: () => !!document.querySelector('[class*="masonry-feed--rythm-feed"]'),
    });
    if (isFeedPage) {
      console.log('[Feed] Pre-scrolling to flush lazy-loaded images + advert RTB...');
      phaseTimer.markStart('preScrollMs');
      await chrome.scripting.executeScript({
        target: { tabId: tab.id! },
        func: async () => {
          const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));
          const startY = window.scrollY;
          const step = 800;
          const maxScroll = document.documentElement.scrollHeight;
          // Pass 1: drag through the page to trigger IntersectionObserver-based
          // lazy-loaders for both regular images AND RTB ad iframes.
          for (let y = 0; y <= maxScroll; y += step) {
            window.scrollTo(0, y);
            await settle(180);
          }
          await settle(600);
          // Pass 2: short re-pass through the same range — RTB iframes start
          // their network request on first viewport entry but the creative
          // markup (declarative shadow root + <style>) usually arrives
          // ~700-1500ms later. Re-visiting with a small delay gives the
          // shadow root time to attach so chrome.dom.openOrClosedShadowRoot
          // returns content.
          const newMax = document.documentElement.scrollHeight;
          for (let y = 0; y <= newMax; y += step * 2) {
            window.scrollTo(0, y);
            await settle(120);
          }
          // Final wait at the bottom for any straggler advert iframes to
          // populate their shadow root.
          await settle(900);
          window.scrollTo(0, startY);
          await settle(200);
        },
      });
      phaseTimer.markEnd('preScrollMs');

      // Active per-advert warmup: scroll each empty RTB host to viewport
      // centre, dispatch synthetic mouseenter / visibilitychange events to
      // nudge Yandex's lazy ad loaders, and MutationObserver-wait for the
      // csr-uniq host to gain content. Honours a global ~10 s budget so
      // import never blocks indefinitely.
      phaseTimer.markStart('advertWarmupMs');
      const [{ result: adResult }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id! },
        func: async () => {
          const settle = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
          const ads = Array.from(document.querySelectorAll('[class*="advert-card--rythm-feed"]'));
          interface EmptyHost {
            ad: Element;
            csr: Element;
          }
          const emptyHosts: EmptyHost[] = [];
          for (const ad of ads) {
            const csr = ad.querySelector('[class*="csr-uniq"]');
            if (csr && csr.innerHTML.length === 0) emptyHosts.push({ ad, csr });
          }
          if (emptyHosts.length === 0) {
            return { total: ads.length, empty: 0, loaded: 0, finalEmpty: 0 };
          }
          const startY = window.scrollY;
          // Phase A: bring each empty advert into the viewport so the RTB
          // lazy-loader's IntersectionObserver fires. Loader registration is
          // synchronous on entry — we only need to hold the impression long
          // enough for the network request to dispatch (≈60ms is plenty;
          // 250ms × 12 ads previously ate ~3s for marginal benefit).
          for (const { ad } of emptyHosts) {
            try {
              (ad as HTMLElement).scrollIntoView({
                block: 'center',
                inline: 'center',
                behavior: 'instant' as ScrollBehavior,
              });
              ad.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
              ad.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
            } catch {
              /* ignore */
            }
            await settle(60);
          }
          // Single tail wait so IntersectionObservers for the LAST few ads
          // get a turn before we move on (replaces the per-ad 250ms tail).
          await settle(300);
          // Phase B: poll-loop until every empty host gains content OR the
          // global budget runs out. Budget cut from 10s → 4s based on real
          // imports: ads that haven't loaded by 4s typically never load
          // (no fill, blocked, RTB timeout). The marginal late-loader is
          // rare and not worth the wall-clock cost — plugin already has a
          // placeholder for missing creatives.
          const MAX_WAIT_MS = 4_000;
          const POLL_MS = 250;
          const tStart = Date.now();
          let loaded = 0;
          while (Date.now() - tStart < MAX_WAIT_MS) {
            const stillEmpty = emptyHosts.filter((e) => e.csr.innerHTML.length === 0);
            loaded = emptyHosts.length - stillEmpty.length;
            if (stillEmpty.length === 0) break;
            for (const { ad } of stillEmpty) {
              try {
                ad.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
              } catch {
                /* ignore */
              }
            }
            await settle(POLL_MS);
          }
          loaded =
            emptyHosts.length - emptyHosts.filter((e) => e.csr.innerHTML.length === 0).length;
          window.scrollTo(0, startY);
          await settle(80);
          return {
            total: ads.length,
            empty: emptyHosts.length,
            loaded: loaded,
            finalEmpty: emptyHosts.length - loaded,
          };
        },
      });
      phaseTimer.markEnd('advertWarmupMs');
      console.log(
        `[Feed/advert-warmup] ${(adResult as { loaded: number; empty: number; total: number; finalEmpty: number } | null | undefined)?.loaded ?? 0}/${(adResult as { empty: number } | null | undefined)?.empty ?? 0} empty advert hosts populated (total ads=${(adResult as { total: number } | null | undefined)?.total ?? 0})`,
      );
    }

    // Parse page using content script
    // Note: esbuild wraps content.js in extra IIFE, swallowing the return value.
    // Content script stores result in window.__contentifyResult as fallback.
    // injectContentMs covers the executeScript call (parsing happens inside it,
    // but the script also stamps its own parseDurationMs on the result).
    phaseTimer.markStart('injectContentMs');
    await chrome.scripting.executeScript({
      target: { tabId: tab.id! },
      files: ['dist/content.js'],
    });
    phaseTimer.markEnd('injectContentMs');

    // Read result from page context (esbuild IIFE prevents direct return)
    phaseTimer.markStart('readResultMs');
    const [{ result: pageResult }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id! },
      func: () => (window as Window).__contentifyResult,
    });
    phaseTimer.markEnd('readResultMs');

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

      phaseTimer.markStart('screenshotCaptureMs');
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
      phaseTimer.markEnd('screenshotCaptureMs');
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

    // Screenshots travel through a side-channel: each segment is uploaded
    // separately to /upload-screenshot (writes to Yandex Object Storage), and
    // we ship only the resulting keys + URLs in `meta` on the main /push.
    // This keeps the /push body well under the 3.5 MB API Gateway cap.
    let screenshotKeys: string[] | undefined;
    let screenshotUrls: string[] | undefined;
    if (screenshots.length > 0) {
      phaseTimer.markStart('screenshotUploadMs');
      try {
        // Parallel upload — was sequential (one /upload-screenshot at a time)
        // and cost ~1.2s/segment × 6 = 7.4s. Each upload is independent
        // (different object key in S3), so we fan out and only block on
        // Promise.all. Heads-up progress is still emitted per-resolved
        // upload via `done++` so the plugin sees monotonic 1→N progress.
        // 6 concurrent uploads at ~250KB each is well under any reasonable
        // network or API Gateway concurrency ceiling.
        let done = 0;
        const uploads = screenshots.map(async (segment, i) => {
          const r = await uploadOneScreenshot(sessionCode, i, segment, screenshots.length);
          done++;
          void sendHeadsUp('uploading_screenshots', {
            current: done,
            total: screenshots.length,
          });
          return r;
        });
        const results = await Promise.all(uploads);
        const keys = results.map((r) => r.key);
        const urls = results.map((r) => r.url);
        screenshotKeys = keys;
        screenshotUrls = urls;
        console.log(`[Screenshot] Uploaded ${keys.length}/${screenshots.length} segments`);
      } catch (uploadErr: unknown) {
        // Upload failure is non-fatal: structured /push still goes through, just
        // without the comparison column on the plugin side. Promise.all rejects
        // on first failure; partial uploads from siblings are abandoned.
        console.warn(
          '[Screenshot] Upload failed, /push will proceed without screenshots:',
          (uploadErr as Error).message,
        );
        screenshotKeys = undefined;
        screenshotUrls = undefined;
      }
      phaseTimer.markEnd('screenshotUploadMs');
    }

    // Note: an earlier version cropped advert creatives out of the captured
    // viewport segments and uploaded them as fallback images for RTB iframes.
    // That path was removed because screenshot crops bake in UI overlays
    // (kebab, like buttons, dots) and add JPEG artifacts. We now rely on
    // shadow-DOM extraction (chrome.dom.openOrClosedShadowRoot in the
    // parser) to pull the real CDN image URL out of `.img-source-component`.
    // Cards whose RTB iframe hasn't materialised by parse time are left
    // imageless — the plugin's default Tile / Ads placeholder handles that.

    const itemCount = isFeed ? parseResult.feedCards?.length || 0 : rows.length;

    // Pull parse-side timings + counts off the result so they can be merged
    // into meta.timings (single source for the plugin Logs panel).
    const parseTimings: Record<string, number> = {};
    if (typeof parseResult.parseStartedAt === 'number') {
      parseTimings.parseStartedAt = parseResult.parseStartedAt;
    }
    if (typeof parseResult.parseDurationMs === 'number') {
      parseTimings.parseDurationMs = parseResult.parseDurationMs;
    }
    if (typeof parseResult.parseFeedExtractMs === 'number') {
      parseTimings.parseFeedExtractMs = parseResult.parseFeedExtractMs;
    }
    if (typeof parseResult.parseSerpExtractMs === 'number') {
      parseTimings.parseSerpExtractMs = parseResult.parseSerpExtractMs;
    }

    const pushedAt = Date.now();
    const meta = {
      url: tab.url,
      parsedAt: new Date().toISOString(),
      // Wall-clock ms right before /push. Plugin computes (peek-time − pushedAt) to
      // measure relay RTT + polling latency. Safe because both sides run on the same OS.
      pushedAt,
      snippetCount: isFeed ? 0 : rows.length,
      wizardCount: isFeed ? 0 : wizards.length,
      feedCardCount: isFeed ? itemCount : undefined,
      extensionVersion: chrome.runtime.getManifest().version,
      // Screenshot side-channel — only present when capture+upload succeeded.
      screenshotKeys,
      screenshotUrls,
      screenshotMeta: screenshotKeys ? screenshotMeta : undefined,
      /**
       * Phase timings (ms) for the click→push pipeline. Forwarded by the
       * plugin Logs panel as `[Timing] <phase>: Xms` lines so the user can see
       * where wall-clock went between hitting the extension icon and the
       * plugin receiving data. See `.claude/rules/performance.md` §1.
       */
      timings: {
        ...phaseTimer.values(),
        ...parseTimings,
        // Pre-fetch wall-clock between click and starting /push (excludes pushMs).
        preFetchMs: pushedAt - handleClickStartedAt,
      } as Record<string, number>,
    };

    // Heads-up: about to upload the structured payload.
    void sendHeadsUp('uploading_json');

    // Send to cloud relay
    let relaySuccess = false;
    phaseTimer.markStart('pushMs');

    try {
      const res = await fetch(buildCloudUrl('/push', sessionCode), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload, meta }),
        // 30 s — APIGW + YC Function cold start + YDB write can legitimately reach
        // 5–10 s; a tight 5 s timeout caused premature aborts and retry storms.
        signal: AbortSignal.timeout(30000),
      });
      relaySuccess = res.ok;
      if (!res.ok) {
        console.log('[Relay] Push failed with status', res.status);
      }
    } catch (relayErr: unknown) {
      console.log('[Relay] Request failed:', (relayErr as Error).message);
    }
    phaseTimer.markEnd('pushMs');

    // Final summary — flush to background console so DevTools shows the
    // whole click→push breakdown alongside the [Timing] lines the plugin Logs
    // panel will emit. pushMs lives here only (it's unobservable inside the
    // body we just sent).
    const totalMs = Date.now() - handleClickStartedAt;
    const phaseValues = phaseTimer.values();
    const phaseLog = Object.keys(phaseValues)
      .map((k) => k + '=' + phaseValues[k] + 'ms')
      .join(', ');
    console.log(
      '[Timing] handleIconClick total=' +
        totalMs +
        'ms (' +
        phaseLog +
        (typeof parseTimings.parseDurationMs === 'number'
          ? ', parseDurationMs=' + parseTimings.parseDurationMs + 'ms'
          : '') +
        ', items=' +
        itemCount +
        ', isFeed=' +
        isFeed +
        ')',
    );

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
