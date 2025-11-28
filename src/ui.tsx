import React, { useState, useEffect, useCallback } from 'react';
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
import { ProgressBar } from './components/ProgressBar';
import { StatsPanel } from './components/StatsPanel';
import { LogViewer } from './components/LogViewer';
import { ParsingRulesViewer } from './components/ParsingRulesViewer';
import { UpdateDialog } from './components/UpdateDialog';
import { SettingsPanel } from './components/SettingsPanel';
// [REFACTOR-CHECKPOINT-2] Import new components
import { LiveProgressView } from './components/import/LiveProgressView';
import { CompletionCard } from './components/import/CompletionCard';
// [REFACTOR-CHECKPOINT-3] Import unified views
import { SettingsView } from './components/settings/SettingsView';
import { LogsView } from './components/logs/LogsView';

// Main App Component
const App: React.FC = () => {
  // [REFACTOR-CHECKPOINT-1] Tab navigation state
  const [activeTab, setActiveTab] = useState<TabType>('import');
  // [REFACTOR-CHECKPOINT-2] UI state machine
  const [uiState, setUiState] = useState<UIState>('idle');
  const [scope, setScope] = useState<'selection' | 'page'>('selection');
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [stats, setStats] = useState<ProcessingStats | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [hasSelection, setHasSelection] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isParsingFromHtml, setIsParsingFromHtml] = useState(false);
  const [parsingRulesMetadata, setParsingRulesMetadata] = useState<ParsingRulesMetadata | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState<{
    currentVersion: number;
    newVersion: number;
    hash: string;
  } | null>(null);
  const [remoteUrl, setRemoteUrl] = useState<string>('');

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
      // Load saved settings
      sendMessageToPlugin({ type: 'get-settings' });
      // Load parsing rules
      sendMessageToPlugin({ type: 'get-parsing-rules' });
      // Load remote URL
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
    // Reset input
    event.target.value = '';
  };

  const processFiles = async (files: FileList) => {
    setIsLoading(true);
    setUiState('loading'); // [REFACTOR-CHECKPOINT-2] Set loading state
    setProgress({ current: 0, total: 100, message: 'Чтение файла...' });
    setStats(null);
    setLogs([]);
    addLog('📂 Начало обработки файла...');

    try {
      const file = files[0];
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
      addLog(`❌ Ошибка: ${error instanceof Error ? error.message : String(error)}`);
      setIsLoading(false);
      setUiState('idle'); // [REFACTOR-CHECKPOINT-2] Reset to idle on error
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

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
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
        // Display detailed errors in logs
        if (msg.stats.errors && msg.stats.errors.length > 0) {
          addLog(`⚠️ Found ${msg.stats.errors.length} errors:`);
          msg.stats.errors.forEach(err => {
            addLog(`❌ [${err.type}] Layer "${err.layerName}" (Row ${err.rowIndex ? err.rowIndex + 1 : 'N/A'}): ${err.message}`);
            if (err.url) addLog(`   🔗 URL: ${err.url}`);
          });
          // Auto-open logs if there are errors
          setShowLogs(true);
        }
      } 
      else if (msg.type === 'done') {
        setIsLoading(false);
        setUiState('completed'); // [REFACTOR-CHECKPOINT-2] Set completed state
        setProgress(null);
        addLog(`✅ Готово! Обработано ${msg.count} элементов.`);
      } 
      else if (msg.type === 'error') {
        addLog(`❌ Ошибка плагина: ${msg.message}`);
        setIsLoading(false);
        setUiState('idle'); // [REFACTOR-CHECKPOINT-2] Reset to idle on error
        setProgress(null);
      }
    };
  }, [addLog, scope]);

  const handleScopeChange = (newScope: 'selection' | 'page') => {
    setScope(newScope);
    sendMessageToPlugin({
      type: 'save-settings',
      settings: { scope: newScope }
    });
  };

  const handleToggleRules = useCallback(() => {
    setShowRules(!showRules);
    // [REFACTOR-CHECKPOINT-1] Auto-switch to settings tab when toggling rules
    if (!showRules) {
      setActiveTab('settings');
    }
  }, [showRules]);

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

  // [REFACTOR-CHECKPOINT-2] Reset to import another file
  const handleImportAnother = useCallback(() => {
    setUiState('idle');
    setStats(null);
    setProgress(null);
    setLogs([]);
    addLog('🔄 Ready for new import');
  }, [addLog]);

  // [REFACTOR-CHECKPOINT-2] View logs from completion card
  const handleViewLogsFromCard = useCallback(() => {
    setActiveTab('logs');
  }, []);

  // [REFACTOR-CHECKPOINT-1] Smart tab navigation: auto-switch to logs on errors
  useEffect(() => {
    if (stats && stats.failedImages > 0 && !isLoading) {
      // Auto-open logs tab if there are errors
      setActiveTab('logs');
    }
  }, [stats, isLoading]);

  // [REFACTOR-CHECKPOINT-4] Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Tab switching: 1, 2, 3
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
      // Open file: Cmd/Ctrl + O
      else if (e.key === 'o' && (e.metaKey || e.ctrlKey)) {
        if (activeTab === 'import' && uiState === 'idle') {
          document.getElementById('file-input')?.click();
          e.preventDefault();
        }
      }
      // Clear logs: Cmd/Ctrl + K (when on logs tab)
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
  }, [activeTab, uiState, logs.length]);

  return (
    <>
      <Header 
        activeTab={activeTab}
        onTabChange={setActiveTab}
        errorCount={stats?.failedImages || 0}
        isLoading={isLoading}
      />

      {/* [REFACTOR-CHECKPOINT-1] Tab: Import */}
      {activeTab === 'import' && (
        <>
          <ScopeControl 
            scope={scope} 
            hasSelection={hasSelection} 
            onScopeChange={handleScopeChange} 
          />

          {/* [REFACTOR-CHECKPOINT-2] State: IDLE - Show DropZone */}
          {uiState === 'idle' && (
            <>
              <DropZone 
                isDragOver={isDragOver}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onFileSelect={handleFileInputChange}
                compact={true}
              />
              
              <div className="import-tip">
                💡 <strong>Tip:</strong> Supports HTML & MHTML files from Yandex search results
              </div>
            </>
          )}

          {/* [REFACTOR-CHECKPOINT-2] State: LOADING - Show LiveProgressView */}
          {uiState === 'loading' && (
            <LiveProgressView 
              progress={progress}
              recentLogs={logs}
              currentOperation={progress?.message}
            />
          )}

          {/* [REFACTOR-CHECKPOINT-2] State: COMPLETED - Show CompletionCard */}
          {uiState === 'completed' && stats && (
            <CompletionCard 
              stats={stats}
              onViewLogs={handleViewLogsFromCard}
              onImportAnother={handleImportAnother}
            />
          )}
        </>
      )}

      {/* [REFACTOR-CHECKPOINT-1] Tab: Settings */}
      {/* [REFACTOR-CHECKPOINT-3] Use new unified SettingsView */}
      {activeTab === 'settings' && (
        <SettingsView 
          remoteUrl={remoteUrl}
          parsingRulesMetadata={parsingRulesMetadata}
          onUpdateUrl={handleUpdateUrl}
          onRefreshRules={handleRefreshRules}
          onResetCache={handleResetCache}
        />
      )}

      {/* [REFACTOR-CHECKPOINT-1] Tab: Logs */}
      {/* [REFACTOR-CHECKPOINT-3] Use new LogsView with filters */}
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
