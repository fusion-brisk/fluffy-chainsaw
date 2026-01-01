import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { CSVRow, ProcessingStats, ProgressData, ParsingRulesMetadata, TabType, UIState } from './types';
import { 
  applyFigmaTheme, 
  sendMessageToPlugin, 
  parseYandexSearchResults,
  parseMhtmlFile,
  parseMhtmlStreamingAsync,
  MhtmlParseProgress
} from './utils/index';
import { 
  requestNotificationPermission, 
  showCompletionNotification,
  getNotificationPermission
} from './utils/notifications';
import { usePluginMessages, PluginMessageHandlers } from './hooks';

// Components
import { Header } from './components/Header';
import { ScopeControl } from './components/ScopeControl';
import { DropZone } from './components/DropZone';
import { WhatsNewDialog } from './components/WhatsNewDialog';
import { NoSelectionDialog } from './components/NoSelectionDialog';
import { LazyTab } from './components/LazyTab';
// Import tab components
import { CompletionCard } from './components/import/CompletionCard';
import { ErrorCard } from './components/import/ErrorCard';
// Logs view
import { LogsView } from './components/logs/LogsView';
// Celebration effect
import { Confetti } from './components/Confetti';

// Main App Component
const App: React.FC = () => {
  // Tab navigation state
  const [activeTab, setActiveTab] = useState<TabType>('import');
  // UI state machine
  const [uiState, setUiState] = useState<UIState>('idle');
  const [scope, setScope] = useState<'selection' | 'page'>('selection');
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [stats, setStats] = useState<ProcessingStats | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [hasSelection, setHasSelection] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragFileName, setDragFileName] = useState<string | null>(null);
  // Parsing rules metadata (kept for potential future use)
  const [, setParsingRulesMetadata] = useState<ParsingRulesMetadata | null>(null);
  // Track processing time (stored for potential future use, currently only via lastCompletionStats)
  const [_processingTime, setProcessingTime] = useState<number | null>(null);
  const [processingStartTime, setProcessingStartTime] = useState<number | null>(null);
  // Track file size
  const [currentFileSize, setCurrentFileSize] = useState<number | null>(null);
  // Rules update state (kept for message handler compatibility)
  const [, setUpdateAvailable] = useState<{
    currentVersion: number;
    newVersion: number;
    hash: string;
  } | null>(null);
  // Remote URL (kept for potential future use)
  const [, setRemoteUrl] = useState<string>('');
  
  // What's New state
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [whatsNewBadge, setWhatsNewBadge] = useState(false);
  const [pluginVersion, setPluginVersion] = useState<string>('');
  // Last completion stats for showing after returning to idle
  const [lastCompletionStats, setLastCompletionStats] = useState<{
    stats: ProcessingStats;
    processingTime: number | null;
  } | null>(null);
  
  // Last error for showing in status area
  const [lastError, setLastError] = useState<{
    message: string;
    details?: string;
  } | null>(null);
  
  // Last import data for "Repeat" feature
  const [lastImportData, setLastImportData] = useState<{
    rows: CSVRow[];
    fileName: string;
    scope: 'selection' | 'page';
  } | null>(null);
  
  // Reset snippets options
  const [resetBeforeImport, setResetBeforeImport] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  
<<<<<<< HEAD
  // Log level state (0=SILENT, 1=ERROR, 2=SUMMARY, 3=VERBOSE, 4=DEBUG)
  const [logLevel, setLogLevel] = useState<number>(2); // Default: SUMMARY
  
=======
>>>>>>> 56c12903a41f3c9fea54ea6fd902d9de8f66514e
  // Pending files waiting for confirmation (when scope='selection' but nothing selected)
  const [pendingFiles, setPendingFiles] = useState<FileList | null>(null);
  const [showNoSelectionDialog, setShowNoSelectionDialog] = useState(false);
  // Ref for pending files (to avoid stale closure in callbacks)
  const pendingFilesRef = useRef<FileList | null>(null);
  
<<<<<<< HEAD
  // Celebration confetti state
  const [confetti, setConfetti] = useState<{ active: boolean; type: 'success' | 'error' }>({ active: false, type: 'success' });
  
