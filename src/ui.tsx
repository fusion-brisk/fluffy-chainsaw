import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { CSVRow, ProcessingStats, ProgressData, PluginMessage, ParsingRulesMetadata, TabType, UIState } from './types';
import { 
  applyFigmaTheme, 
  sendMessageToPlugin, 
  parseYandexSearchResults,
  parseMhtmlFile
} from './utils/index';

// Components
import { Header } from './components/Header';
import { ScopeControl } from './components/ScopeControl';
import { DropZone } from './components/DropZone';
import { UpdateDialog } from './components/UpdateDialog';
// Import tab components
import { LiveProgressView } from './components/import/LiveProgressView';
import { CompletionCard } from './components/import/CompletionCard';
import { ErrorCard } from './components/import/ErrorCard';
// Settings & Logs views
import { SettingsView } from './components/settings/SettingsView';
import { LogsView } from './components/logs/LogsView';

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
  const [isParsingFromHtml, setIsParsingFromHtml] = useState(false);
  const [parsingRulesMetadata, setParsingRulesMetadata] = useState<ParsingRulesMetadata | null>(null);
  // Track processing time
  const [processingTime, setProcessingTime] = useState<number | null>(null);
  const [processingStartTime, setProcessingStartTime] = useState<number | null>(null);
  // Track file size
  const [currentFileSize, setCurrentFileSize] = useState<number | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState<{
    currentVersion: number;
    newVersion: number;
    hash: string;
  } | null>(null);
  const [remoteUrl, setRemoteUrl] = useState<string>('');
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
      
      const mql = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyFigmaTheme();
      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', handler);
      } else {
        // @ts-ignore
        mql.addListener(handler);
      }
      return () => {
        if (typeof mql.removeEventListener === 'function') {
          mql.removeEventListener('change', handler);
        } else {
          // @ts-ignore
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
        setIsParsingFromHtml(true);
        const text = await file.text();
        const htmlContent = parseMhtmlFile(text);
        if (!htmlContent) throw new Error('Не удалось извлечь HTML из MHTML');
        
        addLog('🔍 Парсинг HTML контента...');
        const result = parseYandexSearchResults(htmlContent, text);
        if (result.error) throw new Error(result.error);
        
        rows = result.rows;
        addLog(`✅ Извлечено ${rows.length} результатов из MHTML`);
      } else if (file.name.endsWith('.html') || file.name.endsWith('.htm')) {
        addLog('📄 Обнаружен HTML файл');
        setIsParsingFromHtml(true);
        const text = await file.text();
        
        addLog('🔍 Парсинг HTML контента...');
        const result = parseYandexSearchResults(text, text);
        if (result.error) throw new Error(result.error);
        
        rows = result.rows;
        addLog(`✅ Извлечено ${rows.length} результатов из HTML`);
      } else {
        throw new Error('Поддерживаются только HTML и MHTML файлы');
      }

      if (rows.length === 0) {
        throw new Error('Не найдено данных для импорта');
      }

      addLog(`🚀 Отправка ${rows.length} строк в плагин...`);
      sendMessageToPlugin({
        type: 'import-csv',
        rows: rows,
        scope: scope
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
    } finally {
      setIsParsingFromHtml(false);
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
    };

    const handleWindowDragLeave = (e: DragEvent) => {
      e.preventDefault();
      if (e.clientX === 0 && e.clientY === 0) {
        setIsDragging(false);
        setIsDragOver(false);
      }
    };

    const handleWindowDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      setIsDragOver(false);
    };

    const handleWindowDragOver = (e: DragEvent) => {
      e.preventDefault();
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
  }, []);

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

  // Handle messages from plugin
  useEffect(() => {
    window.onmessage = (event) => {
      const msg = event.data.pluginMessage as PluginMessage;
      
      if (msg.type === 'settings-loaded') {
        if (msg.settings.scope) {
          setScope(msg.settings.scope);
          console.log('Loaded settings:', msg.settings);
        }
      }
      else if (msg.type === 'parsing-rules-loaded') {
        setParsingRulesMetadata(msg.metadata);
        console.log('Loaded parsing rules:', msg.metadata);
      }
      else if (msg.type === 'rules-update-available') {
        setUpdateAvailable({
          currentVersion: msg.currentVersion,
          newVersion: msg.newVersion,
          hash: msg.hash
        });
        addLog(`🌐 Доступно обновление правил: v${msg.currentVersion} → v${msg.newVersion}`);
      }
      else if (msg.type === 'remote-url-loaded') {
        setRemoteUrl(msg.url);
        console.log('Loaded remote URL:', msg.url);
      }
      else if (msg.type === 'selection-status') {
        setHasSelection(msg.hasSelection);
      } 
      else if (msg.type === 'log') {
        addLog(msg.message);
      } 
      else if (msg.type === 'progress') {
        setProgress({
          current: msg.current,
          total: msg.total,
          operationType: msg.operationType
        });
      } 
      else if (msg.type === 'stats') {
        setStats(msg.stats);
        statsRef.current = msg.stats; // Keep ref updated for done handler
        if (msg.stats.errors && msg.stats.errors.length > 0) {
          addLog(`⚠️ Found ${msg.stats.errors.length} errors:`);
          msg.stats.errors.forEach(err => {
            addLog(`❌ [${err.type}] Layer "${err.layerName}" (Row ${err.rowIndex ? err.rowIndex + 1 : 'N/A'}): ${err.message}`);
            if (err.url) addLog(`   🔗 URL: ${err.url}`);
          });
        }
      } 
      else if (msg.type === 'done') {
        // Calculate processing time
        let elapsedTime: number | null = null;
        if (processingStartTime) {
          elapsedTime = Date.now() - processingStartTime;
          setProcessingTime(elapsedTime);
          addLog(`⏱️ Время обработки: ${Math.round(elapsedTime / 1000)} сек`);
        }

        // Store completion stats for display (use ref to get latest stats)
        const currentStats = statsRef.current;
        if (currentStats) {
          setLastCompletionStats({
            stats: currentStats,
            processingTime: elapsedTime
          });
        }

        setIsLoading(false);
        setUiState('idle'); // Return to idle state (not 'completed')
        setProgress(null);
        addLog(`✅ Готово! Обработано ${msg.count} элементов.`);
      } 
      else if (msg.type === 'error') {
        addLog(`❌ Ошибка плагина: ${msg.message}`);
        
        // Save error for display in status area
        setLastError({
          message: msg.message
        });
        
        setIsLoading(false);
        setUiState('idle');
        setProgress(null);
      }
    };
  }, [addLog, scope, processingStartTime]);

  const handleScopeChange = (newScope: 'selection' | 'page') => {
    setScope(newScope);
    sendMessageToPlugin({
      type: 'save-settings',
      settings: { scope: newScope }
    });
  };

  const handleRefreshRules = useCallback(() => {
    sendMessageToPlugin({ type: 'check-remote-rules-update' });
    addLog('🔄 Проверка обновлений правил парсинга...');
  }, [addLog]);

  const handleResetCache = useCallback(() => {
    if (confirm('Reset parsing rules to default values?')) {
      sendMessageToPlugin({ type: 'reset-rules-cache' });
      addLog('🔄 Сброс правил к значениям по умолчанию...');
    }
  }, [addLog]);

  const handleApplyUpdate = useCallback((hash: string) => {
    sendMessageToPlugin({ type: 'apply-remote-rules', hash });
    setUpdateAvailable(null);
    addLog('✅ Применение обновлённых правил...');
  }, [addLog]);

  const handleDismissUpdate = useCallback(() => {
    sendMessageToPlugin({ type: 'dismiss-rules-update' });
    setUpdateAvailable(null);
    addLog('❌ Обновление правил отклонено');
  }, [addLog]);

  const handleUpdateUrl = useCallback((url: string) => {
    sendMessageToPlugin({ type: 'set-remote-url', url });
    setRemoteUrl(url);
    addLog('🔗 Remote config URL обновлён');
  }, [addLog]);

  // View logs from completion
  const handleViewLogsFromCard = useCallback(() => {
    setActiveTab('logs');
  }, []);

  // Clear completion stats
  const handleDismissCompletion = useCallback(() => {
    setLastCompletionStats(null);
  }, []);

  // Clear error
  const handleDismissError = useCallback(() => {
    setLastError(null);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '1' && !e.metaKey && !e.ctrlKey) {
        setActiveTab('import');
        e.preventDefault();
      } else if (e.key === '2' && !e.metaKey && !e.ctrlKey) {
        setActiveTab('settings');
        e.preventDefault();
      } else if (e.key === '3' && !e.metaKey && !e.ctrlKey) {
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
          if (confirm('Clear all logs?')) {
            setLogs([]);
          }
          e.preventDefault();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, uiState, isLoading, logs.length]);

  const isDropZoneDisabled = (scope === 'selection' && !hasSelection) || isLoading;

  return (
    <>
      <Header 
        activeTab={activeTab}
        onTabChange={setActiveTab}
        errorCount={stats?.failedImages || lastCompletionStats?.stats.failedImages || 0}
        isLoading={isLoading}
      />

      {/* Tab: Import */}
      {activeTab === 'import' && (
        <>
          <ScopeControl 
            scope={scope} 
            hasSelection={hasSelection} 
            onScopeChange={handleScopeChange} 
          />

          {/* DropZone - always visible */}
          <DropZone
            isDragOver={isDragOver}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onFileSelect={handleFileInputChange}
            disabled={isDropZoneDisabled}
            fullscreen={(isDragging || isDragOver) && !isLoading}
            isLoading={isLoading}
            progress={progress ? { current: progress.current, total: progress.total } : undefined}
          />

          {/* Status area below DropZone */}
          <div className="status-area">
            {/* Loading status - GPT thinking style */}
            {isLoading && (
              <LiveProgressView
                progress={progress}
                recentLogs={logs}
                currentOperation={progress?.message}
                fileSize={currentFileSize || undefined}
              />
            )}

            {/* Error - shows when file processing fails */}
            {!isLoading && lastError && (
              <ErrorCard
                message={lastError.message}
                details={lastError.details}
                onViewLogs={handleViewLogsFromCard}
                onDismiss={handleDismissError}
              />
            )}

            {/* Completion summary - shows after successful processing */}
            {!isLoading && !lastError && lastCompletionStats && (
              <CompletionCard
                stats={lastCompletionStats.stats}
                processingTime={lastCompletionStats.processingTime || undefined}
                onViewLogs={handleViewLogsFromCard}
                onDismiss={handleDismissCompletion}
              />
            )}

            {/* Tip - only show when no status to display */}
            {!isLoading && !lastError && !lastCompletionStats && (
              <div className="import-tip">
                💡 <strong>Tip:</strong> Supports HTML & MHTML files from Yandex search results
              </div>
            )}
          </div>
        </>
      )}

      {/* Tab: Settings */}
      {activeTab === 'settings' && (
        <SettingsView 
          remoteUrl={remoteUrl}
          parsingRulesMetadata={parsingRulesMetadata}
          onUpdateUrl={handleUpdateUrl}
          onRefreshRules={handleRefreshRules}
          onResetCache={handleResetCache}
        />
      )}

      {/* Tab: Logs */}
      {activeTab === 'logs' && (
        <LogsView 
          logs={logs}
          onClearLogs={() => setLogs([])}
          onCopyLogs={copyLogs}
        />
      )}

      {updateAvailable && (
        <UpdateDialog
          currentVersion={updateAvailable.currentVersion}
          newVersion={updateAvailable.newVersion}
          hash={updateAvailable.hash}
          onApply={handleApplyUpdate}
          onDismiss={handleDismissUpdate}
        />
      )}
    </>
  );
};

const root = ReactDOM.createRoot(document.getElementById('react-page') as HTMLElement);
root.render(<App />);
