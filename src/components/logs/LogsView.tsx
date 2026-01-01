import React, { useState, useMemo, useEffect, useRef, useCallback, memo } from 'react';
import { debounce } from '../../utils';
import { VirtualList } from '../VirtualList';

interface LogsViewProps {
  logs: string[];
  onClearLogs: () => void;
  onCopyLogs: () => void;
  logLevel?: number;
  onLogLevelChange?: (level: number) => void;
}

// Названия уровней логирования
const LOG_LEVEL_NAMES: Record<number, string> = {
  0: 'Выключено',
  1: 'Ошибки',
  2: 'Итоги',
  3: 'Подробно',
  4: 'Отладка'
};

type LogFilter = 'all' | 'errors' | 'warnings' | 'success';

// Порог для переключения на виртуальный скролл
const VIRTUAL_SCROLL_THRESHOLD = 100;
const LOG_ITEM_HEIGHT = 28; // Высота каждой записи лога в пикселях

export const LogsView: React.FC<LogsViewProps> = memo(({
  logs,
  onClearLogs,
  onCopyLogs,
  logLevel = 2,
  onLogLevelChange
}) => {
  const [activeFilter, setActiveFilter] = useState<LogFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [containerHeight, setContainerHeight] = useState(300);
  
  // Отложенное обновление поиска
  const updateDebouncedQuery = useMemo(
    () => debounce((query: string) => setDebouncedQuery(query), 150),
    []
  );
  
  useEffect(() => {
    updateDebouncedQuery(searchQuery);
  }, [searchQuery, updateDebouncedQuery]);

  // Авто-скролл (для обычного режима)
  const logsContainerRef = useRef<HTMLDivElement>(null);
  
  // Измерение высоты контейнера для виртуального скролла
  const containerWrapperRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const updateHeight = () => {
      if (containerWrapperRef.current) {
        const rect = containerWrapperRef.current.getBoundingClientRect();
        setContainerHeight(Math.max(200, rect.height - 20));
      }
    };
    
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  // Фильтрация логов
  const filteredLogs = useMemo(() => {
    let filtered = logs;

    // Фильтр по категории
    if (activeFilter !== 'all') {
      filtered = filtered.filter(log => {
        switch (activeFilter) {
          case 'errors':
            return log.includes('❌') || log.toLowerCase().includes('error') || log.toLowerCase().includes('ошибка');
          case 'warnings':
            return log.includes('⚠️') || log.toLowerCase().includes('warning') || log.toLowerCase().includes('внимание');
          case 'success':
            return log.includes('✅') || log.toLowerCase().includes('success') || log.toLowerCase().includes('готово');
          default:
            return true;
        }
      });
    }

    // Поиск
    if (debouncedQuery.trim()) {
      const query = debouncedQuery.toLowerCase();
      filtered = filtered.filter(log => log.toLowerCase().includes(query));
    }

    return filtered;
  }, [logs, activeFilter, debouncedQuery]);

  // Подсчёт логов по категориям
  const counts = useMemo(() => {
    return {
      all: logs.length,
      errors: logs.filter(log => log.includes('❌') || log.toLowerCase().includes('error') || log.toLowerCase().includes('ошибка')).length,
      warnings: logs.filter(log => log.includes('⚠️') || log.toLowerCase().includes('warning') || log.toLowerCase().includes('внимание')).length,
      success: logs.filter(log => log.includes('✅') || log.toLowerCase().includes('success') || log.toLowerCase().includes('готово')).length
    };
  }, [logs]);

  // Использовать виртуальный скролл?
  const useVirtualScroll = filteredLogs.length > VIRTUAL_SCROLL_THRESHOLD;

  // Авто-скролл вниз при новых логах (только для обычного режима)
  useEffect(() => {
    if (!useVirtualScroll && logsContainerRef.current && filteredLogs.length > 0) {
      const container = logsContainerRef.current;
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [filteredLogs, useVirtualScroll]);

  const getLogClass = useCallback((log: string): string => {
    if (log.includes('❌') || log.toLowerCase().includes('error') || log.toLowerCase().includes('ошибка')) return 'error';
    if (log.includes('⚠️') || log.toLowerCase().includes('warning') || log.toLowerCase().includes('внимание')) return 'warning';
    if (log.includes('✅') || log.toLowerCase().includes('success') || log.toLowerCase().includes('готово')) return 'success';
    return '';
  }, []);
  
  // Рендер элемента для виртуального списка
  const renderLogItem = useCallback((log: string, _index: number) => (
    <div className={`logs-view-entry ${getLogClass(log)}`}>
      {log}
    </div>
  ), [getLogClass]);

  return (
    <div className="logs-view">
      {/* Заголовок с кнопками */}
      <div className="logs-view-header">
        <div className="logs-view-title">
          Логи
          <span className="logs-view-count">({filteredLogs.length}{filteredLogs.length !== logs.length ? ` из ${logs.length}` : ''})</span>
        </div>
        <div className="logs-view-actions">
          {/* Log Level Dropdown */}
          <select
            className="logs-level-select"
            value={logLevel}
            onChange={(e) => onLogLevelChange?.(Number(e.target.value))}
            title="Уровень детализации логов"
          >
            {Object.entries(LOG_LEVEL_NAMES).map(([level, name]) => (
              <option key={level} value={level}>{name}</option>
            ))}
          </select>
          <button 
            className="logs-view-btn"
            onClick={onCopyLogs}
            disabled={logs.length === 0}
            title="Скопировать все логи в буфер обмена"
          >
            Копировать
          </button>
          <button 
            className="logs-view-btn logs-view-btn-danger"
            onClick={onClearLogs}
            disabled={logs.length === 0}
            title="Очистить все логи"
          >
            Очистить
          </button>
        </div>
      </div>

      {/* Фильтры */}
      <div className="logs-view-filters">
        <div className="logs-view-filter-buttons">
          <button
            className={`logs-filter-btn ${activeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setActiveFilter('all')}
          >
            Все {counts.all > 0 && <span className="logs-filter-badge">{counts.all}</span>}
          </button>
          <button
            className={`logs-filter-btn ${activeFilter === 'errors' ? 'active' : ''}`}
            onClick={() => setActiveFilter('errors')}
            disabled={counts.errors === 0}
          >
            Ошибки {counts.errors > 0 && <span className="logs-filter-badge">{counts.errors}</span>}
          </button>
          <button
            className={`logs-filter-btn ${activeFilter === 'warnings' ? 'active' : ''}`}
            onClick={() => setActiveFilter('warnings')}
            disabled={counts.warnings === 0}
          >
            Внимание {counts.warnings > 0 && <span className="logs-filter-badge">{counts.warnings}</span>}
          </button>
          <button
            className={`logs-filter-btn ${activeFilter === 'success' ? 'active' : ''}`}
            onClick={() => setActiveFilter('success')}
            disabled={counts.success === 0}
          >
            Успех {counts.success > 0 && <span className="logs-filter-badge">{counts.success}</span>}
          </button>
        </div>

        <div className="logs-view-search">
          <input
            type="text"
            className="logs-search-input"
            placeholder="Поиск по логам..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="logs-search-clear"
              onClick={() => setSearchQuery('')}
              title="Очистить поиск"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Содержимое логов */}
      <div className="logs-view-content" ref={containerWrapperRef}>
        {filteredLogs.length === 0 ? (
          <div className="logs-view-empty">
            {logs.length === 0 ? (
              <>
                <div className="logs-view-empty-icon">—</div>
                <div className="logs-view-empty-title">Пока нет логов</div>
                <div className="logs-view-empty-subtitle">
                  Импортируйте файл, чтобы увидеть логи обработки
                </div>
              </>
            ) : (
              <>
                <div className="logs-view-empty-icon">—</div>
                <div className="logs-view-empty-title">Ничего не найдено</div>
                <div className="logs-view-empty-subtitle">
                  Попробуйте изменить фильтр или поисковый запрос
                </div>
              </>
            )}
          </div>
        ) : useVirtualScroll ? (
          /* Виртуальный скролл для больших списков */
          <VirtualList
            items={filteredLogs}
            itemHeight={LOG_ITEM_HEIGHT}
            containerHeight={containerHeight}
            renderItem={renderLogItem}
            overscan={10}
            className="logs-view-virtual"
            autoScrollToBottom={true}
          />
        ) : (
          /* Обычный рендер для небольших списков */
          <div className="logs-view-entries" ref={logsContainerRef}>
            {filteredLogs.map((log, index) => (
              <div 
                key={index} 
                className={`logs-view-entry ${getLogClass(log)}`}
              >
                {log}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Футер со статистикой */}
      {logs.length > 0 && (
        <div className="logs-view-footer">
          <div className="logs-view-stats">
            <span className="logs-view-stat">
              Всего: {logs.length}
            </span>
            {counts.errors > 0 && (
              <span className="logs-view-stat error">
                Ошибок: {counts.errors}
              </span>
            )}
            {counts.warnings > 0 && (
              <span className="logs-view-stat warning">
                Внимание: {counts.warnings}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

LogsView.displayName = 'LogsView';