=======
>>>>>>> 56c12903a41f3c9fea54ea6fd902d9de8f66514e
  // Ref to track latest stats (for closure in message handler)
  const statsRef = useRef<ProcessingStats | null>(null);

  // Add log message
  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    setLogs(prev => [...prev, logMessage]);
    console.log(logMessage);
  }, []);

  // Copy logs to clipboard
  const copyLogs = useCallback(() => {
    const logText = logs.join('\n');
    if (!logText) {
      addLog('⚠️ Нет логов для копирования');
      return;
    }
    
    try {
      const textarea = document.createElement('textarea');
      textarea.value = logText;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '-9999px';
      textarea.setAttribute('readonly', '');
      document.body.appendChild(textarea);
      textarea.select();
      textarea.setSelectionRange(0, logText.length);
      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (successful) addLog('📋 Логи скопированы в буфер обмена');
      else addLog('❌ Не удалось скопировать логи');
    } catch (error) {
      addLog(`❌ Ошибка копирования: ${error}`);
    }
  }, [logs, addLog]);

  // Apply Figma theme and load settings
  useEffect(() => {
    try {
      applyFigmaTheme();
      sendMessageToPlugin({ type: 'get-settings' });
      sendMessageToPlugin({ type: 'get-parsing-rules' });
      sendMessageToPlugin({ type: 'get-remote-url' });
      sendMessageToPlugin({ type: 'check-selection' });
      sendMessageToPlugin({ type: 'check-whats-new' });
      sendMessageToPlugin({ type: 'get-log-level' });
      
      // Request notification permission (non-blocking)
      if (getNotificationPermission() === 'default') {
        requestNotificationPermission().then(granted => {
          if (granted) {
            console.log('Notification permission granted');
          }
        });
      }
      
      const mql = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyFigmaTheme();
      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', handler);
      } else {
        // Fallback for older browsers without addEventListener
        mql.addListener(handler);
      }
      return () => {
        if (typeof mql.removeEventListener === 'function') {
          mql.removeEventListener('change', handler);
        } else {
          // Fallback for older browsers without removeEventListener
          mql.removeListener(handler);
        }
      };
    } catch (e) {
      console.error('Theme init error:', e);
    }
  }, []);

  // Handle file input
  const handleFileInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    await processFiles(files);
    event.target.value = '';
  };

  const processFiles = async (files: FileList) => {
    console.log('[DEBUG] processFiles called, scope:', scope, 'hasSelection:', hasSelection);
    
    // Check if scope is 'selection' but nothing is selected
    if (scope === 'selection' && !hasSelection) {
      console.log('[DEBUG] Showing no-selection dialog');
      // Save files and show confirmation dialog
      setPendingFiles(files);
      pendingFilesRef.current = files;
      setShowNoSelectionDialog(true);
      return;
    }
    
    // Process with current scope
    await processFilesWithScope(files, scope);
  };
  
  // Process files with a specific scope (used after confirmation dialog)
  const processFilesWithScope = async (files: FileList, targetScope: 'selection' | 'page') => {
    // Clear last completion stats and errors when starting new processing
    setLastCompletionStats(null);
    setLastError(null);
    statsRef.current = null;
    
    const startTime = Date.now();
    setProcessingStartTime(startTime);
    setProcessingTime(null);

    setIsLoading(true);
    setUiState('loading');
    setProgress({ current: 0, total: 100, message: 'Чтение файла...' });
    setStats(null);
    setLogs([]);
    addLog('📂 Начало обработки файла...');

    try {
      const file = files[0];
      setCurrentFileSize(file.size);

      // Warn about large files (>10MB)
      const MAX_FILE_SIZE = 10 * 1024 * 1024;
      if (file.size > MAX_FILE_SIZE) {
        const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
        const confirmed = confirm(
          `Warning: Large file detected (${sizeMB}MB)\n\n` +
          `Processing large files may take longer and use more memory.\n\n` +
          `Do you want to continue?`
        );
        if (!confirmed) {
          addLog(`❌ Обработка файла отменена пользователем (${sizeMB}MB)`);
          setIsLoading(false);
          setUiState('idle');
          setProgress(null);
          return;
        }
        addLog(`⚠️ Пользователь подтвердил обработку большого файла (${sizeMB}MB)`);
      }
      let rows: CSVRow[] = [];

      if (file.name.endsWith('.mhtml') || file.name.endsWith('.mht')) {
        addLog('📄 Обнаружен MHTML файл');
        const text = await file.text();
        
        // Streaming MHTML parser с прогрессом (Phase 8)
        const mhtmlResult = await parseMhtmlStreamingAsync(text, {
          onProgress: (p: MhtmlParseProgress) => {
            if (p.stage !== 'done') {
              addLog(`📦 MHTML: ${p.message} (${p.percent}%)`);
            }
          }
        });
        
        const htmlContent = mhtmlResult.html;
        if (!htmlContent) throw new Error('Не удалось извлечь HTML из MHTML');
        
        addLog(`✅ MHTML извлечён за ${mhtmlResult.stats.parseTimeMs.toFixed(0)}ms (${mhtmlResult.stats.partsScanned} частей)`);
        addLog('🔍 Парсинг HTML контента...');
        const result = parseYandexSearchResults(htmlContent, mhtmlResult.fullMhtml);
        if (result.error) throw new Error(result.error);
        
        rows = result.rows;
        addLog(`📋 Найдено ${rows.length} результатов в файле (начало обработки...)`);
      } else if (file.name.endsWith('.html') || file.name.endsWith('.htm')) {
        addLog('📄 Обнаружен HTML файл');
        const text = await file.text();
        
        addLog('🔍 Парсинг HTML контента...');
        const result = parseYandexSearchResults(text, text);
        if (result.error) throw new Error(result.error);
        
        rows = result.rows;
        addLog(`📋 Найдено ${rows.length} результатов в файле (начало обработки...)`);
      } else {
        throw new Error('Поддерживаются только HTML и MHTML файлы');
      }

      if (rows.length === 0) {
        throw new Error('Не найдено данных для импорта');
      }

      // Save import data for "Repeat" feature
      setLastImportData({
        rows: rows,
        fileName: file.name,
        scope: targetScope
      });

      if (resetBeforeImport) {
        addLog(`🔄 Сброс сниппетов перед импортом...`);
      }
      addLog(`🚀 Отправка ${rows.length} строк в плагин (scope: ${targetScope})...`);
      sendMessageToPlugin({
        type: 'import-csv',
        rows: rows,
        scope: targetScope,
        resetBeforeImport: resetBeforeImport
      });

    } catch (error) {
      console.error('File processing error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`❌ Ошибка: ${errorMessage}`);
      
      // Save error for display in status area
      setLastError({
        message: errorMessage,
        details: error instanceof Error && error.stack ? error.stack.split('\n')[0] : undefined
      });
      
      setIsLoading(false);
      setUiState('idle');
      setProgress(null);
    }
  };

  // Handle drag and drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  // Global drag tracking for fullscreen drop zone
  useEffect(() => {
    const handleWindowDragEnter = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(true);
      
      // Try to extract file name from dataTransfer
      if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
        const item = e.dataTransfer.items[0];
        if (item.kind === 'file') {
          // In dragenter, we can't access the file directly, but we can get the name from types
          const types = Array.from(e.dataTransfer.types);
          if (types.includes('Files')) {
            // File name will be set on dragover where we have more access
          }
        }
      }
    };

    const handleWindowDragOver = (e: DragEvent) => {
      e.preventDefault();
      
      // Try to get file name on dragover
      if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
        const item = e.dataTransfer.items[0];
        if (item.kind === 'file' && item.type) {
          // We can infer it's an HTML file from the type
          const isHtml = item.type.includes('html') || item.type === 'text/html';
          if (isHtml && !dragFileName) {
            setDragFileName('HTML file');
          }
        }
      }
    };

    const handleWindowDragLeave = (e: DragEvent) => {
      e.preventDefault();
      if (e.clientX === 0 && e.clientY === 0) {
        setIsDragging(false);
        setIsDragOver(false);
        setDragFileName(null);
      }
    };

    const handleWindowDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      setIsDragOver(false);
      setDragFileName(null);
    };

    window.addEventListener('dragenter', handleWindowDragEnter);
    window.addEventListener('dragleave', handleWindowDragLeave);
    window.addEventListener('drop', handleWindowDrop);
    window.addEventListener('dragover', handleWindowDragOver);

    return () => {
      window.removeEventListener('dragenter', handleWindowDragEnter);
      window.removeEventListener('dragleave', handleWindowDragLeave);
      window.removeEventListener('drop', handleWindowDrop);
      window.removeEventListener('dragover', handleWindowDragOver);
    };
  }, [dragFileName]);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    setIsDragging(false);
    
    // Clear completion stats and errors when dropping new file
    setLastCompletionStats(null);
    setLastError(null);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processFiles(e.dataTransfer.files);
    }
  };

  // Plugin message handlers (memoized to avoid recreating on every render)
  const messageHandlers: PluginMessageHandlers = useMemo(() => ({
    // Settings
    onSettingsLoaded: (settings) => {
      if (settings.scope) {
        setScope(settings.scope);
      }
      if (typeof settings.resetBeforeImport === 'boolean') {
        setResetBeforeImport(settings.resetBeforeImport);
      }
      console.log('Loaded settings:', settings);
    },
    onRemoteUrlLoaded: (url) => {
      setRemoteUrl(url);
      console.log('Loaded remote URL:', url);
    },
    
    // Parsing Rules
    onParsingRulesLoaded: (metadata) => {
      setParsingRulesMetadata(metadata);
      console.log('Loaded parsing rules:', metadata);
    },
    onRulesUpdateAvailable: ({ currentVersion, newVersion, hash }) => {
      setUpdateAvailable({ currentVersion, newVersion, hash });
      addLog(`🌐 Доступно обновление правил: v${currentVersion} → v${newVersion}`);
    },
    
    // Selection
    onSelectionStatus: (hasSelection) => {
      setHasSelection(hasSelection);
    },
    
    // Processing
    onLog: (message) => {
      addLog(message);
    },
    onProgress: (progressData) => {
      setProgress(progressData);
    },
    onStats: (newStats) => {
      setStats(newStats);
      statsRef.current = newStats;
      if (newStats.errors && newStats.errors.length > 0) {
        addLog(`⚠️ Найдено ${newStats.errors.length} ошибок:`);
        newStats.errors.forEach(err => {
          addLog(`❌ [${err.type}] Слой "${err.layerName}" (Строка ${err.rowIndex !== undefined ? err.rowIndex + 1 : '—'}): ${err.message}`);
          if (err.url) addLog(`   🔗 URL: ${err.url}`);
        });
      }
    },
    onDone: (count, elapsedTime) => {
      if (elapsedTime) {
        setProcessingTime(elapsedTime);
        addLog(`⏱️ Время обработки: ${Math.round(elapsedTime / 1000)} сек`);
      }
      
      const currentStats = statsRef.current;
      if (currentStats) {
        setLastCompletionStats({
          stats: currentStats,
          processingTime: elapsedTime
        });
      }

      setIsLoading(false);
      setUiState('idle');
      setProgress(null);
      addLog(`✅ Готово! Обработано ${count} элементов.`);
      
      // 🎉 Карамельный 3D-праздник!
      const hasErrors = !!(currentStats?.failedImages && currentStats.failedImages > 0);
      setConfetti({ active: true, type: hasErrors ? 'error' : 'success' });
      
      // Show browser notification if window is not focused
      showCompletionNotification(count, elapsedTime, hasErrors);
    },
    onError: (message) => {
      addLog(`❌ Ошибка плагина: ${message}`);
      setLastError({ message });
      setIsLoading(false);
      setIsResetting(false);
      setUiState('idle');
      setProgress(null);
    },
    
    // Reset
    onResetDone: (count) => {
      addLog(`🔄 Сброшено ${count} сниппетов`);
      setIsResetting(false);
      setUiState('idle');
      setProgress(null);
    },
    
    // Cancel
    onImportCancelled: () => {
      addLog('⛔ Импорт отменён');
      setUiState('idle');
      setIsLoading(false);
      setProgress(null);
      setProcessingStartTime(null);
    },
    
    // What's New
    onWhatsNewStatus: ({ shouldShow, currentVersion }) => {
      setPluginVersion(currentVersion);
      if (shouldShow) {
        setWhatsNewBadge(true);
        setShowWhatsNew(true);
      }
    },
    
    // Logging
    onLogLevelLoaded: (level) => {
      setLogLevel(level);
    }
  }), [addLog]);

  // Use custom hook for plugin message handling
  usePluginMessages({
    handlers: messageHandlers,
    processingStartTime
  });

  const handleScopeChange = (newScope: 'selection' | 'page') => {
    setScope(newScope);
    sendMessageToPlugin({
      type: 'save-settings',
      settings: { scope: newScope }
    });
  };
  
  const handleResetBeforeImportChange = (value: boolean) => {
    setResetBeforeImport(value);
    sendMessageToPlugin({
      type: 'save-settings',
      settings: { resetBeforeImport: value }
    });
  };

  // View logs from completion
  const handleViewLogsFromCard = useCallback(() => {
    setActiveTab('logs');
  }, []);

  // Clear completion stats
  const handleDismissCompletion = useCallback(() => {
    setLastCompletionStats(null);
  }, []);
  
  // Handle log level change
  const handleLogLevelChange = useCallback((level: number) => {
    setLogLevel(level);
    sendMessageToPlugin({ type: 'set-log-level', level });
  }, []);

  // Clear error
  const handleDismissError = useCallback(() => {
    setLastError(null);
  }, []);

  // Repeat last import
  const handleRepeatImport = useCallback(() => {
    if (!lastImportData) return;
    
    // Clear previous state
    setLastCompletionStats(null);
    setLastError(null);
    statsRef.current = null;
    
    const startTime = Date.now();
    setProcessingStartTime(startTime);
    setProcessingTime(null);
    
    setIsLoading(true);
    setUiState('loading');
    setProgress({ current: 0, total: 100, message: 'Повторный импорт...' });
    setStats(null);
    setLogs([]);
    
    if (resetBeforeImport) {
      addLog(`🔄 Сброс сниппетов перед импортом...`);
    }
    addLog(`🔄 Повторный импорт: ${lastImportData.fileName}`);
    addLog(`🚀 Отправка ${lastImportData.rows.length} строк в плагин...`);
    
    sendMessageToPlugin({
      type: 'import-csv',
      rows: lastImportData.rows,
      scope: lastImportData.scope,
      resetBeforeImport: resetBeforeImport
    });
  }, [lastImportData, addLog, resetBeforeImport]);

  // Reset snippets now (without import)
  const handleResetNow = useCallback(() => {
    if (scope === 'selection' && !hasSelection) {
      addLog('⚠️ Выберите слои для сброса');
      return;
    }
    
    setIsResetting(true);
    setUiState('loading');
    setProgress({ current: 0, total: 100, message: 'Сброс сниппетов...' });
    setLogs([]);
    
    addLog(`🔄 Сброс сниппетов (${scope === 'selection' ? 'выделение' : 'страница'})...`);
    
    sendMessageToPlugin({
      type: 'reset-snippets',
      scope: scope
    });
  }, [scope, hasSelection, addLog]);
  
  // Handle "Apply to page" from no-selection dialog
  const handleApplyToPage = useCallback(() => {
    const files = pendingFilesRef.current;
    setShowNoSelectionDialog(false);
    setPendingFiles(null);
    pendingFilesRef.current = null;
    
    if (files) {
      // Process files with page scope - inline to avoid stale closure
      (async () => {
        // Clear last completion stats and errors when starting new processing
        setLastCompletionStats(null);
        setLastError(null);
        statsRef.current = null;
        
        const startTime = Date.now();
        setProcessingStartTime(startTime);
        setProcessingTime(null);

        setIsLoading(true);
        setUiState('loading');
        setProgress({ current: 0, total: 100, message: 'Чтение файла...' });
        setStats(null);
        setLogs([]);
        addLog('📂 Начало обработки файла (применяем ко всей странице)...');

        try {
          const file = files[0];
          setCurrentFileSize(file.size);

          let rows: CSVRow[] = [];

          if (file.name.endsWith('.mhtml') || file.name.endsWith('.mht')) {
            addLog('📄 Обнаружен MHTML файл');
            const text = await file.text();
            
            // Streaming MHTML parser с прогрессом (Phase 8)
            const mhtmlResult = await parseMhtmlStreamingAsync(text, {
              onProgress: (p: MhtmlParseProgress) => {
                if (p.stage !== 'done') {
                  addLog(`📦 MHTML: ${p.message} (${p.percent}%)`);
                }
              }
            });
            
            const htmlContent = mhtmlResult.html;
            if (!htmlContent) throw new Error('Не удалось извлечь HTML из MHTML');
            
            addLog(`✅ MHTML извлечён за ${mhtmlResult.stats.parseTimeMs.toFixed(0)}ms (${mhtmlResult.stats.partsScanned} частей)`);
            addLog('🔍 Парсинг HTML контента...');
            const result = parseYandexSearchResults(htmlContent, mhtmlResult.fullMhtml);
            if (result.error) throw new Error(result.error);
            
            rows = result.rows;
            addLog(`📋 Найдено ${rows.length} результатов в файле (начало обработки...)`);
          } else if (file.name.endsWith('.html') || file.name.endsWith('.htm')) {
            addLog('📄 Обнаружен HTML файл');
            const text = await file.text();
            
            addLog('🔍 Парсинг HTML контента...');
            const result = parseYandexSearchResults(text, text);
            if (result.error) throw new Error(result.error);
            
            rows = result.rows;
            addLog(`📋 Найдено ${rows.length} результатов в файле (начало обработки...)`);
          } else {
            throw new Error('Поддерживаются только HTML и MHTML файлы');
          }

          if (rows.length === 0) {
            throw new Error('Не найдено данных для импорта');
          }

          // Save import data for "Repeat" feature
          setLastImportData({
            rows: rows,
            fileName: file.name,
            scope: 'page'
          });

          if (resetBeforeImport) {
            addLog(`🔄 Сброс сниппетов перед импортом...`);
          }
          addLog(`🚀 Отправка ${rows.length} строк в плагин (scope: page)...`);
          sendMessageToPlugin({
            type: 'import-csv',
            rows: rows,
            scope: 'page',
            resetBeforeImport: resetBeforeImport
          });

        } catch (error) {
          console.error('File processing error:', error);
          const errorMessage = error instanceof Error ? error.message : String(error);
          addLog(`❌ Ошибка: ${errorMessage}`);
          
          setLastError({
            message: errorMessage,
            details: error instanceof Error && error.stack ? error.stack.split('\n')[0] : undefined
          });
          
          setIsLoading(false);
          setUiState('idle');
          setProgress(null);
        }
      })();
    }
  }, [addLog, resetBeforeImport]);
  
  // Handle cancel from no-selection dialog
  const handleCancelNoSelection = useCallback(() => {
    setShowNoSelectionDialog(false);
    setPendingFiles(null);
    pendingFilesRef.current = null;
  }, []);

  // What's New handlers
  const handleOpenWhatsNew = useCallback(() => {
    setShowWhatsNew(true);
  }, []);

  const handleCloseWhatsNew = useCallback(() => {
    setShowWhatsNew(false);
    // Mark as seen when closing
    if (pluginVersion) {
      sendMessageToPlugin({ type: 'mark-whats-new-seen', version: pluginVersion });
      setWhatsNewBadge(false);
    }
  }, [pluginVersion]);

  // Горячие клавиши
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '1' && !e.metaKey && !e.ctrlKey) {
        setActiveTab('import');
        e.preventDefault();
      } else if (e.key === '2' && !e.metaKey && !e.ctrlKey) {
        setActiveTab('logs');
        e.preventDefault();
      }
      else if (e.key === 'o' && (e.metaKey || e.ctrlKey)) {
        if (activeTab === 'import' && uiState === 'idle' && !isLoading) {
          document.getElementById('file-input')?.click();
          e.preventDefault();
        }
      }
      else if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        if (activeTab === 'logs' && logs.length > 0) {
          if (confirm('Очистить все логи?')) {
            setLogs([]);
          }
          e.preventDefault();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, uiState, isLoading, logs.length]);

  // DropZone is only disabled during loading/resetting
  // When scope='selection' but nothing selected, we show a confirmation dialog instead of blocking
  const isDropZoneDisabled = isLoading || isResetting;

  return (
    <>
      {/* Tab: Import */}
      {activeTab === 'import' && (
        <>
          <ScopeControl 
            scope={scope} 
            hasSelection={hasSelection} 
            onScopeChange={handleScopeChange}
            resetBeforeImport={resetBeforeImport}
            onResetBeforeImportChange={handleResetBeforeImportChange}
            onResetNow={handleResetNow}
            isLoading={isLoading}
            isResetting={isResetting}
          />

          {/* DropZone - shows progress inside when loading */}
          <DropZone
            isDragOver={isDragOver}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onFileSelect={handleFileInputChange}
            onCancel={() => {
              sendMessageToPlugin({ type: 'cancel-import' });
              addLog('⛔ Отмена импорта...');
            }}
            disabled={isDropZoneDisabled}
            fullscreen={(isDragging || isDragOver) && !isLoading}
            isLoading={isLoading || isResetting}
            progress={progress}
            fileSize={currentFileSize || undefined}
            dragFileName={dragFileName}
          />

          {/* Status area below DropZone */}
          <div className="status-area">
<<<<<<< HEAD
=======
            {/* Loading/Resetting status */}
            {(isLoading || isResetting) && (
              <LiveProgressView
                progress={progress}
                fileSize={currentFileSize || undefined}
              />
            )}
>>>>>>> 56c12903a41f3c9fea54ea6fd902d9de8f66514e

            {/* Error - shows when file processing fails */}
            {!isLoading && !isResetting && lastError && (
              <ErrorCard
                message={lastError.message}
                details={lastError.details}
                onViewLogs={handleViewLogsFromCard}
                onDismiss={handleDismissError}
              />
            )}

            {/* Completion summary - shows after successful processing */}
            {!isLoading && !isResetting && !lastError && lastCompletionStats && (
              <CompletionCard
                stats={lastCompletionStats.stats}
                processingTime={lastCompletionStats.processingTime || undefined}
                onViewLogs={handleViewLogsFromCard}
                onDismiss={handleDismissCompletion}
                onRepeat={handleRepeatImport}
                canRepeat={!!lastImportData}
              />
            )}

          </div>
        </>
      )}

      {/* Tab: Logs (lazy loaded, keep mounted for performance) */}
      <LazyTab isActive={activeTab === 'logs'} keepMounted={true}>
        <LogsView 
          logs={logs}
          onClearLogs={() => setLogs([])}
          onCopyLogs={copyLogs}
          logLevel={logLevel}
          onLogLevelChange={handleLogLevelChange}
        />
      </LazyTab>

      {/* Bottom toolbar with navigation */}
      <Header 
        activeTab={activeTab}
        onTabChange={setActiveTab}
        errorCount={stats?.failedImages || lastCompletionStats?.stats.failedImages || 0}
        isLoading={isLoading}
        onWhatsNewClick={handleOpenWhatsNew}
        showWhatsNewBadge={whatsNewBadge}
      />

      {showWhatsNew && pluginVersion && (
        <WhatsNewDialog
          currentVersion={pluginVersion}
          onClose={handleCloseWhatsNew}
        />
      )}
      
      {showNoSelectionDialog && (
        <NoSelectionDialog
          onApplyToPage={handleApplyToPage}
          onCancel={handleCancelNoSelection}
        />
      )}
<<<<<<< HEAD
      
      {/* 🎉 Карамельный 3D-праздник при завершении */}
      <Confetti 
        isActive={confetti.active} 
        type={confetti.type}
        onComplete={() => setConfetti({ active: false, type: 'success' })}
      />
=======
>>>>>>> 56c12903a41f3c9fea54ea6fd902d9de8f66514e
    </>
  );
};

const root = ReactDOM.createRoot(document.getElementById('react-page') as HTMLElement);
root.render(<App />);
