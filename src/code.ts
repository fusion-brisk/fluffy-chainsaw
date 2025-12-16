import { Logger } from './logger';
import { SNIPPET_CONTAINER_NAMES, TEXT_FIELD_NAMES, PLUGIN_VERSION } from './config';
import { 
  handleBrandLogic, 
  handleEPriceGroup, 
  handleELabelGroup, 
  handleEPriceBarometer, 
  handleEMarketCheckoutLabel, 
  handleOfficialShop, 
  handleEDeliveryGroup, 
  handleLabelDiscountView, 
  handleMarketCheckoutButton, 
  handleEOfferItem, 
  handleEButton,
  handleShopInfoUgcAndEReviewsShopText,
  handleShopInfoBnpl,
  handleShopInfoDeliveryBnplContainer,
  handleESnippetOrganicTextFallback,
  handleESnippetOrganicHostFromFavicon
} from './component-handlers';
import { ImageProcessor } from './image-handlers';
import { loadFonts, processTextLayers } from './text-handlers';
import { LayerDataItem } from './types';
import { ParsingRulesManager } from './parsing-rules-manager';
import { safeGetLayerName, safeGetLayerType } from './utils/node-search';
import { findSnippetContainers, sortContainersByPosition, normalizeContainerName, findContainerForLayers, getContainerName } from './utils/container-search';

// Ключ для хранения последней просмотренной версии
const WHATS_NEW_STORAGE_KEY = 'contentify_whats_new_seen_version';

console.log('🚀 Плагин EProductSnippet загружен');

// Глобальные экземпляры
const imageProcessor = new ImageProcessor();
const rulesManager = new ParsingRulesManager();

// Инициализация плагина
(async function initPlugin() {
  try {
    figma.showUI(__html__, { width: 320, height: 600 });
    
    // Отправляем начальное состояние выделения
    figma.ui.postMessage({ 
      type: 'selection-status', 
      hasSelection: figma.currentPage.selection.length > 0 
    });
    
    // Загружаем правила парсинга
    await rulesManager.loadRules();
    Logger.info('✅ Правила парсинга загружены');
    
    // Проверяем обновления в фоне (не блокируя старт)
    checkRulesUpdates().catch(function(err) {
      Logger.error('Ошибка проверки обновлений правил:', err);
    });
    
  } catch (error) {
    Logger.error('❌ Ошибка при инициализации плагина:', error);
    figma.notify('❌ Ошибка загрузки плагина');
  }
})();

// Проверка обновлений правил парсинга
async function checkRulesUpdates() {
  var updateInfo = await rulesManager.checkForUpdates();
  
  if (updateInfo && updateInfo.hasUpdate && updateInfo.newRules) {
    Logger.info('📢 Доступно обновление правил парсинга');
    
    figma.ui.postMessage({
      type: 'rules-update-available',
      newVersion: updateInfo.newRules.version,
      currentVersion: rulesManager.getCurrentRules().version,
      hash: updateInfo.hash || ''
    });
  }
}

// Обработка изменений выделения
figma.on('selectionchange', () => {
  const hasSelection = figma.currentPage.selection.length > 0;
  figma.ui.postMessage({ type: 'selection-status', hasSelection: hasSelection });
});


