import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import { CSVRow, ProcessingStats, ProgressData, PluginMessage, UserSettings } from './types';
import { 
  applyFigmaTheme, 
  sendMessageToPlugin, 
  parseYandexSearchResults,
  parseMhtmlFile
} from './utils';

// Main App Component
const App: React.FC = () => {
  const [scope, setScope] = useState<'selection' | 'page'>('selection');
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [stats, setStats] = useState<ProcessingStats | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [hasSelection, setHasSelection] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isParsingFromHtml, setIsParsingFromHtml] = useState(false);

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

  // Check selection periodically
  useEffect(() => {
    const interval = setInterval(() => {
      sendMessageToPlugin({ type: 'check-selection' });
    }, 1000);
    return () => clearInterval(interval);
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
        const result = parseYandexSearchResults(htmlContent);
        if (result.error) throw new Error(result.error);
        
        rows = result.rows;
        addLog(`✅ Извлечено ${rows.length} результатов из MHTML`);
      } else if (file.name.endsWith('.html') || file.name.endsWith('.htm')) {
        addLog('📄 Обнаружен HTML файл');
        setIsParsingFromHtml(true);
        const text = await file.text();
        
        addLog('🔍 Парсинг HTML контента...');
        const result = parseYandexSearchResults(text);
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
      else if (msg.type === 'selection-status') {
        setHasSelection(msg.hasSelection);
        if (!msg.hasSelection && scope === 'selection') {
          // Optionally switch to 'page' if selection is lost, but better to just show warning/disable
        }
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
        setProgress(null);
        addLog(`✅ Готово! Обработано ${msg.count} элементов.`);
      } 
      else if (msg.type === 'error') {
        addLog(`❌ Ошибка плагина: ${msg.message}`);
        setIsLoading(false);
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

  return (
    <div className="container">
      <div className="header">
        <h2>Contentify</h2>
        <div className="status-badge">
          {isLoading ? '⏳ Working...' : 'Ready'}
        </div>
      </div>

      <div className="section">
        <div className="section-title">Настройки</div>
        <div className="radio-group">
          <label className="radio-label">
            <input 
              type="radio" 
              name="scope" 
              value="selection" 
              checked={scope === 'selection'} 
              onChange={() => handleScopeChange('selection')}
            />
            <span>Только выделение</span>
          </label>
          <label className="radio-label">
            <input 
              type="radio" 
              name="scope" 
              value="page" 
              checked={scope === 'page'} 
              onChange={() => handleScopeChange('page')}
            />
            <span>Вся страница</span>
          </label>
        </div>
        {!hasSelection && scope === 'selection' && (
          <div className="warning-text">⚠️ Ничего не выделено. Выберите элементы в Figma.</div>
        )}
      </div>

      <div 
        className={`drop-zone ${isDragOver ? 'drag-over' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => document.getElementById('file-input')?.click()}
      >
        <div className="drop-icon">📁</div>
        <div className="drop-text">
          Перетащите HTML/MHTML файл сюда<br/>
          или кликните для выбора
        </div>
        <input 
          type="file" 
          id="file-input" 
          accept=".html,.htm,.mhtml,.mht" 
          onChange={handleFileInputChange} 
          style={{ display: 'none' }}
        />
      </div>

      {isLoading && (
        <div className="section">
          <div className="progress-bar-container">
            <div 
              className="progress-bar" 
              style={{ width: `${progress ? (progress.current / progress.total) * 100 : 0}%` }}
            ></div>
          </div>
          <div className="progress-text">
            {progress ? `${progress.message || ''} (${progress.current}/${progress.total})` : 'Загрузка...'}
          </div>
        </div>
      )}

      {stats && (
        <div className="section stats-box">
          <div className="section-title">Статистика</div>
          <div className="stats-grid">
            <div className="stat-item">
              <div className="stat-value">{stats.processedInstances}</div>
              <div className="stat-label">Обработано</div>
            </div>
            <div className="stat-item">
              <div className="stat-value success">{stats.successfulImages}</div>
              <div className="stat-label">Картинки OK</div>
            </div>
            <div className="stat-item">
              <div className="stat-value error">{stats.failedImages}</div>
              <div className="stat-label">Ошибки</div>
            </div>
          </div>
        </div>
      )}

      <div className="section logs-section">
        <div className="logs-header" onClick={() => setShowLogs(!showLogs)}>
          <span>Логи ({logs.length})</span>
          <span className="toggle-icon">{showLogs ? '▼' : '▶'}</span>
        </div>
        
        {showLogs && (
          <>
            <div className="logs-container">
              {logs.map((log, index) => (
                <div key={index} className={`log-entry ${log.includes('❌') ? 'error' : ''} ${log.includes('✅') ? 'success' : ''}`}>
                  {log}
                </div>
              ))}
            </div>
            <div className="logs-actions">
              <button className="secondary-button small" onClick={copyLogs}>Копировать</button>
              <button className="secondary-button small" onClick={() => setLogs([])}>Очистить</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('react-page') as HTMLElement);
root.render(<App />);
