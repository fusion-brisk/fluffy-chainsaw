/**
 * EProductSnippet Plugin — UI Entry Point (Redesigned)
 * 
 * Glass UI with minimal states:
 * - checking: Initial relay connection check
 * - ready: Relay connected, waiting for data
 * - processing: Importing/processing data
 * - setup: Relay not connected, show onboarding
 * - fileDrop: Hidden fallback for file import
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
import { SetupView } from './components/SetupView';
import { FileDropOverlay } from './components/FileDropOverlay';
import { Confetti } from './components/Confetti';
import { ImportConfirmDialog, ImportMode } from './components/ImportConfirmDialog';
import { SuccessView } from './components/SuccessView';

// Default relay URL
const DEFAULT_RELAY_URL = 'http://localhost:3847';

// Relay check interval (ms)
const RELAY_CHECK_INTERVAL = 3000;

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
  
  // Drag counter to handle nested elements
  const dragCounterRef = useRef(0);
  
  // Refs
  const relayCheckIntervalRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);
  const processingStartTimeRef = useRef<number | null>(null);
  const currentSizeRef = useRef({ width: UI_SIZES.checking.width, height: UI_SIZES.checking.height });
  const resizeAnimationRef = useRef<number | null>(null);
  const isFirstResizeRef = useRef(true);

  // === ANIMATED RESIZE HELPER ===
  const resizeUI = useCallback((state: AppState) => {
    const targetSize = UI_SIZES[state] || UI_SIZES.ready;
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
  const checkRelay = useCallback(async (): Promise<boolean> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      
      const response = await fetch(`${relayUrl}/status`, { 
        signal: controller.signal 
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) return false;
      
      const data = await response.json();
      
      // Check if there's data in queue
      if (data.queueSize && data.queueSize > 0) {
        // Pull data from relay
        await pullRelayData();
      }
      
      return true;
    } catch {
      return false;
    }
  }, [relayUrl]);

  // Store relay payload for later use
  const relayPayloadRef = useRef<unknown>(null);

  const pullRelayData = useCallback(async () => {
    try {
      const response = await fetch(`${relayUrl}/pull`);
      if (!response.ok) return;
      
      const data = await response.json();
      if (!data.hasData || !data.payload) return;
      
      const payload = data.payload;
      
      // Extract rows from payload
      let rows: CSVRow[] = [];
      if (payload.rawRows && payload.rawRows.length > 0) {
        rows = payload.rawRows;
      } else if (payload.items && payload.items.length > 0) {
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
      
      console.log(`📦 Получено ${rows.length} элементов из relay: "${query}"`);
      
      // Store payload and show confirmation dialog
      relayPayloadRef.current = payload;
      setPendingImport({
        rows,
        query: query || 'Импорт данных',
        source: 'Яндекс'
      });
      setImportInfo({
        query: query || 'Импорт данных',
        itemCount: rows.length,
        source: 'Яндекс'
      });
      setAppState('confirming');
      resizeUI('confirming');
      
    } catch (error) {
      console.error('Error pulling relay data:', error);
    }
  }, [relayUrl, resizeUI]);

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
      const connected = await checkRelay();
      if (!isMountedRef.current) return;
      
      if (connected) {
        setAppState('ready');
        resizeUI('ready');
      } else {
        setAppState('setup');
        resizeUI('setup');
      }
    };
    
    doInitialCheck();
    
    // Request settings from plugin
    sendMessageToPlugin({ type: 'get-settings' });
    
    return () => {
      isMountedRef.current = false;
    };
  }, [checkRelay, resizeUI]);

  // === RELAY POLLING ===
  useEffect(() => {
    if (appState === 'processing' || appState === 'fileDrop') {
      // Stop polling during processing
      if (relayCheckIntervalRef.current) {
        clearInterval(relayCheckIntervalRef.current);
        relayCheckIntervalRef.current = null;
      }
      return;
    }
    
    // Start polling
    relayCheckIntervalRef.current = window.setInterval(async () => {
      if (!isMountedRef.current) return;
      
      const connected = await checkRelay();
      if (!isMountedRef.current) return;
      
      if (connected && appState === 'setup') {
        setAppState('ready');
        resizeUI('ready');
      } else if (!connected && appState === 'ready') {
        setAppState('setup');
        resizeUI('setup');
      }
    }, RELAY_CHECK_INTERVAL);
    
    return () => {
      if (relayCheckIntervalRef.current) {
        clearInterval(relayCheckIntervalRef.current);
        relayCheckIntervalRef.current = null;
      }
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
          finishProcessing('success');
          break;
          
        case 'error':
          // Error occurred with min delay
          console.error('❌ Ошибка:', msg.message);
          finishProcessing('error');
          break;
          
        case 'import-cancelled':
          console.log('⛔ Импорт отменён');
          finishProcessing('cancel');
          break;
      }
    };
    
    window.onmessage = handleMessage;
    return () => { window.onmessage = null; };
  }, [appState, finishProcessing]);

  // === CONFIRM IMPORT HANDLER ===
  const handleConfirmImport = useCallback((mode: ImportMode) => {
    if (!pendingImport) return;
    
    const { rows, query, htmlForBuild } = pendingImport;
    const scope = mode === 'selection' ? 'selection' : 'page';
    
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
        html: htmlForBuild
      });
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
    setPendingImport(null);
  }, [pendingImport, resizeUI]);

  const handleCancelImport = useCallback(() => {
    setPendingImport(null);
    relayPayloadRef.current = null;
    setAppState('ready');
    resizeUI('ready');
  }, [resizeUI]);

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

  // Store file HTML for later use
  const fileHtmlRef = useRef<string>('');

  // === FILE PROCESSING ===
  const handleFileSelect = useCallback(async (files: FileList) => {
    if (!files || files.length === 0) return;
    
    setShowFileDrop(false);
    
    const file = files[0];
    console.log(`📂 Обработка файла: ${file.name}`);
    
    try {
      let rows: CSVRow[] = [];
      let htmlForBuild = '';
      
      if (file.name.endsWith('.mhtml') || file.name.endsWith('.mht')) {
        const text = await file.text();
        const mhtmlResult = await parseMhtmlStreamingAsync(text, {});
        
        const htmlContent = mhtmlResult.html;
        if (!htmlContent) throw new Error('Не удалось извлечь HTML из MHTML');
        htmlForBuild = htmlContent;
        
        const result = parseYandexSearchResults(htmlContent, mhtmlResult.fullMhtml);
        if (result.error) throw new Error(result.error);
        
        rows = result.rows;
      } else if (file.name.endsWith('.html') || file.name.endsWith('.htm')) {
        const text = await file.text();
        htmlForBuild = text;
        
        const result = parseYandexSearchResults(text, text);
        if (result.error) throw new Error(result.error);
        
        rows = result.rows;
      } else {
        throw new Error('Поддерживаются только HTML и MHTML файлы');
      }
      
      if (rows.length === 0) {
        throw new Error('Не найдено данных для импорта');
      }
      
      // Extract query from rows
      const query = rows[0]?.['#query'] || file.name.replace(/\.(m?html?)$/i, '');
      
      console.log(`📋 Найдено ${rows.length} результатов`);
      
      // Store HTML and show confirmation dialog
      fileHtmlRef.current = htmlForBuild;
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
  
  const handleRetryConnection = useCallback(async () => {
    // Don't resize — keep setup view visible during check
    setIsRetryChecking(true);
    
    const connected = await checkRelay();
    
    setIsRetryChecking(false);
    
    if (connected) {
      setAppState('ready');
      resizeUI('ready');
    }
    // If not connected, stay in setup (no state change needed)
  }, [checkRelay, resizeUI]);

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
  return (
    <div 
      className="glass-app"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Checking state */}
      {appState === 'checking' && (
        <div className="checking-view">
          <div className="checking-view-spinner" />
          <span className="checking-view-text">Подключение...</span>
        </div>
      )}
      
      {/* Ready state */}
      {appState === 'ready' && (
        <ReadyView lastQuery={lastQuery} />
      )}
      
      {/* Confirming state */}
      {appState === 'confirming' && pendingImport && (
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
      {appState === 'processing' && (
        <ProcessingView 
          importInfo={importInfo}
          onCancel={handleCancel}
        />
      )}
      
      {/* Success state */}
      {appState === 'success' && (
        <SuccessView 
          query={importInfo.query}
          onComplete={handleSuccessComplete}
          autoCloseDelay={3500}
        />
      )}
      
      {/* Setup state */}
      {appState === 'setup' && (
        <SetupView 
          onRetry={handleRetryConnection}
          isChecking={isRetryChecking}
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
    </div>
  );
};

// Mount React app
const root = ReactDOM.createRoot(document.getElementById('react-page') as HTMLElement);
root.render(<App />);