figma.ui.onmessage = async (msg) => {
  // Глобальный перехват ошибок
  try {
    Logger.info('📨 Получено сообщение от UI:', msg.type);
  
  if (msg.type === 'test') {
      Logger.info('✅ Получено тестовое сообщение:', msg.message);
      figma.ui.postMessage({ type: 'log', message: 'Плагин работает!' });
    return;
  }
  
  if (msg.type === 'get-theme') {
    // Theme detection handled by UI via prefers-color-scheme
    // This handler exists for compatibility but doesn't return theme data
    return;
  }
  
  if (msg.type === 'close') {
      Logger.info('🚪 Закрытие плагина');
    figma.closePlugin();
    return;
  }
  
  if (msg.type === 'get-pages') {
      Logger.info('📄 Запрос списка страниц от UI');
    const pages = figma.root.children.map(page => page.name);
      figma.ui.postMessage({ type: 'pages', pages: pages });
    return;
  }
  
  // Обработчик запроса состояния выделения (вызывается UI при монтировании)
  if (msg.type === 'check-selection') {
    var hasSelection = figma.currentPage.selection.length > 0;
    figma.ui.postMessage({ type: 'selection-status', hasSelection: hasSelection });
    return;
  }

    // --- SETTINGS HANDLERS ---
    if (msg.type === 'get-settings') {
      try {
        const scope = await figma.clientStorage.getAsync('contentify_scope');
    figma.ui.postMessage({
          type: 'settings-loaded', 
          settings: { scope: (scope === 'page' || scope === 'selection') ? scope : 'selection' } 
    });
      } catch (e) {
        Logger.error('Failed to load settings:', e);
        figma.ui.postMessage({ type: 'settings-loaded', settings: { scope: 'selection' } });
      }
    return;
  }

    if (msg.type === 'save-settings') {
      if (msg.settings && msg.settings.scope) {
        await figma.clientStorage.setAsync('contentify_scope', msg.settings.scope);
        Logger.debug('Settings saved:', msg.settings);
      }
      return;
    }

    if (msg.type === 'get-parsing-rules') {
      Logger.info('📋 Запрос правил парсинга от UI');
      var metadata = rulesManager.getCurrentMetadata();
      if (metadata) {
        figma.ui.postMessage({
          type: 'parsing-rules-loaded',
          metadata: metadata
        });
      }
      return;
    }

    if (msg.type === 'check-remote-rules-update') {
      Logger.info('🔄 Ручная проверка обновлений правил');
      checkRulesUpdates().catch(function(err) {
        Logger.error('Ошибка проверки обновлений:', err);
        figma.ui.postMessage({ type: 'error', message: 'Не удалось проверить обновления' });
      });
      return;
    }

    if (msg.type === 'apply-remote-rules') {
      Logger.info('✅ Применение удалённых правил');
      var success = await rulesManager.applyRemoteRules(msg.hash);
      
      if (success) {
        figma.notify('✅ Правила парсинга обновлены');
        var newMetadata = rulesManager.getCurrentMetadata();
        if (newMetadata) {
          figma.ui.postMessage({
            type: 'parsing-rules-loaded',
            metadata: newMetadata
          });
        }
      } else {
        figma.notify('❌ Не удалось применить правила');
      }
      return;
    }

    if (msg.type === 'dismiss-rules-update') {
      await rulesManager.dismissUpdate();
      Logger.info('❌ Обновление правил отклонено');
      return;
    }

    if (msg.type === 'reset-rules-cache') {
      Logger.info('🔄 Сброс кэша правил');
      var resetMetadata = await rulesManager.resetToDefaults();
      figma.notify('🔄 Правила сброшены к значениям по умолчанию');
      figma.ui.postMessage({
        type: 'parsing-rules-loaded',
        metadata: resetMetadata
      });
      return;
    }

    if (msg.type === 'get-remote-url') {
      var url = await rulesManager.getRemoteUrl();
      figma.ui.postMessage({
        type: 'remote-url-loaded',
        url: url || ''
      });
      return;
    }

    if (msg.type === 'set-remote-url') {
      await rulesManager.setRemoteUrl(msg.url);
      figma.notify('✅ Remote config URL обновлён');
      Logger.info('🔗 URL обновлён: ' + msg.url);
      
      // Автоматически проверяем обновления после установки URL
      if (msg.url && msg.url.trim()) {
        checkRulesUpdates().catch(function(err) {
          Logger.error('Ошибка проверки обновлений:', err);
        });
      }
      return;
    }

    // --- WHAT'S NEW HANDLERS ---
    if (msg.type === 'check-whats-new') {
      try {
        const seenVersion = await figma.clientStorage.getAsync(WHATS_NEW_STORAGE_KEY);
        const shouldShow = seenVersion !== PLUGIN_VERSION;
        
        Logger.debug(`What's New check: seen=${seenVersion}, current=${PLUGIN_VERSION}, shouldShow=${shouldShow}`);
        
        figma.ui.postMessage({
          type: 'whats-new-status',
          shouldShow: shouldShow,
          currentVersion: PLUGIN_VERSION
        });
      } catch (e) {
        Logger.error('Failed to check whats-new status:', e);
        figma.ui.postMessage({
          type: 'whats-new-status',
          shouldShow: false,
          currentVersion: PLUGIN_VERSION
        });
      }
      return;
    }

    if (msg.type === 'mark-whats-new-seen') {
      try {
        await figma.clientStorage.setAsync(WHATS_NEW_STORAGE_KEY, msg.version);
        Logger.debug(`What's New marked as seen for version ${msg.version}`);
      } catch (e) {
        Logger.error('Failed to save whats-new seen status:', e);
      }
      return;
    }
    // -------------------------

  // === RESET SNIPPETS ===
  if (msg.type === 'reset-snippets') {
    const scope = msg.scope || 'page';
    Logger.info(`🔄 Сброс сниппетов (${scope})`);
    
    try {
      const resetCount = await resetAllSnippets(scope);
      figma.ui.postMessage({ type: 'reset-done', count: resetCount });
      figma.notify(`✅ Сброшено ${resetCount} сниппетов`);
    } catch (e) {
      Logger.error('Reset error:', e);
      figma.ui.postMessage({ type: 'error', message: 'Ошибка при сбросе сниппетов' });
    }
    return;
  }
  
  if (msg.type === 'import-csv') {
    const startTime = Date.now();
    Logger.info('🔄 Начинаем оптимизированную обработку данных');
    
    const rows = msg.rows || [];
    const scope = msg.scope || 'page';
    const resetBeforeImport = msg.resetBeforeImport || false;
      // const filter = msg.filter || ''; 

    Logger.info(`📊 Получено ${rows.length} строк данных`);
    Logger.info(`📍 Область: ${scope}`);
    
    // Начальный прогресс (1%)
    figma.ui.postMessage({
      type: 'progress',
      current: 1,
      total: 100,
      message: `Подготовка к обработке ${rows.length} строк...`,
      operationType: 'searching'
    });
    
    // === Reset snippets before import if requested ===
    if (resetBeforeImport) {
      Logger.info('🔄 Сброс сниппетов перед импортом...');
      figma.ui.postMessage({
        type: 'progress',
        current: 1,
        total: 100,
        message: 'Сброс сниппетов...',
        operationType: 'resetting'
      });
      const resetCount = await resetAllSnippets(scope);
      Logger.info(`✅ Сброшено ${resetCount} сниппетов`);
    }
    
    // === Global fields (outside snippet containers) ===
    // Например: глобальный слой "#query" (строка запроса) обычно расположен вне сниппетов.
    await applyGlobalQuery(rows, scope);
    
    const logTiming = (stage: string) => {
      const elapsed = Date.now() - startTime;
      Logger.info(`⏱️ [${elapsed}ms] ${stage}`);
    };

      // 1. Определяем область поиска
    let searchNodes: readonly SceneNode[] = [];
    if (scope === 'selection') {
      searchNodes = figma.currentPage.selection;
      Logger.info(`🎯 Найдено ${searchNodes.length} выбранных элементов`);
      if (searchNodes.length === 0) {
        figma.notify('❌ Нет выбранных элементов');
        return;
      }
    } else {
      searchNodes = figma.currentPage.children;
      Logger.info(`🎯 Поиск по всей странице: ${searchNodes.length} элементов`);
    }
    
    // Прогресс после определения области (3%)
    figma.ui.postMessage({
      type: 'progress',
      current: 3,
      total: 100,
      message: `Область определена: ${searchNodes.length} элементов`,
      operationType: 'searching'
    });
    
      // 2. Собираем контейнеры и группируем данные (Оптимизированный Top-Down подход)
    // Начало этапа 1 (5%)
    figma.ui.postMessage({
      type: 'progress',
      current: 5,
      total: 100,
      message: 'Поиск контейнеров сниппетов...',
      operationType: 'searching'
    });
    
    const snippetGroups = new Map<string, SceneNode[]>();
    
    // Используем общие функции поиска и сортировки контейнеров
    const allContainers = findSnippetContainers(scope === 'page' ? 'page' : 'selection');
    
    Logger.info(`📦 Найдено ${allContainers.length} контейнеров-сниппетов`);
    
    // Промежуточный прогресс после поиска (12%)
    figma.ui.postMessage({
      type: 'progress',
      current: 12,
      total: 100,
      message: `Найдено ${allContainers.length} контейнеров, сортировка...`,
      operationType: 'searching'
    });
    
    // Сортировка контейнеров по визуальной позиции (Y→X)
    sortContainersByPosition(allContainers);
    
    Logger.debug(`🔢 Контейнеры отсортированы по позиции (Y→X)`);
    
    // Прогресс после сортировки (15%)
    figma.ui.postMessage({
      type: 'progress',
      current: 15,
      total: 100,
      message: `Анализ структуры контейнеров...`,
      operationType: 'searching'
    });
    
    // Набор ID всех контейнеров для проверки вложенности
    const containerIds = new Set(allContainers.map(c => c.id));
    
    // Контейнеры, которые должны обрабатываться даже без data-layers
    // (нужно для принудительного включения кнопок/вариантов при повторных прогонах)
    const ALWAYS_PROCESS_CONTAINERS = new Set(['EShopItem', 'EOfferItem']);
    
    // Отправляем прогресс во время группировки
    let containerIndex = 0;
    const totalContainers = allContainers.length;
    
    for (const container of allContainers) {
        containerIndex++;
        
        if (container.removed) {
          // Обновляем прогресс даже для пропущенных контейнеров (каждые 3 или 10%)
          if (containerIndex % 3 === 0 || containerIndex % Math.max(1, Math.floor(totalContainers / 10)) === 0) {
            const progress = 15 + Math.floor((containerIndex / totalContainers) * 25);
            figma.ui.postMessage({
              type: 'progress',
              current: Math.min(40, progress),
              total: 100,
              message: `Анализ контейнеров: ${containerIndex}/${totalContainers}`,
              operationType: 'grouping'
            });
          }
          continue;
        }
        
        // Ищем слои данных внутри контейнера
        // Поддерживаем два формата:
        // 1. С префиксом "#" (например "#OrganicTitle")
        // 2. Формат ESnippet: "Block / Snippet-staff / OrganicTitle"
        let dataLayers: SceneNode[] = [];
        
        // Список полей данных для поиска (без # префикса)
        const DATA_FIELD_PATTERNS = [
          'OrganicTitle', 'OrganicText', 'OrganicHost', 'OrganicPath', 'OrganicImage',
          'OrganicPrice', 'OldPrice', 'ShopName', 'FaviconImage', 'ThumbImage',
          'discount', 'ProductRating', 'ReviewCount', 'ProductURL'
        ];
        
        if ('findAll' in container) {
           dataLayers = (container as SceneNode & ChildrenMixin).findAll((n: SceneNode) => {
             // Формат 1: начинается с #
             if (n.name.startsWith('#')) return true;
             
             // Формат 2: содержит известные поля данных (для ESnippet)
             for (const pattern of DATA_FIELD_PATTERNS) {
               if (n.name.includes(pattern)) return true;
             }
             
             return false;
           });
        }
        
        // Если data layers не найдено — обычно пропускаем контейнер.
        // Но для EShopItem/EOfferItem всё равно включаем контейнер в обработку,
        // чтобы принудительно выставлять BUTTON/view (частый кейс: повторные прогоны).
        if (dataLayers.length === 0) {
          if (ALWAYS_PROCESS_CONTAINERS.has(container.name)) {
            snippetGroups.set(container.id, []);
          }
          continue;
        }
        
        // Фильтрация: берем только те слои, для которых этот контейнер является БЛИЖАЙШИМ из списка allContainers
        const validLayers: SceneNode[] = [];
        
        for (const layer of dataLayers) {
           let isDirectChild = true;
           let currentParent = layer.parent;
           
           // Поднимаемся вверх от слоя к текущему контейнеру
           while (currentParent && currentParent.id !== container.id) {
              // Если по пути встретили ДРУГОЙ известный контейнер, значит слой принадлежит ему (вложенность)
              if (containerIds.has(currentParent.id) && SNIPPET_CONTAINER_NAMES.includes(currentParent.name)) {
                 isDirectChild = false;
                 break;
              }
              currentParent = currentParent.parent;
           }
           
           if (isDirectChild) {
              validLayers.push(layer);
           }
        }
        
        if (validLayers.length > 0) {
           snippetGroups.set(container.id, validLayers);
        } else {
          // Аналогично: если слойные поля отфильтровались (вложенность), но это контейнер,
          // который должен "сам себя" обрабатывать — добавляем пустую группу.
          if (ALWAYS_PROCESS_CONTAINERS.has(container.name)) {
            snippetGroups.set(container.id, []);
          }
        }
        
        // Обновляем прогресс каждые 3 контейнера или каждые 10%
        if (containerIndex % 3 === 0 || containerIndex % Math.max(1, Math.floor(totalContainers / 10)) === 0) {
          const progress = 15 + Math.floor((containerIndex / totalContainers) * 25); // 15-40%
          figma.ui.postMessage({
            type: 'progress',
            current: Math.min(40, progress),
            total: 100,
            message: `Группировка сниппетов: ${containerIndex}/${totalContainers}`,
            operationType: 'grouping'
          });
        }
    }

    Logger.info(`📊 Создано ${snippetGroups.size} групп сниппетов`);
    logTiming('Группировка сниппетов завершена (Top-Down)');
    
    // Отправляем прогресс: этап 2 завершен (40%)
    figma.ui.postMessage({
      type: 'progress',
      current: 40,
      total: 100,
      message: `Создано ${snippetGroups.size} групп сниппетов`,
      operationType: 'grouping'
    });

      // 4. Создаем layerData (назначаем строки)
    const normalizeFieldName = (name: string): string => name ? String(name).trim().toLowerCase() : '';
    
    // Извлекаем имя поля данных из имени слоя
    // Поддерживает:
    // 1. "#OrganicTitle" → "#OrganicTitle"
    // 2. "Block / Snippet-staff / OrganicTitle" → "#OrganicTitle"
    // 3. "#OrganicImage" → "#OrganicImage"
    const DATA_FIELD_NAMES_SET = new Set([
      'organictitle', 'organictext', 'organichost', 'organicpath', 'organicimage',
      'organicprice', 'oldprice', 'shopname', 'faviconimage', 'thumbimage',
      'discount', 'productrating', 'reviewcount', 'producturl'
    ]);
    
    const extractDataFieldName = (layerName: string): string => {
      // Если уже с #, возвращаем как есть
      if (layerName.startsWith('#')) return layerName;
      
      // Ищем известные поля в имени слоя
      const lowerName = layerName.toLowerCase();
      for (const field of DATA_FIELD_NAMES_SET) {
        if (lowerName.includes(field)) {
          // Возвращаем с # префиксом для соответствия данным
          return '#' + field.charAt(0).toUpperCase() + field.slice(1);
        }
      }
      
      return layerName;
    };
    const layerData: LayerDataItem[] = [];
    let nextRowIndex = 0;
    
      const finalContainerMap = snippetGroups;

    // --- Типо-осознанное сопоставление строк и контейнеров ---
    // Жёстко выдаём строки в порядке приоритета типов, чтобы checkout не утекал в Organic.
    // --- Строгое сопоставление строк и контейнеров по типу ---
    const buckets = new Map<string, { rows: { [key: string]: string }[]; index: number }>();
    for (const row of rows) {
      const typeKey = ((row && row['#SnippetType']) || 'default').trim();
      if (!buckets.has(typeKey)) {
        buckets.set(typeKey, { rows: [], index: 0 });
      }
      buckets.get(typeKey)!.rows.push(row);
    }

    const takeNext = (type: string): { [key: string]: string } | null => {
      const b = buckets.get(type);
      if (!b || b.rows.length === 0) return null;
      const idx = b.index % b.rows.length;
      b.index++;
      return b.rows[idx];
    };

    const typeOrder = [
      'EOfferItem',
      'EShopItem',
      'EProductSnippet2',
      'EProductSnippet',
      'ProductTile-Item',
      'Organic_withOfferInfo',
      'Organic',
      'ESnippet',
      'Snippet'
    ];

    // Контейнер → допустимые типы строк с приоритетами
    // Универсальный маппинг: любой контейнер может получить данные из любого типа с приоритетом своего
    const allowedTypesMap: { [key: string]: string[] } = {
      EOfferItem: ['EOfferItem', 'EShopItem', 'EProductSnippet2', 'EProductSnippet'],
      EShopItem: ['EShopItem', 'EOfferItem', 'EProductSnippet2', 'EProductSnippet'],
      // Product snippets — допускаем взаимный fallback между EProductSnippet2, EProductSnippet и плиткой
      EProductSnippet2: ['EProductSnippet2', 'EProductSnippet', 'ProductTile-Item', 'EShopItem'],
      EProductSnippet: ['EProductSnippet', 'EProductSnippet2', 'ProductTile-Item', 'EShopItem'],
      'ProductTile-Item': ['ProductTile-Item', 'EProductSnippet2', 'EProductSnippet', 'EShopItem'],
      Organic_withOfferInfo: ['Organic_withOfferInfo', 'Organic', 'EShopItem', 'EProductSnippet2'],
      Organic: ['Organic', 'Organic_withOfferInfo', 'EShopItem', 'EProductSnippet2'],
      // ESnippet/Snippet — универсальные контейнеры, берут любые данные
      ESnippet: ['Organic_withOfferInfo', 'Organic', 'EShopItem', 'EProductSnippet2', 'EOfferItem'],
      Snippet: ['Organic_withOfferInfo', 'Organic', 'EShopItem', 'EProductSnippet2', 'EOfferItem']
    };

    // Собираем контейнеры по типу (по нормализованному имени)
    const containersByType = new Map<string, string[]>();
    for (const [containerKey, layers] of finalContainerMap) {
      const container = findContainerForLayers(layers, containerKey);
      const name = getContainerName(container);
      const norm = normalizeContainerName(name || '');
      const key = norm || 'unknown';
      if (!containersByType.has(key)) containersByType.set(key, []);
      containersByType.get(key)!.push(containerKey);
    }

    // Распределяем строки строго по разрешённым типам
      const containerRowAssignments = new Map<string, { row: { [key: string]: string }; rowIndex: number }>();
    let globalRowIdx = 0;

    for (const t of typeOrder) {
      const keys = containersByType.get(t);
      if (!keys || keys.length === 0) continue;
      const allowedTypes = allowedTypesMap[t] || [t];
      for (const ck of keys) {
        let chosen: { [key: string]: string } | null = null;
        for (const at of allowedTypes) {
          chosen = takeNext(at);
          if (chosen) break;
        }
        if (!chosen) {
          // Для ESnippet/Snippet, если нет подходящих строк, всё равно назначим stub, чтобы скрыть кнопку
          if (t === 'ESnippet' || t === 'Snippet') {
            chosen = {
              '#SnippetType': 'Organic',
              '#BUTTON': 'false',
              '#EButton_visible': 'false',
              '#ButtonView': ''
            };
          } else {
            continue; // нет подходящих строк — пропускаем контейнер на этом шаге
          }
        }
        containerRowAssignments.set(ck, { row: chosen, rowIndex: globalRowIdx });
        globalRowIdx++;
      }
    }

    // Ограниченный fallback: если контейнеры типов, отличных от Organic/ESnippet, остались без строки — выдаём любую доступную
    const remainingKeys = Array.from(finalContainerMap.keys()).filter(k => !containerRowAssignments.has(k));
    const nonOrganicTypes = new Set([
      'EOfferItem',
      'EShopItem',
      'EProductSnippet2',
      'EProductSnippet',
      'ProductTile-Item'
    ]);
    for (const ck of remainingKeys) {
      const layers = finalContainerMap.get(ck) || [];
      const containerNode = findContainerForLayers(layers, ck);
      const name = getContainerName(containerNode);
      const norm = normalizeContainerName(name || '');
      if (!nonOrganicTypes.has(norm)) {
        continue; // не назначаем fallback для Organic/ESnippet/Snippet
      }
      let fallbackRow: { [key: string]: string } | null = null;
      // Пробуем сначала из разрешённых типов
      const allowed = allowedTypesMap[norm] || [];
      for (const at of allowed) {
        fallbackRow = takeNext(at);
        if (fallbackRow) break;
      }
      // Затем из любых имеющихся rows
      if (!fallbackRow && rows.length) {
        fallbackRow = rows[globalRowIdx % rows.length];
        globalRowIdx++;
      }
      if (fallbackRow) {
        containerRowAssignments.set(ck, { row: fallbackRow, rowIndex: globalRowIdx });
        globalRowIdx++;
      }
    }

    // --- Создание layerData с уже назначенными строками ---
    for (const [containerKey, layers] of finalContainerMap) {
        const validLayers = layers.filter(layer => !layer.removed);
        if (validLayers.length === 0) {
          continue;
        }

        const assignment = containerRowAssignments.get(containerKey);
        if (!assignment) continue;

        const rowIndex = assignment.rowIndex;
        const row = assignment.row;
      
      const rowKeyMap: { [key: string]: string } = {};
      try {
        for (const key in row) {
          if (Object.prototype.hasOwnProperty.call(row, key)) {
            rowKeyMap[normalizeFieldName(key)] = row[key];
          }
        }
        } catch (e) { /* ignore */ }

        const processedFieldNames = new Set<string>();
        
        for (const layer of validLayers) {
            const rawLayerName = safeGetLayerName(layer);
            if (!rawLayerName) continue;
            
            // Извлекаем имя поля данных (с поддержкой ESnippet формата)
            const fieldName = extractDataFieldName(rawLayerName);
            
            if (processedFieldNames.has(fieldName)) continue;
            processedFieldNames.add(fieldName);
            
            const normName = normalizeFieldName(fieldName);
            const direct = row[fieldName];
            const fallback = rowKeyMap[normName];
            const fieldValue = (direct !== undefined && direct !== null ? direct : fallback);
            
          if (fieldValue === undefined || fieldValue === null || (typeof fieldValue === 'string' && fieldValue.trim() === '')) {
              continue;
            }
            
            const layerType = safeGetLayerType(layer);
          if (!layerType) continue;
          
          let isTextLayer = layerType === 'TEXT';
          const isImageLayer = normalizeFieldName(fieldName).endsWith('image');
          const isShapeLayer = ['RECTANGLE', 'ELLIPSE', 'POLYGON'].includes(layerType);
          
          if (layerType === 'INSTANCE') {
            if (TEXT_FIELD_NAMES.includes(normalizeFieldName(fieldName))) {
              isTextLayer = true;
            }
          }
          
            layerData.push({
              layer,
              rowIndex,
              fieldName,
              fieldValue,
              isImage: isImageLayer,
              isText: isTextLayer,
              isShape: isShapeLayer,
            row
          });
        }
        
        // Инкрементируем счётчик обработанных контейнеров
        nextRowIndex++;
      }
      
      Logger.info(`📊 Создано ${layerData.length} элементов layerData, обработано ${nextRowIndex} контейнеров`);
      
      const filteredLayers = layerData.filter(item => !item.layer.removed && !item.layer.locked && item.layer.visible);
      
      // 5. Обработка компонентной логики
      const containersToProcess = new Map<string, { row: { [key: string]: string } | null; container: BaseNode | null; }>();
    for (const [containerKey, layers] of finalContainerMap) {
      const container = findContainerForLayers(layers, containerKey);
      if (!container) continue;
      
      const assignment = containerRowAssignments.get(containerKey);
      let assignedRow = assignment ? assignment.row : null;
      
      // Кнопки в EShopItem/EOfferItem должны быть всегда доступны.
      // Если строка не назначена (или назначена не того типа), всё равно запускаем обработчики с stub-строкой,
      // чтобы восстановить видимость и дефолтный view при повторных прогонах.
      const containerName = getContainerName(container);
      if (!assignedRow && (containerName === 'EShopItem' || containerName === 'EOfferItem')) {
        assignedRow = {
          '#SnippetType': containerName,
          '#BUTTON': 'true',
          '#ButtonView': containerName === 'EShopItem' ? 'secondary' : 'white',
          '#ButtonType': 'shop'
        };
      }
        containersToProcess.set(containerKey, { row: assignedRow, container });
      }
      
      Logger.debug(`🔄 Обработка компонентной логики для ${containersToProcess.size} контейнеров...`);
      const componentPromises: Promise<void>[] = [];
      var processingIndex = 0;
      const totalToProcess = containersToProcess.size;
      
      // Начальный прогресс компонентной логики (40%)
      figma.ui.postMessage({
        type: 'progress',
        current: 40,
        total: 100,
        message: `Компонентная логика: 0/${totalToProcess}`,
        operationType: 'components'
      });
      
      for (const [containerKey, data] of containersToProcess) {
        if (!data.container || !data.row) continue;
        const context = { container: data.container, containerKey, row: data.row };
        
        // Детальное логирование для отладки Fintech
        var containerName = data.container && 'name' in data.container ? data.container.name : 'N/A';
        var shopName = data.row['#ShopName'] || 'N/A';
        var price = data.row['#OrganicPrice'] || 'N/A';
        var fintechEnabled = data.row['#EPriceGroup_Fintech'] || 'false';
        var fintechType = data.row['#Fintech_Type'] || 'N/A';
        var priceView = data.row['#EPrice_View'] || 'N/A';
        Logger.info(`📍 [${processingIndex}] ${containerName}: Shop="${shopName}", Price="${price}", Fintech=${fintechEnabled} (${fintechType}), EPrice_View=${priceView}`);
        processingIndex++;
        
        // Обновляем прогресс каждые 2 контейнера или каждые 10%
        if (processingIndex % 2 === 0 || processingIndex % Math.max(1, Math.floor(totalToProcess / 10)) === 0) {
          const progress = 40 + Math.floor((processingIndex / totalToProcess) * 20); // 40-60%
          figma.ui.postMessage({
            type: 'progress',
            current: Math.min(60, progress),
            total: 100,
            message: `Компонентная логика: ${processingIndex}/${totalToProcess}`,
            operationType: 'components'
          });
        }
        
        try {
          // === Синхронные обработчики (быстрые) ===
          handleBrandLogic(context);
          handleEPriceBarometer(context);
          handleEMarketCheckoutLabel(context);
          handleOfficialShop(context);
          handleMarketCheckoutButton(context); // Кнопка "Купить в 1 клик" — BUTTON variant
          handleEButton(context); // EButton — view и visible для кнопки внутри сниппета
          handleEOfferItem(context); // EOfferItem — модификаторы карточки предложения
          handleShopInfoBnpl(context); // BNPL иконки
          handleShopInfoDeliveryBnplContainer(context); // Контейнер доставки/BNPL
          
          // === Async обработчики: запускаем независимые параллельно ===
          // handleEPriceGroup должен быть первым (от него может зависеть LabelDiscount)
          await handleEPriceGroup(context);
          
          // Эти обработчики независимы друг от друга — запускаем параллельно
          await Promise.all([
            handleLabelDiscountView(context),
            handleShopInfoUgcAndEReviewsShopText(context),
            handleESnippetOrganicTextFallback(context),
            handleESnippetOrganicHostFromFavicon(context)
          ]);
          
          // Эти добавляем в общий пул для ожидания в конце
          componentPromises.push(handleELabelGroup(context).catch(e => Logger.error(`Error in handleELabelGroup:`, e)));
          componentPromises.push(handleEDeliveryGroup(context).catch(e => Logger.error(`Error in handleEDeliveryGroup:`, e)));
        } catch (e) {
          Logger.error(`Error in component handlers:`, e);
        }
      }
      await Promise.all(componentPromises);
      Logger.debug(`✅ Компонентная логика обработана`);
      
      // Отправляем прогресс: этап 3 (40-60%)
      figma.ui.postMessage({
        type: 'progress',
        current: 60,
        total: 100,
        message: `Обработана компонентная логика`,
        operationType: 'components'
      });

      // 6. Обработка текста
      const textLayers = filteredLayers.filter(item => {
        if (!item.isText) return false;
        
        // Проверяем, действительно ли текст изменится
        try {
           if (item.layer.type === 'TEXT' && item.fieldValue) {
              // Если текст совпадает, пропускаем загрузку шрифта и обработку
              if ((item.layer as TextNode).characters === item.fieldValue) {
                 return false;
              }
           }
        } catch (e) {
           // Если ошибка доступа к свойству, оставляем слой для обработки
           return true;
        }
        
        return true;
      });
      
      if (textLayers.length > 0) {
        // Прогресс: начало загрузки шрифтов (62%)
        figma.ui.postMessage({
          type: 'progress',
          current: 62,
          total: 100,
          message: `Загрузка шрифтов для ${textLayers.length} слоев...`,
          operationType: 'text'
        });
        
        Logger.info(`🔤 Загрузка шрифтов для ${textLayers.length} текстовых слоев`);
        await loadFonts(textLayers);
        
        // Прогресс: шрифты загружены, начинаем обработку текста (66%)
        figma.ui.postMessage({
          type: 'progress',
          current: 66,
          total: 100,
          message: `Шрифты загружены, обработка текста...`,
          operationType: 'text'
        });
        
        processTextLayers(textLayers);
        
        // Отправляем прогресс: этап 4 завершен (70%)
        figma.ui.postMessage({
          type: 'progress',
          current: 70,
          total: 100,
          message: `Обработано ${textLayers.length} текстовых слоев`,
          operationType: 'text'
        });
      } else {
        Logger.info('🔤 Нет текстовых слоев для обновления');
        // Все равно отправляем прогресс
        figma.ui.postMessage({
          type: 'progress',
          current: 70,
          total: 100,
          message: `Пропущена обработка текста (нет изменений)`,
          operationType: 'text'
        });
      }

      // 7. Обработка изображений
      const imageLayers = filteredLayers.filter(item => item.isImage);
    if (imageLayers.length > 0) {
        // Сбрасываем статистику для нового прогона, но кэш остается
        imageProcessor.resetForNewImport();
        
        // Отправляем прогресс: этап 5 начинается (75%)
        figma.ui.postMessage({
          type: 'progress',
          current: 75,
          total: 100,
          message: `Начинаем обработку ${imageLayers.length} изображений...`,
          operationType: 'images-start'
        });
        
        imageProcessor.onUpdateTextLayer = (rowIndex, fieldName, value) => {
          const targets = filteredLayers.filter(l => 
            l.rowIndex === rowIndex && 
            l.isText && 
            (l.fieldName === fieldName || l.fieldName.toLowerCase().includes(fieldName.toLowerCase().replace('#', '')))
          );
          
          for (const target of targets) {
            try {
              if (target.layer.removed) continue;
              if (target.layer.type === 'TEXT') {
                (target.layer as TextNode).characters = value;
              } else if (target.layer.type === 'INSTANCE') {
                const instance = target.layer as InstanceNode;
                if ('children' in instance) {
                          for (const child of instance.children) {
                    if (child.type === 'TEXT' && !child.removed && (child.name === target.fieldName || child.name.toLowerCase().includes(fieldName.toLowerCase().replace('#', '')))) {
                      (child as TextNode).characters = value;
                            }
                          }
                        }
                      }
                    } catch (e) {
              // ignore
            }
          }
        };
        
        await imageProcessor.processPool(imageLayers);
        
      figma.ui.postMessage({
          type: 'stats',
          stats: {
            processedInstances: nextRowIndex,
            totalInstances: finalContainerMap.size,
            successfulImages: imageProcessor.successfulImages,
            skippedImages: imageLayers.length - imageProcessor.successfulImages - imageProcessor.failedImages,
            failedImages: imageProcessor.failedImages,
            errors: imageProcessor.errors
          }
        });
      } else {
        // Отправляем пустую статистику если нет изображений
        figma.ui.postMessage({
          type: 'stats',
          stats: {
            processedInstances: nextRowIndex,
            totalInstances: finalContainerMap.size,
            successfulImages: 0,
            skippedImages: 0,
            failedImages: 0,
            errors: []
          }
        });
      }
      
    const totalTime = Date.now() - startTime;
      Logger.info(`🎉 Готово! Обработано ${nextRowIndex} элементов за ${(totalTime / 1000).toFixed(2)}s`);
    
    figma.ui.postMessage({
      type: 'done',
        count: nextRowIndex
      });
    }
  } catch (err) {
    Logger.error('CRITICAL PLUGIN ERROR:', err);
    figma.notify('❌ Критическая ошибка плагина. Проверьте консоль.');
    figma.ui.postMessage({
      type: 'error', 
      message: `Critical error: ${err instanceof Error ? err.message : String(err)}` 
    });
  }
};

