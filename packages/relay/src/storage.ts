/**
 * Unified in-memory storage for ephemeral data (not persisted to disk).
 * Screenshots, result exports, and last import payload.
 *
 * Separated from route handlers to avoid scattered global state.
 * Unlike queue.ts, this data is lost on restart — by design.
 */

import type { QueueEntryPayload, QueueEntryMeta, ScreenshotMeta, ResultMeta } from './types';

// === Screenshots (from extension) ===

let screenshotSegments: string[] = [];
let screenshotMeta: ScreenshotMeta | null = null;

export function setScreenshots(segments: string[], meta: ScreenshotMeta): void {
  screenshotSegments = segments;
  screenshotMeta = meta;
}

export function getScreenshotSegments(): string[] {
  return screenshotSegments;
}

export function getScreenshotMeta(): ScreenshotMeta | null {
  return screenshotMeta;
}

// === Result export (from Figma plugin) ===

let resultSegments: string[] = [];
let resultMeta: ResultMeta | null = null;

export function setResult(dataUrl: string, meta: ResultMeta): void {
  resultSegments = [dataUrl];
  resultMeta = meta;
}

export function getResultSegments(): string[] {
  return resultSegments;
}

export function getResultMeta(): ResultMeta | null {
  return resultMeta;
}

export function clearResultStorage(): void {
  resultSegments = [];
  resultMeta = null;
}

// === Last import payload (for reimport) ===

let lastImportPayload: { payload?: QueueEntryPayload; meta?: QueueEntryMeta } | null = null;

export function setLastImport(data: { payload?: QueueEntryPayload; meta?: QueueEntryMeta }): void {
  try {
    lastImportPayload = JSON.parse(JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to clone payload for reimport:', e instanceof Error ? e.message : e);
  }
}

export function getLastImport(): typeof lastImportPayload {
  return lastImportPayload;
}
