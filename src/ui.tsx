import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import { CSVRow, ProcessingStats, ProgressData, PluginMessage } from './types';
import { 
  applyFigmaTheme, 
  sendMessageToPlugin, 
  parseYandexSearchResults,
  parseMhtmlFile
} from './utils';

// Main App Component
const App: React.FC = () => {
  console.log('🚀 App component is rendering');
  
  // Add error boundary for debugging
  React.useEffect(() => {
    console.log('🚀 App component mounted successfully');
    
    // Test if React hooks are working
    try {
      console.log('🔧 Testing React hooks...');
    } catch (error) {
      console.error('❌ Error in App component:', error);
    }
  }, []);
  
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

  // Copy logs to clipboard using fallback method (no permissions required)
  const copyLogs = useCallback(() => {
    const logText = logs.join('\n');
    if (!logText) {
      addLog('⚠️ Нет логов для копирования');
      return;
    }
    
    try {
      // Используем старый метод через временный textarea (не требует разрешений)
      const textarea = document.createElement('textarea');
      textarea.value = logText;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '-9999px';
      textarea.setAttribute('readonly', '');
      document.body.appendChild(textarea);
      
      // Выделяем и копируем
      textarea.select();
      textarea.setSelectionRange(0, logText.length);
      
      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);
      
      if (successful) {
        addLog('📋 Логи скопированы в буфер обмена');
      } else {
        addLog('❌ Не удалось скопировать логи');
      }
    } catch (error) {
      addLog(`❌ Ошибка копирования: ${error}`);
    }
  }, [logs, addLog]);

  // Apply Figma/system theme
  useEffect(() => {
    try {
      applyFigmaTheme();
      const mql = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyFigmaTheme();
      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', handler);
      } else {
        // Safari
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
      // no-op
    }
  }, []);


  // Check selection status (only once on mount)
  useEffect(() => {
    const checkSelection = () => {
      sendMessageToPlugin({ type: 'check-selection' });
    };

    // Check selection only on mount
    checkSelection();
  }, []);

  // Handle file input change
  const handleFileInputChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    await processHtmlFile(file);
  }, []);

  // Process HTML or MHTML file
  const processHtmlFile = useCallback(async (file: File) => {
    console.log('📁 Обработка файла:', file.name);
    setIsParsingFromHtml(true);
    addLog(`📁 Обработка файла: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`);

    try {
      const text = await file.text();
      addLog('📄 Файл прочитан');
      
      // Определяем тип файла и парсим соответственно
      let htmlContent: string;
      const isMhtml = file.name.toLowerCase().endsWith('.mhtml') || 
                      file.name.toLowerCase().endsWith('.mht') ||
                      text.includes('Content-Type: multipart/related');
      
      if (isMhtml) {
        addLog('📦 Обнаружен MHTML файл, извлекаем HTML...');
        htmlContent = parseMhtmlFile(text);
        addLog('✅ HTML извлечен из MHTML');
      } else {
        htmlContent = text;
      }
      
      const parsedData = parseYandexSearchResults(htmlContent);
      addLog(`✅ Найдено ${parsedData.length} сниппетов`);

      if (parsedData.length === 0) {
        addLog('⚠️ Не найдено данных для парсинга. Убедитесь, что файл содержит HTML с результатами поиска.');
        setIsParsingFromHtml(false);
        return;
      }

      // Отправляем данные сразу в плагин
      addLog(`📤 Отправляем ${parsedData.length} строк в плагин для заполнения...`);
      console.log('📤 Отправляем данные в плагин:', {
        type: 'import-csv',
        rowsCount: parsedData.length,
        scope: scope
      });
      
      const message: PluginMessage = {
        type: 'import-csv',
        rows: parsedData,
        scope: scope
      };
      
      console.log('📤 Сообщение для отправки:', message);
      sendMessageToPlugin(message);
      addLog(`✅ Данные отправлены в плагин. Область: ${scope}`);

    } catch (error) {
      console.error('❌ Ошибка при парсинге:', error);
      addLog(`❌ Ошибка: ${error}`);
    } finally {
      setIsParsingFromHtml(false);
    }
  }, [addLog, scope]);

  // Handle drag and drop
  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(false);
    
    const file = event.dataTransfer.files?.[0];
    if (file && (
      file.type === 'text/html' || 
      file.type === 'message/rfc822' ||
      file.type === 'multipart/related' ||
      file.name.toLowerCase().endsWith('.html') ||
      file.name.toLowerCase().endsWith('.mhtml') ||
      file.name.toLowerCase().endsWith('.mht')
    )) {
      processHtmlFile(file);
    } else {
      addLog('❌ Пожалуйста, выберите HTML или MHTML файл');
    }
  }, [processHtmlFile, addLog]);

  // Handle click on drop zone to open file dialog
  const handleDropZoneClick = useCallback(() => {
    const input = document.getElementById('html-file-input') as HTMLInputElement;
    input?.click();
  }, []);


  // Handle messages from plugin
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data.pluginMessage as PluginMessage;
      if (!msg) return;

      addLog(`📨 Получено сообщение от плагина: ${msg.type}`);

      switch (msg.type) {
        case 'selection-status':
          setHasSelection(msg.hasSelection || false);
          if (scope === 'selection') {
            addLog(msg.hasSelection ? '✅ Элементы выделены' : '⚠️ Нет выделенных элементов');
          } else {
            // При scope === 'page' не требуем выделения
            addLog('📄 Режим обработки всей страницы');
          }
          break;
          
        case 'log':
          addLog(msg.message || '');
          break;
          
        case 'progress':
          setProgress({
            current: msg.current || 0,
            total: msg.total || 0,
            operationType: msg.operationType || 'instances'
          });
          break;
          
        case 'stats':
          setStats(msg.stats || null);
          break;
          
        case 'done':
          setIsLoading(false);
          addLog(`✅ Обработка завершена. Обработано ${msg.count || 0} инстансов.`);
          break;
          
        case 'error':
          setIsLoading(false);
          addLog(`❌ Ошибка в плагине: ${msg.message}`);
          break;
          
        default:
          addLog(`❓ Неизвестный тип сообщения: ${msg.type}`);
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [addLog, scope]);


  return (
    <div id="root">
      <h1>Contentify - Парсинг HTML</h1>

      <div className="form-group">
        <label htmlFor="html-file-input">Парсинг из HTML/MHTML файла</label>
        <input
          id="html-file-input"
          type="file"
          accept=".html,.mhtml,.mht,text/html,message/rfc822"
          onChange={handleFileInputChange}
          style={{ display: 'none' }}
        />
        <div
          onClick={handleDropZoneClick}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{
            border: `2px dashed ${isDragOver ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
            borderRadius: '8px',
            padding: '32px',
            textAlign: 'center',
            cursor: 'pointer',
            backgroundColor: isDragOver ? 'var(--bg-hover)' : 'var(--bg-secondary)',
            transition: 'all 0.2s ease',
            userSelect: 'none'
          }}
        >
          {isParsingFromHtml ? (
            <div style={{ color: 'var(--text-primary)' }}>
              <div>🔄 Обработка...</div>
            </div>
          ) : (
            <div style={{ color: 'var(--text-secondary)' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>📁</div>
              <div style={{ fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '4px' }}>
                Перетащите HTML или MHTML файл сюда
              </div>
              <div style={{ fontSize: '10px' }}>или нажмите для выбора файла</div>
            </div>
          )}
        </div>
        <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '4px' }}>
          💡 Сохраните страницу из Яндекс.Поиска как MHTML (File → Save Page As → Webpage, Complete) или HTML и перетащите сюда
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="scope-select">Область применения</label>
        <select 
          id="scope-select" 
          value={scope}
          onChange={(e) => {
            const newScope = e.target.value as 'selection' | 'page';
            setScope(newScope);
            // При смене на 'page' не требуем выделения
            if (newScope === 'page') {
              addLog('📄 Режим обработки всей страницы - выделение не требуется');
            } else {
              // При смене на 'selection' проверяем выделение
              sendMessageToPlugin({ type: 'check-selection' });
            }
          }}
        >
          <option value="selection">К выделенным элементам</option>
          <option value="page">Ко всей странице</option>
        </select>
        {scope === 'selection' && (
          <div className="selection-status">
            {hasSelection ? '✅ Элементы выделены' : '⚠️ Выберите элементы'}
          </div>
        )}
        {scope === 'page' && (
          <div className="selection-status" style={{ color: 'var(--text-secondary)' }}>
            📄 Обработка всей страницы
          </div>
        )}
      </div>


      {progress && (
        <div className="progress">
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
          <div className="progress-text">
            {progress.operationType === 'images' 
              ? `Загрузка изображений (${progress.current}/${progress.total})`
              : `Обработка инстансов (${progress.current}/${progress.total})`
            }
          </div>
        </div>
      )}

      {stats && (
        <div className="stats">
          <h3>Результаты обработки</h3>
          <div>Обработано инстансов: {stats.processedInstances}/{stats.totalInstances}</div>
          <div>Успешно загружено изображений: {stats.successfulImages}</div>
          <div>Пропущено изображений: {stats.skippedImages}</div>
          <div>Ошибок загрузки изображений: {stats.failedImages}</div>
        </div>
      )}

      <div className="logs-section">
        <div className="logs-header">
          <h3>Логи работы плагина</h3>
          <div>
            <button 
              onClick={() => setShowLogs(!showLogs)}
              className={`toggle-logs-button ${showLogs ? 'expanded' : ''}`}
            >
              {showLogs ? '📖 Скрыть' : '📖 Показать'}
            </button>
            <button 
              onClick={copyLogs}
              className="copy-button"
              disabled={logs.length === 0}
            >
              📋 Копировать
            </button>
          </div>
        </div>
        <div className={`logs-content ${showLogs ? 'expanded' : ''}`}>
          <textarea 
            className="logs-textarea"
            value={logs.join('\n')}
            readOnly
            placeholder="Логи появятся здесь..."
          />
        </div>
      </div>
    </div>
  );
};

// Initialize React app when DOM is ready
function initializeReactApp() {
  console.log('🔧 Инициализация React приложения...');
  console.log('🔧 document.getElementById("root"):', document.getElementById('root'));
  console.log('🔧 document.body:', document.body);
  console.log('🔧 document.readyState:', document.readyState);

  const rootElement = document.getElementById('root');
  if (!rootElement) {
    console.error('❌ Элемент с id="root" не найден!');
    console.log('🔍 Доступные элементы:', document.querySelectorAll('*'));
    return;
  }

  console.log('✅ Элемент root найден:', rootElement);

  try {
    const root = ReactDOM.createRoot(rootElement as HTMLElement);
    console.log('🔧 React root создан:', root);
    root.render(<App />);
    console.log('🔧 App компонент отправлен на рендер');
  } catch (error) {
    console.error('❌ Ошибка инициализации React:', error);
  }
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  console.log('🔧 DOM еще загружается, ждем...');
  document.addEventListener('DOMContentLoaded', initializeReactApp);
} else {
  console.log('🔧 DOM уже готов, инициализируем сразу');
  initializeReactApp();
}