// ==========================
// Global helpers
// ==========================

// Сбрасывает все сниппеты (instances) в области к дефолтному состоянию.
// Использует Figma API resetOverrides() для возврата к master component.
async function resetAllSnippets(scope: string): Promise<number> {
  let resetCount = 0;
  
  // Используем общую функцию поиска контейнеров
  const containers = findSnippetContainers(scope === 'page' ? 'page' : 'selection');
  
  Logger.info(`🔍 Найдено ${containers.length} сниппетов для сброса`);
  
  // Сбрасываем каждый instance
  for (let i = 0; i < containers.length; i++) {
    const container = containers[i];
    
    // Отправляем прогресс каждые 10 сниппетов
    if (i % 10 === 0) {
      figma.ui.postMessage({
        type: 'progress',
        current: Math.round((i / containers.length) * 100),
        total: 100,
        message: `Сброс сниппетов... ${i}/${containers.length}`,
        operationType: 'resetting'
      });
    }
    
    try {
      if (container.type === 'INSTANCE' && !container.removed) {
        // Сбрасываем все overrides на instance
        (container as InstanceNode).resetOverrides();
        resetCount++;
        Logger.debug(`  ↩️ Сброшен: ${container.name}`);
      } else if ('children' in container) {
        // Если это не instance, но имеет children — ищем вложенные instances
        const instances = (container as SceneNode & ChildrenMixin).findAll(n => n.type === 'INSTANCE');
        for (const inst of instances) {
          if (!inst.removed && inst.type === 'INSTANCE') {
            (inst as InstanceNode).resetOverrides();
            resetCount++;
          }
        }
      }
    } catch (e) {
      Logger.error(`Ошибка сброса ${container.name}:`, e);
    }
  }
  
  Logger.info(`✅ Сброшено ${resetCount} инстансов`);
  return resetCount;
}

