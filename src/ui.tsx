/**
 * Contentify Plugin — UI Entry Point (Clipboard-First)
 * 
 * Unified UI with minimal states:
 * - checking: Initial relay connection check
 * - ready: Ready to work (relay status shown as indicator)
 * - processing: Importing/processing data
 * - confirming: Data received, awaiting user confirmation
 * - success: Import completed successfully
 * - fileDrop: Hidden fallback for file import
 * 
 * CLIPBOARD-FIRST ARCHITECTURE:
 * - Plugin works with or without relay connection
 * - Users can always paste data from Chrome extension (Cmd+V)
 * - Relay is optional for automatic data transfer (no paste needed)
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { 
  CSVRow, 
  ProgressData, 
  AppState, 
  ImportInfo,
  UI_SIZES,
  UserSettings
} from './types';
import { 
  applyFigmaTheme, 
  sendMessageToPlugin,
  parseYandexSearchResults,
  parseMhtmlStreamingAsync,
  MhtmlParseProgress
} from './utils/index';

// Components
import { ReadyView } from './components/ReadyView';
import { ProcessingView } from './components/ProcessingView';
import { FileDropOverlay } from './components/FileDropOverlay';
import { Confetti } from './components/Confetti';
import { ImportConfirmDialog, ImportMode } from './components/ImportConfirmDialog';
import { SuccessView } from './components/SuccessView';
import { ExtensionGuide } from './components/ExtensionGuide';
import { RelayGuide } from './components/RelayGuide';
import { StatusBar } from './components/StatusBar';
import { SetupWizard } from './components/SetupWizard';

// Default relay URL
const DEFAULT_RELAY_URL = 'http://localhost:3847';

// WebSocket configuration
const WS_RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000]; // Exponential backoff
const WS_MAX_RECONNECT_DELAY = 16000;

// HTTP Polling fallback intervals (used only when WebSocket is unavailable)
const RELAY_CHECK_INTERVAL_ACTIVE = 1000;  // 1s when recently active
const RELAY_CHECK_INTERVAL_IDLE = 5000;    // 5s when idle
const ACTIVE_THRESHOLD_MS = 10000;         // Consider "active" for 10s after visibility change

// Minimum processing display time (ms) for smooth UX
const MIN_PROCESSING_TIME = 800;

// Resize animation duration (ms)
const RESIZE_ANIMATION_DURATION = 400;

// Delay before resize starts (ms) - allows content to prepare
const RESIZE_DELAY = 50;

// Pending import data structure
interface PendingImport {
  rows: CSVRow[];
  query: string;
  source: string;
  htmlForBuild?: string;
  entryId?: string;  // ID записи в relay для подтверждения
}

// Main App Component
const App: React.FC = () => {
  // === STATE ===
  const [appState, setAppState] = useState<AppState>('checking');
  const [relayUrl, setRelayUrl] = useState(DEFAULT_RELAY_URL);
  const [lastQuery, setLastQuery] = useState<string | undefined>();
  const [importInfo, setImportInfo] = useState<ImportInfo>({
    query: '',
    itemCount: 0
  });
  const [showFileDrop, setShowFileDrop] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [confetti, setConfetti] = useState<{ active: boolean; type: 'success' | 'error' }>({ 
    active: false, 
    type: 'success' 
  });
  const [hasSelection, setHasSelection] = useState(false);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [showExtensionGuide, setShowExtensionGuide] = useState(false);
  const [showRelayGuide, setShowRelayGuide] = useState(false);
  const [relayConnected, setRelayConnected] = useState(false);
  
  // Extension installed / setup skipped state (persisted in clientStorage)
  const [extensionInstalled, setExtensionInstalled] = useState(false);
  const previousStateRef = useRef<AppState | null>(null);
  
  // Drag counter to handle nested elements
  const dragCounterRef = useRef(0);
  
  // Refs
  const relayCheckIntervalRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);
  const processingStartTimeRef = useRef<number | null>(null);
  const currentSizeRef = useRef({ width: UI_SIZES.checking.width, height: UI_SIZES.checking.height });
  const resizeAnimationRef = useRef<number | null>(null);
  const isFirstResizeRef = useRef(true);
  const lastActivityTimeRef = useRef<number>(Date.now());  // For adaptive polling
  
  // WebSocket refs
  const wsRef = useRef<WebSocket | null>(null);
  const wsReconnectAttemptRef = useRef(0);
  const wsReconnectTimeoutRef = useRef<number | null>(null);
  const wsConnectedRef = useRef(false);  // Track if WS is connected for fallback logic
  
  // Track last processed entryId to avoid showing same data twice
  const lastProcessedEntryIdRef = useRef<string | null>(null);
  const isAckInProgressRef = useRef(false);  // Prevent peek during ack

  // === ANIMATED RESIZE HELPER ===
  const resizeUI = useCallback((state: AppState | keyof typeof UI_SIZES) => {
    const targetSize = UI_SIZES[state as keyof typeof UI_SIZES] || UI_SIZES.ready;
    const currentSize = currentSizeRef.current;
    
    // Cancel any ongoing animation
    if (resizeAnimationRef.current) {
      cancelAnimationFrame(resizeAnimationRef.current);
      resizeAnimationRef.current = null;
    }
    
    // If size is the same, skip animation
    if (currentSize.width === targetSize.width && currentSize.height === targetSize.height) {
      return;
    }
    
    // First resize is instant (no flicker on startup)
    if (isFirstResizeRef.current) {
      isFirstResizeRef.current = false;
      currentSizeRef.current = { width: targetSize.width, height: targetSize.height };
      sendMessageToPlugin({ type: 'resize-ui', width: targetSize.width, height: targetSize.height });
      return;
    }
    
    // Delay before starting animation
    setTimeout(() => {
      const startWidth = currentSizeRef.current.width;
      const startHeight = currentSizeRef.current.height;
      const deltaWidth = targetSize.width - startWidth;
      const deltaHeight = targetSize.height - startHeight;
      const startTime = performance.now();
      
      // Easing function (ease-in-out quad) - smoother than cubic
      const easeInOutQuad = (t: number) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      
      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / RESIZE_ANIMATION_DURATION, 1);
        const easedProgress = easeInOutQuad(progress);
        
        const newWidth = Math.round(startWidth + deltaWidth * easedProgress);
        const newHeight = Math.round(startHeight + deltaHeight * easedProgress);
        
        currentSizeRef.current = { width: newWidth, height: newHeight };
        sendMessageToPlugin({ type: 'resize-ui', width: newWidth, height: newHeight });
        
        if (progress < 1) {
          resizeAnimationRef.current = requestAnimationFrame(animate);
        } else {
          resizeAnimationRef.current = null;
        }
      };
      
      resizeAnimationRef.current = requestAnimationFrame(animate);
    }, RESIZE_DELAY);
  }, []);

  // === RELAY CONNECTION ===
  
  // Store relay payload for later use
  const relayPayloadRef = useRef<unknown>(null);
  
  // Store entry ID for acknowledgment
  const pendingEntryIdRef = useRef<string | null>(null);

  // peekRelayData — просмотр данных БЕЗ удаления из очереди
  // Данные удаляются только после подтверждения через /ack
  const peekRelayData = useCallback(async () => {
    console.log(`👁️ [peekRelayData] Начало, relayUrl=${relayUrl}`);
    
    // Don't peek if ack is in progress
    if (isAckInProgressRef.current) {
      console.log(`👁️ [peekRelayData] Пропуск — ack в процессе`);
      return;
    }
    
    try {
      const response = await fetch(`${relayUrl}/peek`);
      console.log(`👁️ [peekRelayData] Response status: ${response.status}`);
      if (!response.ok) return;
      
      const data = await response.json();
      console.log(`👁️ [peekRelayData] Data:`, data);
      if (!data.hasData || !data.payload) {
        console.log(`👁️ [peekRelayData] Нет данных (hasData=${data.hasData})`);
        return;
      }
      
      const payload = data.payload;
      const entryId = data.entryId;
      
      // Skip if this is the same entry we just processed (and are waiting for ack)
      if (entryId === lastProcessedEntryIdRef.current) {
        console.log(`👁️ [peekRelayData] Пропуск — это та же запись, ожидаем ack: ${entryId}`);
        return;
      }
      
      // Skip if we already have this entry pending
      if (entryId === pendingEntryIdRef.current) {
        console.log(`👁️ [peekRelayData] Пропуск — уже показываем эту запись: ${entryId}`);
        return;
      }
      
      // Extract rows from payload (schemaVersion 2: rawRows only)
      // Backward compatible with v1 (items._rawCSVRow fallback)
      let rows: CSVRow[] = [];
      if (payload.rawRows && payload.rawRows.length > 0) {
        rows = payload.rawRows;
      } else if (payload.schemaVersion < 2 && payload.items && payload.items.length > 0) {
        // Legacy v1 fallback: extract from items._rawCSVRow
        rows = payload.items
          .map((item: { _rawCSVRow?: CSVRow }) => item._rawCSVRow)
          .filter((row: CSVRow | undefined): row is CSVRow => row !== undefined);
      }
      
      if (rows.length === 0) return;
      
      // Extract query
      let query = rows[0]?.['#query'] || '';
      if (!query && payload.source?.url) {
        try {
          const urlParams = new URL(payload.source.url).searchParams;
          query = urlParams.get('text') || urlParams.get('q') || '';
        } catch {
          // Use empty query
        }
      }
      
      const wizardCount = payload.wizards?.length || 0;
      console.log(`📦 Получено ${rows.length} сниппетов + ${wizardCount} wizard из relay: "${query}" (entryId: ${entryId})`);
      
      // Mark extension as installed (data received means extension is working)
      if (!extensionInstalled) {
        setExtensionInstalled(true);
        sendMessageToPlugin({ type: 'save-setup-skipped' });
      }
      
      // Store payload and entry ID for later acknowledgment
      relayPayloadRef.current = payload;
      pendingEntryIdRef.current = entryId;
      
      const totalCount = rows.length + wizardCount;
      setPendingImport({
        rows,
        query: query || 'Импорт данных',
        source: 'Яндекс',
        entryId
      });
      setImportInfo({
        query: query || 'Импорт данных',
        itemCount: totalCount,
        source: 'Яндекс'
      });
      setAppState('confirming');
      resizeUI('confirming');
      
    } catch (error) {
      console.error('Error peeking relay data:', error);
    }
  }, [relayUrl, resizeUI, extensionInstalled]);
  
  // Acknowledge relay data after successful import (with retry)
  const ackRelayData = useCallback(async (entryId: string) => {
    console.log(`✓ [ackRelayData] Подтверждение: ${entryId}`);
    
    // Mark this entry as processed to prevent re-showing
    lastProcessedEntryIdRef.current = entryId;
    isAckInProgressRef.current = true;
    
    const ACK_MAX_RETRIES = 3;
    const ACK_RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff
    
    for (let attempt = 0; attempt <= ACK_MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(`${relayUrl}/ack`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entryId }),
          signal: AbortSignal.timeout(5000)
        });
        if (response.ok) {
          console.log(`✓ [ackRelayData] Данные подтверждены и удалены из очереди`);
          lastProcessedEntryIdRef.current = null;
          isAckInProgressRef.current = false;
          return; // Success
        }
        console.error(`✗ [ackRelayData] Ошибка: ${response.status}`);
      } catch (error) {
        console.error(`✗ [ackRelayData] Attempt ${attempt + 1} failed:`, error);
      }
      
      // Wait before retry (unless last attempt)
      if (attempt < ACK_MAX_RETRIES) {
        const delay = ACK_RETRY_DELAYS[Math.min(attempt, ACK_RETRY_DELAYS.length - 1)];
        console.log(`✓ [ackRelayData] Retry in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // All retries exhausted
    console.error(`✗ [ackRelayData] All retries failed for ${entryId}`);
    isAckInProgressRef.current = false;
  }, [relayUrl]);

  // checkRelay returns: 'connected' | 'connected-with-data' | 'disconnected'
  const checkRelay = useCallback(async (): Promise<'connected' | 'connected-with-data' | 'disconnected'> => {
    console.log(`🔍 [checkRelay] Проверка relay: ${relayUrl}/status`);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      
      const response = await fetch(`${relayUrl}/status`, { 
        signal: controller.signal 
      });
      clearTimeout(timeoutId);
      
      console.log(`🔍 [checkRelay] Response status: ${response.status}`);
      if (!response.ok) return 'disconnected';
      
      const data = await response.json();
      console.log(`🔍 [checkRelay] Queue status:`, data);
      
      // Check if there's pending data in queue
      // Support both pendingCount (new) and queueSize (legacy) for compatibility
      const hasPendingData = data.hasData || (data.pendingCount > 0) || (data.queueSize > 0);
      if (hasPendingData) {
        console.log(`🔍 [checkRelay] Есть данные в очереди (pending=${data.pendingCount}, queue=${data.queueSize}), вызываю peekRelayData`);
        // Peek data from relay (without removing)
        await peekRelayData();
        return 'connected-with-data';
      } else {
        console.log(`🔍 [checkRelay] Очередь пуста`);
      }
      
      return 'connected';
    } catch (error) {
      console.log(`🔍 [checkRelay] Ошибка:`, error);
      return 'disconnected';
    }
  }, [relayUrl, peekRelayData]);

  // === INITIALIZATION ===
  useEffect(() => {
    isMountedRef.current = true;
    
    // Apply theme
    applyFigmaTheme();
    
    // Load saved relay URL
    try {
      const saved = localStorage.getItem('contentify-relay-url');
      if (saved) setRelayUrl(saved);
    } catch {
      // localStorage may not be available
    }
    
    // Initial relay check
    const doInitialCheck = async () => {
      console.log(`🚀 [Init] Начальная проверка relay...`);
      const result = await checkRelay();
      console.log(`🚀 [Init] Результат проверки: ${result}`);
      if (!isMountedRef.current) return;
      
      if (result === 'connected-with-data') {
        // Data found and peekRelayData already set state to 'confirming'
        console.log(`🚀 [Init] Relay подключён, есть данные для импорта`);
        setRelayConnected(true);
        // State already set by peekRelayData, don't override
      } else if (result === 'connected') {
        console.log(`🚀 [Init] Relay подключён, переход в ready`);
        setRelayConnected(true);
        setAppState('ready');
        resizeUI('ready');
      } else {
        console.log(`🚀 [Init] Relay не подключён — готов к работе через clipboard (Cmd+V)`);
        setRelayConnected(false);
        setAppState('ready');
        resizeUI('ready');
      }
    };
    
    doInitialCheck();
    
    // Request settings from plugin
    sendMessageToPlugin({ type: 'get-settings' });
    sendMessageToPlugin({ type: 'get-setup-skipped' });
    
    return () => {
      isMountedRef.current = false;
    };
  }, [checkRelay, resizeUI]);

  // === WEBSOCKET CONNECTION ===
  // Primary method for instant data delivery from relay
  // Falls back to HTTP polling when WebSocket is unavailable
  useEffect(() => {
    // Don't connect during processing or confirmation
    if (appState === 'processing' || appState === 'fileDrop' || appState === 'confirming') {
      return;
    }
    
    // Get WebSocket URL from relay URL
    const wsUrl = relayUrl.replace(/^http/, 'ws');
    
    // Connect to WebSocket
    const connectWebSocket = () => {
      if (!isMountedRef.current) return;
      if (wsRef.current?.readyState === WebSocket.OPEN) return;
      
      console.log('🔌 [WebSocket] Подключение к', wsUrl);
      
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        
        ws.onopen = () => {
          if (!isMountedRef.current) return;
          console.log('🔌 [WebSocket] Подключён');
          wsConnectedRef.current = true;
          wsReconnectAttemptRef.current = 0;
          
          // Stop HTTP polling when WS is connected
          if (relayCheckIntervalRef.current) {
            clearTimeout(relayCheckIntervalRef.current);
            relayCheckIntervalRef.current = null;
          }
          
          // Update relay connection status
          setRelayConnected(true);
        };
        
        ws.onmessage = async (event) => {
          if (!isMountedRef.current) return;
          
          try {
            const data = JSON.parse(event.data);
            console.log('📨 [WebSocket] Сообщение:', data.type);
            
            if (data.type === 'new-data') {
              // New data available — immediately fetch it
              console.log(`📦 [WebSocket] Новые данные: ${data.itemCount} элементов, query: "${data.query}"`);
              
              // Don't process if we're already confirming or processing
              if (appState === 'confirming' || appState === 'processing') {
                console.log('📦 [WebSocket] Пропуск — уже обрабатываем');
                return;
              }
              
              // Fetch the data via HTTP (peek)
              await peekRelayData();
            } else if (data.type === 'connected') {
              // Server sent connection confirmation with queue status
              if (data.pendingCount > 0) {
                console.log(`📦 [WebSocket] В очереди ${data.pendingCount} элементов`);
                // Fetch pending data
                if (appState !== 'confirming' && appState !== 'processing') {
                  await peekRelayData();
                }
              }
            }
          } catch (e) {
            console.error('📨 [WebSocket] Ошибка парсинга:', e);
          }
        };
        
        ws.onclose = () => {
          if (!isMountedRef.current) return;
          console.log('🔌 [WebSocket] Соединение закрыто');
          wsConnectedRef.current = false;
          wsRef.current = null;
          setRelayConnected(false);
          
          // Start HTTP polling fallback
          startPollingFallback();
          
          // Schedule reconnect with exponential backoff
          scheduleReconnect();
        };
        
        ws.onerror = (error) => {
          console.error('🔌 [WebSocket] Ошибка:', error);
          // onclose will be called after onerror
        };
        
      } catch (e) {
        console.error('🔌 [WebSocket] Не удалось подключиться:', e);
        wsConnectedRef.current = false;
        startPollingFallback();
        scheduleReconnect();
      }
    };
    
    // Schedule WebSocket reconnect with exponential backoff
    const scheduleReconnect = () => {
      if (!isMountedRef.current) return;
      if (wsReconnectTimeoutRef.current) return;
      
      const attempt = wsReconnectAttemptRef.current;
      const delay = WS_RECONNECT_DELAYS[Math.min(attempt, WS_RECONNECT_DELAYS.length - 1)];
      
      console.log(`🔌 [WebSocket] Повторное подключение через ${delay}ms (попытка ${attempt + 1})`);
      
      wsReconnectTimeoutRef.current = window.setTimeout(() => {
        wsReconnectTimeoutRef.current = null;
        wsReconnectAttemptRef.current++;
        connectWebSocket();
      }, delay);
    };
    
    // HTTP polling fallback when WebSocket is unavailable
    const startPollingFallback = () => {
      if (relayCheckIntervalRef.current) return;  // Already polling
      if (wsConnectedRef.current) return;  // WS is connected
      
      console.log('🔄 [Fallback] Запуск HTTP polling');
      
      const scheduleNextPoll = () => {
        if (!isMountedRef.current) return;
        if (wsConnectedRef.current) {
          // WS reconnected, stop polling
          console.log('🔄 [Fallback] WebSocket восстановлен, остановка polling');
          return;
        }
        
        // Calculate adaptive interval
        const timeSinceActivity = Date.now() - lastActivityTimeRef.current;
        const interval = timeSinceActivity < ACTIVE_THRESHOLD_MS 
          ? RELAY_CHECK_INTERVAL_ACTIVE 
          : RELAY_CHECK_INTERVAL_IDLE;
        
        relayCheckIntervalRef.current = window.setTimeout(async () => {
          relayCheckIntervalRef.current = null;
          if (!isMountedRef.current) return;
          if (wsConnectedRef.current) return;  // WS reconnected
          
          // Skip polling if document is hidden
          if (document.visibilityState === 'hidden') {
            scheduleNextPoll();
            return;
          }
          
          const result = await checkRelay();
          if (!isMountedRef.current) return;
          
          if (result === 'connected-with-data') {
            setRelayConnected(true);
            // State already set by peekRelayData
            return;
          }
          
          if (result === 'connected') {
            setRelayConnected(true);
          } else if (result === 'disconnected') {
            setRelayConnected(false);
          }
          
          // Schedule next poll
          scheduleNextPoll();
        }, interval);
      };
      
      scheduleNextPoll();
    };
    
    // Start WebSocket connection
    connectWebSocket();
    
    return () => {
      // Cleanup
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (wsReconnectTimeoutRef.current) {
        clearTimeout(wsReconnectTimeoutRef.current);
        wsReconnectTimeoutRef.current = null;
      }
      if (relayCheckIntervalRef.current) {
        clearTimeout(relayCheckIntervalRef.current);
        relayCheckIntervalRef.current = null;
      }
    };
  }, [appState, relayUrl, checkRelay, peekRelayData, resizeUI]);

  // === INSTANT CHECK ON VISIBILITY CHANGE ===
  // When Figma becomes active (user switches to it), check relay status
  // With WebSocket, this mainly serves to:
  // 1. Update activity timestamp for faster polling fallback
  // 2. Trigger immediate check if WS was disconnected while hidden
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && isMountedRef.current) {
        // Update activity timestamp for adaptive polling
        lastActivityTimeRef.current = Date.now();
        
        // Don't check during processing or confirming states
        if (appState === 'processing' || appState === 'confirming') {
          return;
        }
        
        console.log('👁️ [Visibility] Figma активирована');
        
        // If WebSocket is connected, just send a ping to keep alive
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'ping' }));
          console.log('👁️ [Visibility] WebSocket активен, ping отправлен');
          return;
        }
        
        // WebSocket not connected — do HTTP check
        console.log('👁️ [Visibility] WebSocket не подключён, HTTP проверка...');
        const result = await checkRelay();
        
        if (!isMountedRef.current) return;
        
        if (result === 'connected-with-data') {
          console.log('👁️ [Visibility] Найдены данные для импорта!');
          setRelayConnected(true);
          // State already set by peekRelayData
        } else if (result === 'connected') {
          console.log('👁️ [Visibility] Relay подключён');
          setRelayConnected(true);
        } else if (result === 'disconnected') {
          setRelayConnected(false);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [appState, checkRelay, resizeUI]);

  // === FINISH PROCESSING WITH MIN DELAY ===
  const finishProcessing = useCallback((type: 'success' | 'error' | 'cancel') => {
    const elapsed = processingStartTimeRef.current 
      ? Date.now() - processingStartTimeRef.current 
      : MIN_PROCESSING_TIME;
    const remainingDelay = Math.max(0, MIN_PROCESSING_TIME - elapsed);
    
    setTimeout(() => {
      if (!isMountedRef.current) return;
      
      processingStartTimeRef.current = null;
      
      if (type === 'success') {
        // Show success view with confetti
        setConfetti({ active: true, type: 'success' });
        setAppState('success');
        resizeUI('success');
      } else if (type === 'error') {
        // Go back to ready on error
        setConfetti({ active: true, type: 'error' });
        setAppState('ready');
        resizeUI('ready');
      } else {
        // Cancel - just go back to ready
        setAppState('ready');
        resizeUI('ready');
      }
    }, remainingDelay);
  }, [resizeUI]);
  
  // === HANDLE SUCCESS VIEW COMPLETE ===
  const handleSuccessComplete = useCallback(() => {
    setAppState('ready');
    resizeUI('ready');
  }, [resizeUI]);

  // === PLUGIN MESSAGE HANDLER ===
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (!msg || !msg.type) return;
      
      switch (msg.type) {
        case 'settings-loaded':
          // Settings loaded (for future use)
          break;
          
        case 'setup-skipped-loaded':
          // User previously skipped the setup wizard
          if (msg.skipped) {
            setExtensionInstalled(true);
          }
          break;
          
        case 'selection-status':
          // Update selection state from plugin
          setHasSelection(msg.hasSelection === true);
          break;
          
        case 'progress':
          // Update stage during processing
          if (appState === 'processing' && msg.operationType) {
            setImportInfo(prev => ({ ...prev, stage: msg.operationType }));
          }
          break;
          
        case 'done':
        case 'build-page-done':
        case 'relay-payload-applied':
          // Processing complete with min delay
          console.log('✅ Обработка завершена');
          
          // Acknowledge relay data after successful import (async, but we track it)
          if (pendingEntryIdRef.current) {
            const entryIdToAck = pendingEntryIdRef.current;
            pendingEntryIdRef.current = null;
            // Fire and forget, but ackRelayData sets flags to prevent re-peek
            ackRelayData(entryIdToAck);
          }
          
          finishProcessing('success');
          break;
          
        case 'error':
          // Error occurred with min delay
          console.error('❌ Ошибка:', msg.message);
          // Don't acknowledge on error — data stays in queue for retry
          pendingEntryIdRef.current = null;
          finishProcessing('error');
          break;
          
        case 'import-cancelled':
          console.log('⛔ Импорт отменён');
          // Don't acknowledge on cancel — data stays in queue
          pendingEntryIdRef.current = null;
          finishProcessing('cancel');
          break;
      }
    };
    
    window.onmessage = handleMessage;
    return () => { window.onmessage = null; };
  }, [appState, finishProcessing, ackRelayData]);

  // === CONFIRM IMPORT HANDLER ===
  const handleConfirmImport = useCallback((mode: ImportMode) => {
    if (!pendingImport) return;
    
    const { rows, query, htmlForBuild, entryId } = pendingImport;
    const scope = mode === 'selection' ? 'selection' : 'page';
    
    // Store entryId for acknowledgment after successful import
    if (entryId) {
      pendingEntryIdRef.current = entryId;
      
      // Safety timeout: if code.ts never sends 'done' within 30s, ack and warn
      const safetyEntryId = entryId;
      const safetyTimeout = window.setTimeout(() => {
        if (pendingEntryIdRef.current === safetyEntryId) {
          console.warn(`⏱️ [Safety] Timeout waiting for done, auto-acking ${safetyEntryId}`);
          pendingEntryIdRef.current = null;
          ackRelayData(safetyEntryId);
        }
      }, 30000);
      
      // Check periodically if entryId was already handled (cancel timeout early)
      const checkInterval = window.setInterval(() => {
        if (pendingEntryIdRef.current !== safetyEntryId) {
          clearTimeout(safetyTimeout);
          clearInterval(checkInterval);
        }
      }, 5000);
      // Ensure interval doesn't outlive the timeout
      setTimeout(() => clearInterval(checkInterval), 35000);
    }
    
    setLastQuery(query);
    setImportInfo({
      query,
      itemCount: rows.length,
      source: pendingImport.source,
      stage: 'components'
    });
    setAppState('processing');
    resizeUI('processing');
    processingStartTimeRef.current = Date.now();
    
    // If we have relay payload, use it
    if (relayPayloadRef.current) {
      sendMessageToPlugin({
        type: 'apply-relay-payload',
        payload: relayPayloadRef.current,
        scope
      });
      relayPayloadRef.current = null;
    } else if (htmlForBuild && mode === 'artboard') {
      // File import with HTML - build page
      sendMessageToPlugin({
        type: 'build-page',
        rows,
        html: htmlForBuild,
        wizards: fileWizardsRef.current || []
      });
      fileWizardsRef.current = [];
    } else {
      // Regular import (selection mode or no HTML)
      sendMessageToPlugin({
        type: 'import-csv',
        rows,
        scope,
        resetBeforeImport: false
      });
    }
    
    fileHtmlRef.current = '';
    fileWizardsRef.current = [];
    setPendingImport(null);
  }, [pendingImport, resizeUI]);

  const handleCancelImport = useCallback(() => {
    // Temporarily block this entry from being shown again for 10 seconds
    // This prevents the "cancel → immediately show same data" loop
    const cancelledEntryId = pendingEntryIdRef.current;
    if (cancelledEntryId) {
      lastProcessedEntryIdRef.current = cancelledEntryId;
      // Clear the block after 10 seconds so user can try again
      setTimeout(() => {
        if (lastProcessedEntryIdRef.current === cancelledEntryId) {
          lastProcessedEntryIdRef.current = null;
        }
      }, 10000);
    }
    
    setPendingImport(null);
    relayPayloadRef.current = null;
    pendingEntryIdRef.current = null;  // Don't acknowledge — data stays in queue
    setAppState('ready');
    resizeUI('ready');
  }, [resizeUI]);

  // Clear relay queue handler
  const handleClearQueue = useCallback(async () => {
    try {
      console.log('🗑️ [ClearQueue] Очистка очереди...');
      const response = await fetch(`${relayUrl}/clear`, { method: 'DELETE' });
      const result = await response.json();
      console.log(`🗑️ [ClearQueue] Удалено записей: ${result.cleared}`);
      
      // Reset state
      setPendingImport(null);
      relayPayloadRef.current = null;
      pendingEntryIdRef.current = null;
      lastProcessedEntryIdRef.current = null;
      setAppState('ready');
      resizeUI('ready');
    } catch (error) {
      console.error('🗑️ [ClearQueue] Ошибка:', error);
      // Still reset local state
      setPendingImport(null);
      setAppState('ready');
      resizeUI('ready');
    }
  }, [relayUrl, resizeUI]);

  // === KEYBOARD SHORTCUTS ===
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+O or Ctrl+O - Open file picker
      if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
        e.preventDefault();
        if (appState !== 'processing') {
          setShowFileDrop(true);
          resizeUI('fileDrop');
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [appState, resizeUI]);

  // === CLIPBOARD PASTE HANDLER (Fallback import) ===
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      // Process paste in ready or confirming states (allows re-import with new data)
      if (appState !== 'ready' && appState !== 'confirming') {
        return;
      }
      
      const text = e.clipboardData?.getData('text');
      if (!text) return;
      
      try {
        const data = JSON.parse(text);
        
        // Check if this is contentify paste data
        if (data.type === 'contentify-paste' && data.payload) {
          e.preventDefault();
          console.log('📋 Обнаружены данные из буфера обмена (clipboard fallback)');
          
          const payload = data.payload;
          
          // Extract rows from payload (schemaVersion 2: rawRows only)
          // Backward compatible with v1 (items._rawCSVRow fallback)
          let rows: CSVRow[] = [];
          if (payload.rawRows && payload.rawRows.length > 0) {
            rows = payload.rawRows;
          } else if (payload.schemaVersion < 2 && payload.items && payload.items.length > 0) {
            // Legacy v1 fallback: extract from items._rawCSVRow
            rows = payload.items
              .map((item: { _rawCSVRow?: CSVRow }) => item._rawCSVRow)
              .filter((row: CSVRow | undefined): row is CSVRow => row !== undefined);
          }
          
          if (rows.length === 0) {
            console.warn('📋 Нет данных для импорта в буфере обмена');
            return;
          }
          
          // Extract query
          let query = rows[0]?.['#query'] || '';
          if (!query && payload.source?.url) {
            try {
              const urlParams = new URL(payload.source.url).searchParams;
              query = urlParams.get('text') || urlParams.get('q') || '';
            } catch {
              // Use empty query
            }
          }
          
          console.log(`📋 Получено ${rows.length} элементов из буфера обмена: "${query}"`);
          
          // Mark extension as installed (data from clipboard means extension is working)
          if (!extensionInstalled) {
            setExtensionInstalled(true);
            sendMessageToPlugin({ type: 'save-setup-skipped' });
          }
          
          // Store payload for later use
          relayPayloadRef.current = payload;
          
          setPendingImport({
            rows,
            query: query || 'Импорт из буфера',
            source: 'Буфер обмена'
          });
          setImportInfo({
            query: query || 'Импорт из буфера',
            itemCount: rows.length,
            source: 'Буфер обмена'
          });
          setAppState('confirming');
          resizeUI('confirming');
        }
      } catch {
        // Not JSON or not our format, ignore
      }
    };
    
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [appState, resizeUI, extensionInstalled]);

  // Store file HTML for later use
  const fileHtmlRef = useRef<string>('');
  const fileWizardsRef = useRef<unknown[]>([]);

  // === FILE PROCESSING ===
  const MAX_FILE_SIZE_MB = 50;
  const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
  
  const handleFileSelect = useCallback(async (files: FileList) => {
    if (!files || files.length === 0) return;
    
    setShowFileDrop(false);
    
    const file = files[0];
    console.log(`📂 Обработка файла: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`);
    
    // File size limit
    if (file.size > MAX_FILE_SIZE_BYTES) {
      console.error(`❌ Файл слишком большой: ${(file.size / 1024 / 1024).toFixed(1)} MB (макс. ${MAX_FILE_SIZE_MB} MB)`);
      setConfetti({ active: true, type: 'error' });
      setAppState('ready');
      resizeUI('ready');
      return;
    }
    
    try {
      let rows: CSVRow[] = [];
      let htmlForBuild = '';
      let fileWizards: unknown[] = [];
      
      if (file.name.endsWith('.mhtml') || file.name.endsWith('.mht')) {
        const text = await file.text();
        const mhtmlResult = await parseMhtmlStreamingAsync(text, {});
        
        const htmlContent = mhtmlResult.html;
        if (!htmlContent) throw new Error('Не удалось извлечь HTML из MHTML');
        htmlForBuild = htmlContent;
        
        const result = parseYandexSearchResults(htmlContent, mhtmlResult.fullMhtml);
        if (result.error) throw new Error(result.error);
        
        rows = result.rows;
        fileWizards = result.wizards || [];
      } else if (file.name.endsWith('.html') || file.name.endsWith('.htm')) {
        const text = await file.text();
        htmlForBuild = text;
        
        const result = parseYandexSearchResults(text, text);
        if (result.error) throw new Error(result.error);
        
        rows = result.rows;
        fileWizards = result.wizards || [];
      } else {
        throw new Error('Поддерживаются только HTML и MHTML файлы');
      }
      
      if (rows.length === 0) {
        throw new Error('Не найдено данных для импорта');
      }
      
      // Extract query from rows
      const query = rows[0]?.['#query'] || file.name.replace(/\.(m?html?)$/i, '');
      
      console.log(`📋 Найдено ${rows.length} результатов`);
      
      // Store HTML and wizards, show confirmation dialog
      fileHtmlRef.current = htmlForBuild;
      fileWizardsRef.current = fileWizards;
      setPendingImport({
        rows,
        query,
        source: 'Файл',
        htmlForBuild
      });
      setImportInfo({
        query,
        itemCount: rows.length,
        source: 'Файл'
      });
      setAppState('confirming');
      resizeUI('confirming');
      
    } catch (error) {
      console.error('❌ Ошибка обработки файла:', error);
      setConfetti({ active: true, type: 'error' });
      setAppState('ready');
      resizeUI('ready');
    }
  }, [resizeUI]);

  // === HANDLERS ===
  const handleCancel = useCallback(() => {
    sendMessageToPlugin({ type: 'cancel-import' });
    console.log('⛔ Отмена импорта...');
  }, []);

  // Track if retry check is in progress (for SetupView indicator)
  const [isRetryChecking, setIsRetryChecking] = useState(false);
  
  // Extension guide handlers
  const handleShowExtensionGuide = useCallback(() => {
    previousStateRef.current = appState;
    setShowExtensionGuide(true);
    resizeUI('extensionGuide');
  }, [appState, resizeUI]);
  
  const handleCloseExtensionGuide = useCallback(() => {
    setShowExtensionGuide(false);
    const prevState = previousStateRef.current || appState;
    resizeUI(prevState);
    previousStateRef.current = null;
  }, [appState, resizeUI]);
  
  // Relay guide handlers
  const handleShowRelayGuide = useCallback(() => {
    previousStateRef.current = appState;
    setShowRelayGuide(true);
    resizeUI('extensionGuide'); // Same size as extension guide
  }, [appState, resizeUI]);
  
  const handleCloseRelayGuide = useCallback(() => {
    setShowRelayGuide(false);
    const prevState = previousStateRef.current || appState;
    resizeUI(prevState);
    previousStateRef.current = null;
  }, [appState, resizeUI]);
  
  const handleRetryConnection = useCallback(async () => {
    setIsRetryChecking(true);
    
    const result = await checkRelay();
    
    setIsRetryChecking(false);
    
    if (result === 'connected-with-data') {
      setRelayConnected(true);
      // State already set by peekRelayData to 'confirming'
      return;
    }
    
    if (result === 'connected') {
      setRelayConnected(true);
    }
    // If disconnected, relayConnected stays false
  }, [checkRelay]);

  const handleCloseFileDrop = useCallback(() => {
    setShowFileDrop(false);
    // Return to previous state
    if (appState === 'fileDrop') {
      setAppState('ready');
      resizeUI('ready');
    }
  }, [appState, resizeUI]);

  // === DRAG AND DROP HANDLERS ===
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    
    if (e.dataTransfer.types.includes('Files') && appState !== 'processing') {
      setIsDragging(true);
    }
  }, [appState]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0 && appState !== 'processing') {
      handleFileSelect(files);
    }
  }, [appState, handleFileSelect]);

  // === RENDER ===
  // Determine if setup is needed
  const needsSetup = !extensionInstalled;
  
  return (
    <div 
      className="glass-app"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* StatusBar — always visible except during checking or guides */}
      {appState !== 'checking' && !showExtensionGuide && !showRelayGuide && (
        <StatusBar
          relayConnected={relayConnected}
          extensionInstalled={extensionInstalled}
          onRelayClick={handleShowRelayGuide}
          onExtensionClick={handleShowExtensionGuide}
        />
      )}
      
      {/* Checking state */}
      {appState === 'checking' && (
        <div className="checking-view">
          <div className="checking-view-spinner" />
          <span className="checking-view-text">Подключение...</span>
        </div>
      )}
      
      {/* Ready state with SetupWizard or WaitingState */}
      {appState === 'ready' && !showExtensionGuide && !showRelayGuide && (
        needsSetup ? (
          <SetupWizard
            relayConnected={relayConnected}
            extensionInstalled={extensionInstalled}
            onSkip={() => {
              // Mark as installed to skip setup and persist
              setExtensionInstalled(true);
              sendMessageToPlugin({ type: 'save-setup-skipped' });
            }}
          />
        ) : (
          <ReadyView 
            lastQuery={lastQuery}
            relayConnected={relayConnected}
            onShowExtensionGuide={handleShowExtensionGuide}
          />
        )
      )}
      
      {/* Confirming state */}
      {appState === 'confirming' && pendingImport && !showExtensionGuide && !showRelayGuide && (
        <ImportConfirmDialog
          query={importInfo.query}
          itemCount={importInfo.itemCount}
          source={importInfo.source}
          hasSelection={hasSelection}
          onConfirm={handleConfirmImport}
          onCancel={handleCancelImport}
        />
      )}
      
      {/* Processing state */}
      {appState === 'processing' && !showExtensionGuide && !showRelayGuide && (
        <ProcessingView 
          importInfo={importInfo}
          onCancel={handleCancel}
        />
      )}
      
      {/* Success state */}
      {appState === 'success' && !showExtensionGuide && !showRelayGuide && (
        <SuccessView 
          query={importInfo.query}
          onComplete={handleSuccessComplete}
          autoCloseDelay={3500}
        />
      )}
      
      
      {/* File drop overlay (hidden fallback for Cmd+O) */}
      <FileDropOverlay
        isOpen={showFileDrop}
        onClose={handleCloseFileDrop}
        onFileSelect={handleFileSelect}
      />
      
      {/* Drag overlay */}
      {isDragging && (
        <div className="drag-overlay">
          <div className="drag-overlay-content">
            <span className="drag-overlay-icon">📄</span>
            <span className="drag-overlay-text">Отпустите для импорта</span>
          </div>
        </div>
      )}
      
      {/* Confetti celebration */}
      <Confetti 
        isActive={confetti.active} 
        type={confetti.type}
        onComplete={() => setConfetti({ active: false, type: 'success' })}
      />
      
      {/* Extension installation guide - replaces current view */}
      {showExtensionGuide && (
        <ExtensionGuide onBack={handleCloseExtensionGuide} />
      )}
      
      {/* Relay installation guide - replaces current view */}
      {showRelayGuide && (
        <RelayGuide onBack={handleCloseRelayGuide} />
      )}
    </div>
  );
};

// Mount React app
const root = ReactDOM.createRoot(document.getElementById('react-page') as HTMLElement);
root.render(<App />);
