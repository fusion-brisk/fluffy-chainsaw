import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import type { QueueEntry, PersistedQueueData } from './types';

const DATA_FILE = path.join(__dirname, '..', '.relay-queue.json');
const MAX_QUEUE = 20;
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours TTL

// === Queue state ===
let dataQueue: QueueEntry[] = [];
let lastPushTimestamp: string | null = null;

// === Persistence state ===
let saveQueueTimer: ReturnType<typeof setTimeout> | null = null;
let isSaving = false;
let pendingSave = false;

// === Broadcast callback (set by index.ts after WebSocket init) ===
let broadcastFn: ((message: Record<string, unknown>) => void) | null = null;

export function setBroadcast(fn: (message: Record<string, unknown>) => void): void {
  broadcastFn = fn;
}

function broadcast(message: Record<string, unknown>): void {
  if (broadcastFn) broadcastFn(message);
}

// === Queue accessors ===

export function getQueue(): readonly QueueEntry[] {
  return dataQueue;
}

export function getLastPushTimestamp(): string | null {
  return lastPushTimestamp;
}

export function setLastPushTimestamp(ts: string): void {
  lastPushTimestamp = ts;
}

export function getPendingCount(): number {
  return dataQueue.filter((e) => !e.acknowledged).length;
}

// === Queue operations ===

export function addEntry(entry: QueueEntry): { dropped: number } {
  dataQueue.push(entry);

  const overflowCount = dataQueue.length - MAX_QUEUE;
  if (overflowCount > 0) {
    broadcast({ type: 'queue-overflow', dropped: overflowCount });
    console.log(`Queue overflow: dropping ${overflowCount} oldest entries`);
  }
  while (dataQueue.length > MAX_QUEUE) {
    dataQueue.shift();
  }

  saveQueue();
  return { dropped: Math.max(0, overflowCount) };
}

export function findEntryById(entryId: string): QueueEntry | undefined {
  return dataQueue.find((e) => e.id === entryId);
}

export function removeEntryById(entryId: string): QueueEntry | null {
  const index = dataQueue.findIndex((e) => e.id === entryId);
  if (index === -1) return null;
  const removed = dataQueue.splice(index, 1)[0];
  saveQueue();
  return removed;
}

export function shiftEntry(): QueueEntry | undefined {
  const entry = dataQueue.shift();
  if (entry) saveQueue();
  return entry;
}

export function clearQueue(): number {
  const count = dataQueue.length;
  dataQueue = [];
  saveQueue();
  return count;
}

export function findFirstPending(peekStaleMs: number = 60000): QueueEntry | undefined {
  const now = Date.now();

  // Reset stale peek markers (separate pass — no side effects inside find)
  for (const e of dataQueue) {
    if (e.lastPeekedAt && now - e.lastPeekedAt > peekStaleMs) {
      e.lastPeekedAt = null;
    }
  }

  return dataQueue.find((e) => !e.acknowledged);
}

// === Persistence ===

export function loadQueue(): void {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data: PersistedQueueData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      const now = Date.now();

      dataQueue = (data.queue || []).filter((entry) => {
        const pushedAt = new Date(entry.pushedAt).getTime();
        return now - pushedAt < MAX_AGE_MS;
      });

      lastPushTimestamp = data.lastPushTimestamp || null;

      if (dataQueue.length > 0) {
        console.log(`Loaded ${dataQueue.length} entries from file`);
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Error loading queue:', msg);
    dataQueue = [];
  }
}

async function saveQueueAsync(): Promise<void> {
  if (isSaving) {
    pendingSave = true;
    return;
  }
  isSaving = true;
  pendingSave = false;

  try {
    const tmpFile = DATA_FILE + '.tmp';
    const data = JSON.stringify({
      queue: dataQueue,
      lastPushTimestamp,
      savedAt: new Date().toISOString(),
    });

    await fsPromises.writeFile(tmpFile, data, 'utf8');
    await fsPromises.rename(tmpFile, DATA_FILE);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Error saving queue:', msg);
    broadcast({ type: 'queue-save-error', error: msg });
  } finally {
    isSaving = false;
    if (pendingSave) {
      pendingSave = false;
      saveQueue();
    }
  }
}

function saveQueue(): void {
  if (saveQueueTimer) clearTimeout(saveQueueTimer);
  saveQueueTimer = setTimeout(() => {
    saveQueueTimer = null;
    saveQueueAsync();
  }, 300);
}

export function saveQueueImmediate(): void {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify({
        queue: dataQueue,
        lastPushTimestamp,
        savedAt: new Date().toISOString(),
      }),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Error saving queue:', msg);
  }
}

export function generateEntryId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}