// Применяет глобальный поисковый запрос к текстовым слоям "#query" вне сниппетов.
// Берём значение из первой строки данных (rows[0]['#query']) — оно одинаковое для всех.
async function applyGlobalQuery(rows: Array<{ [key: string]: string }>, scope: string): Promise<void> {
  try {
    if (!rows || !rows.length) return;
    const first = rows[0] || {};
    const raw = first['#query'] || first['#Query'] || '';
    const value = raw ? String(raw).trim() : '';
    if (!value) return;
    
    const targets: SceneNode[] = [];
    
    // Поиск в зависимости от scope:
    // - page: по всей странице
    // - selection: внутри выделения (и сами выбранные ноды)
    if (scope === 'page') {
      if (figma.currentPage.findAll) {
        targets.push(...figma.currentPage.findAll(n => n.name === '#query'));
      }
    } else {
      const selection = figma.currentPage.selection || [];
      for (const node of selection) {
        if (node.removed) continue;
        if (node.name === '#query') targets.push(node);
        if ('findAll' in node) {
          try {
            const found = (node as SceneNode & ChildrenMixin).findAll((n: SceneNode) => n.name === '#query');
            if (found && found.length) targets.push(...found);
          } catch (e) {
            // ignore
          }
        }
      }
    }
    
    // Если прямых совпадений нет, но пользователь положил текст внутрь группы/фрейма "#query",
    // попробуем найти внутри таких контейнеров первый текстовый слой.
    const expandedTargets: SceneNode[] = [];
    for (const t of targets) expandedTargets.push(t);
    if (!expandedTargets.length) {
      // Нечего менять
      Logger.info('🔎 [Global] Слой "#query" не найден в текущем scope');
      figma.ui.postMessage({ type: 'log', message: '🔎 Не найден слой "#query" в макете' });
      return;
    }
    
    let applied = 0;
    for (const node of expandedTargets) {
      if (node.removed) continue;
      
      // 1) Прямой TEXT
      if (node.type === 'TEXT') {
        const textNode = node as TextNode;
        await safeSetText(textNode, value);
        applied += 1;
        continue;
      }
      
      // 2) Если это не TEXT, ищем TEXT внутри
      if ('findAll' in node) {
        try {
          const innerTexts = (node as SceneNode & ChildrenMixin).findAll((n: SceneNode) => n.type === 'TEXT') as SceneNode[];
          if (innerTexts && innerTexts.length) {
            const firstText = innerTexts[0] as TextNode;
            await safeSetText(firstText, value);
            applied += 1;
          }
        } catch (e) {
          // ignore
        }
      }
    }
    
    Logger.info(`✅ [Global] "#query" применён: ${applied} слоёв`);
    figma.ui.postMessage({ type: 'log', message: `✅ Запрос применён к "#query" (${applied})` });
  } catch (e) {
    Logger.error('❌ [Global] Ошибка применения #query:', e);
    figma.ui.postMessage({ type: 'log', message: '❌ Ошибка применения "#query" (см. консоль)' });
  }
}

async function safeSetText(textNode: TextNode, value: string): Promise<void> {
  try {
    if (textNode.removed) return;
    const fontName = textNode.fontName;
    if (fontName !== figma.mixed && fontName && typeof fontName === 'object') {
      await figma.loadFontAsync(fontName as FontName);
    } else if (fontName === figma.mixed) {
      // Берём шрифт первого символа как базовый (аналогично loadFonts)
      try {
        const len = (textNode.characters || '').length;
        if (len > 0) {
          const first = textNode.getRangeFontName(0, 1);
          if (first !== figma.mixed && first && typeof first === 'object') {
            await figma.loadFontAsync(first as FontName);
          }
        }
      } catch (e) {
        // ignore
      }
    }
    textNode.characters = value;
  } catch (e) {
    Logger.error('❌ [Global] Ошибка установки текста для "#query":', e);
  }
}
