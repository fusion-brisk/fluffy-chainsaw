import type { Request, Response } from 'express';
import type WebSocket from 'ws';

// === Queue Entry ===

export interface QueueEntryMeta {
  extensionVersion?: string;
  [key: string]: unknown;
}

export interface QueueEntryPayload {
  rawRows?: Array<Record<string, string>>;
  wizards?: unknown[];
  productCard?: unknown;
  screenshots?: string[];
  screenshotMeta?: ScreenshotMeta;
  capturedAt?: string;
  schemaVersion?: number;
  source?: { url?: string };
  [key: string]: unknown;
}

export interface QueueEntry {
  id: string;
  payload: QueueEntryPayload;
  meta: QueueEntryMeta;
  pushedAt: string;
  acknowledged: boolean;
  lastPeekedAt?: number | null;
}

// === Screenshot / Result storage ===

export interface ScreenshotMeta {
  capturedAt?: string;
  query?: string;
  url?: string;
  count?: number;
  [key: string]: unknown;
}

export interface ResultMeta {
  receivedAt?: string;
  query?: string;
  width?: number;
  height?: number;
  scale?: number;
  [key: string]: unknown;
}

// === WebSocket messages ===

export interface WsMessageBase {
  type: string;
  timestamp?: number;
}

export interface WsConnectedMessage extends WsMessageBase {
  type: 'connected';
  queueSize: number;
  pendingCount: number;
}

export interface WsNewDataMessage extends WsMessageBase {
  type: 'new-data';
  entryId: string;
  itemCount: number;
  snippetCount: number;
  wizardCount: number;
  query: string;
  relayVersion: string;
  extensionVersion: string | null;
}

export interface WsQueueOverflowMessage extends WsMessageBase {
  type: 'queue-overflow';
  dropped: number;
}

export interface WsRelayUpdatingMessage extends WsMessageBase {
  type: 'relay-updating';
  newVersion: string;
}

export interface WsQueueSaveErrorMessage extends WsMessageBase {
  type: 'queue-save-error';
  error: string;
}

export interface WsPongMessage extends WsMessageBase {
  type: 'pong';
}

export type WsOutgoingMessage =
  | WsConnectedMessage
  | WsNewDataMessage
  | WsQueueOverflowMessage
  | WsRelayUpdatingMessage
  | WsQueueSaveErrorMessage
  | WsPongMessage;

export interface WsPingMessage {
  type: 'ping';
}

export type WsIncomingMessage = WsPingMessage;

// === Extended WebSocket with isAlive ===

export interface AliveWebSocket extends WebSocket {
  isAlive: boolean;
}

// === Persisted queue file ===

export interface PersistedQueueData {
  queue: QueueEntry[];
  lastPushTimestamp: string | null;
  savedAt: string;
}

// === Debug reports ===

export interface DebugReport {
  operation?: string;
  success?: boolean;
  errors?: unknown[];
  _receivedAt?: string;
  [key: string]: unknown;
}

// === Update info ===

export interface UpdateInfo {
  version: string;
  downloadUrl: string;
  size: number;
}

// === Route handler types ===

export type RouteHandler = (req: Request, res: Response) => void;
export type AsyncRouteHandler = (req: Request, res: Response) => Promise<void>;
