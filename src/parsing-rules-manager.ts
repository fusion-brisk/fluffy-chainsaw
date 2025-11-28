// Parsing Rules Manager - управление загрузкой и кэшированием правил парсинга
import { ParsingRulesData, ParsingRulesMetadata } from './types';
import { DEFAULT_PARSING_RULES, ParsingSchema } from './parsing-rules';
import { Logger } from './logger';

const STORAGE_KEYS = {
  RULES_CACHE: 'contentify_parsing_rules_cache',
  RULES_METADATA: 'contentify_parsing_rules_metadata',
  REMOTE_URL: 'contentify_remote_config_url',
  PENDING_RULES: 'contentify_pending_rules' // Для правил, ожидающих подтверждения
};

// Дефолтный URL для удалённого конфига (можно изменить в настройках)
const DEFAULT_REMOTE_URL = 'https://raw.githubusercontent.com/yourusername/contentify-config/main/parsing-rules.json';

/**
 * Вычисляет простой hash строки (для сравнения версий)
 */
function simpleHash(str: string): string {
  var hash = 0;
  if (str.length === 0) return String(hash);
  for (var i = 0; i < str.length; i++) {
    var char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return String(hash);
}

/**
 * Мягкое слияние правил (remote overrides default, но сохраняет отсутствующие поля)
 */
function mergeRules(baseRules: ParsingSchema, remoteRules: Partial<ParsingSchema>): ParsingSchema {
  var merged: ParsingSchema = {
    version: remoteRules.version || baseRules.version,
    rules: {}
  };
  
  // Копируем все базовые правила
  for (var key in baseRules.rules) {
    if (Object.prototype.hasOwnProperty.call(baseRules.rules, key)) {
      merged.rules[key] = baseRules.rules[key];
    }
  }
  
  // Накладываем удалённые правила (override + новые поля)
  if (remoteRules.rules) {
    for (var remoteKey in remoteRules.rules) {
      if (Object.prototype.hasOwnProperty.call(remoteRules.rules, remoteKey)) {
        var remoteRule = remoteRules.rules[remoteKey];
        var baseRule = merged.rules[remoteKey];
        
        if (baseRule) {
          // Merge существующего правила
          merged.rules[remoteKey] = {
            domSelectors: remoteRule.domSelectors || baseRule.domSelectors,
            jsonKeys: remoteRule.jsonKeys || baseRule.jsonKeys,
            type: remoteRule.type || baseRule.type,
            domAttribute: remoteRule.domAttribute || baseRule.domAttribute
          };
        } else {
          // Добавляем новое правило
          merged.rules[remoteKey] = remoteRule;
        }
      }
    }
  }
  
  return merged;
}

export class ParsingRulesManager {
  private currentMetadata: ParsingRulesMetadata | null = null;
  private pendingRemoteRules: ParsingSchema | null = null;
  
  /**
   * Загружает правила при старте плагина
   * Приоритет: Cached → Embedded
   */
  async loadRules(): Promise<ParsingRulesMetadata> {
    try {
      // Пробуем загрузить из кэша
      var cachedRulesStr = await figma.clientStorage.getAsync(STORAGE_KEYS.RULES_CACHE);
      var cachedMetadataStr = await figma.clientStorage.getAsync(STORAGE_KEYS.RULES_METADATA);
      
      if (cachedRulesStr && cachedMetadataStr) {
        try {
          var cachedRules = JSON.parse(cachedRulesStr) as ParsingSchema;
          var cachedMetadata = JSON.parse(cachedMetadataStr);
          
          Logger.info('📦 Загружены кэшированные правила парсинга');
          
          this.currentMetadata = {
            rules: cachedRules,
            source: 'cached',
            lastUpdated: cachedMetadata.lastUpdated || Date.now(),
            hash: cachedMetadata.hash,
            remoteUrl: cachedMetadata.remoteUrl
          };
          
          return this.currentMetadata;
        } catch (parseError) {
          Logger.error('Ошибка парсинга кэшированных правил:', parseError);
        }
      }
    } catch (storageError) {
      Logger.error('Ошибка чтения clientStorage:', storageError);
    }
    
    // Fallback на embedded правила
    Logger.info('📚 Используются встроенные правила парсинга');
    
    this.currentMetadata = {
      rules: DEFAULT_PARSING_RULES,
      source: 'embedded',
      lastUpdated: Date.now(),
      hash: simpleHash(JSON.stringify(DEFAULT_PARSING_RULES))
    };
    
    return this.currentMetadata;
  }
  
  /**
   * Проверяет доступность обновлений с удалённого сервера
   */
  async checkForUpdates(): Promise<{ hasUpdate: boolean; newRules?: ParsingSchema; hash?: string } | null> {
    try {
      var remoteUrl = await figma.clientStorage.getAsync(STORAGE_KEYS.REMOTE_URL);
      
      if (!remoteUrl) {
        Logger.debug('Remote config URL не настроен');
        return null;
      }
      
      Logger.info('🔍 Проверка обновлений правил с ' + remoteUrl);
      
      var response = await fetch(remoteUrl);
      
      if (!response.ok) {
        Logger.error('Не удалось загрузить удалённые правила: HTTP ' + response.status);
        return null;
      }
      
      var remoteRulesText = await response.text();
      var remoteRules = JSON.parse(remoteRulesText) as ParsingSchema;
      
      // Вычисляем hash удалённых правил
      var remoteHash = simpleHash(remoteRulesText);
      var currentHash = this.currentMetadata?.hash;
      
      if (remoteHash !== currentHash) {
        Logger.info('✨ Найдены обновлённые правила парсинга');
        this.pendingRemoteRules = remoteRules;
        
        // Сохраняем pending правила
        await figma.clientStorage.setAsync(STORAGE_KEYS.PENDING_RULES, remoteRulesText);
        
        return {
          hasUpdate: true,
          newRules: remoteRules,
          hash: remoteHash
        };
      }
      
      Logger.info('✅ Правила парсинга актуальны');
      return { hasUpdate: false };
      
    } catch (error) {
      Logger.error('Ошибка проверки обновлений правил:', error);
      return null;
    }
  }
  
  /**
   * Применяет удалённые правила после подтверждения пользователя
   */
  async applyRemoteRules(hash: string): Promise<boolean> {
    try {
      // Загружаем pending правила
      var pendingRulesStr = await figma.clientStorage.getAsync(STORAGE_KEYS.PENDING_RULES);
      
      if (!pendingRulesStr) {
        Logger.error('Нет ожидающих правил для применения');
        return false;
      }
      
      var pendingRules = JSON.parse(pendingRulesStr) as ParsingSchema;
      var pendingHash = simpleHash(pendingRulesStr);
      
      // Проверяем hash для безопасности
      if (pendingHash !== hash) {
        Logger.error('Hash pending правил не совпадает');
        return false;
      }
      
      // Мягкое слияние с базовыми правилами
      var mergedRules = mergeRules(DEFAULT_PARSING_RULES, pendingRules);
      
      // Сохраняем в кэш
      var remoteUrl = await figma.clientStorage.getAsync(STORAGE_KEYS.REMOTE_URL);
      
      await figma.clientStorage.setAsync(STORAGE_KEYS.RULES_CACHE, JSON.stringify(mergedRules));
      await figma.clientStorage.setAsync(STORAGE_KEYS.RULES_METADATA, JSON.stringify({
        lastUpdated: Date.now(),
        hash: pendingHash,
        remoteUrl: remoteUrl
      }));
      
      // Обновляем текущие правила
      this.currentMetadata = {
        rules: mergedRules,
        source: 'remote',
        lastUpdated: Date.now(),
        hash: pendingHash,
        remoteUrl: remoteUrl || undefined
      };
      
      // Очищаем pending
      await figma.clientStorage.deleteAsync(STORAGE_KEYS.PENDING_RULES);
      
      Logger.info('✅ Удалённые правила успешно применены');
      return true;
      
    } catch (error) {
      Logger.error('Ошибка применения удалённых правил:', error);
      return false;
    }
  }
  
  /**
   * Отклоняет ожидающие обновления правил
   */
  async dismissUpdate(): Promise<void> {
    await figma.clientStorage.deleteAsync(STORAGE_KEYS.PENDING_RULES);
    this.pendingRemoteRules = null;
    Logger.info('❌ Обновление правил отклонено');
  }
  
  /**
   * Очищает кэш и возвращается к embedded правилам
   */
  async resetToDefaults(): Promise<ParsingRulesMetadata> {
    await figma.clientStorage.deleteAsync(STORAGE_KEYS.RULES_CACHE);
    await figma.clientStorage.deleteAsync(STORAGE_KEYS.RULES_METADATA);
    await figma.clientStorage.deleteAsync(STORAGE_KEYS.PENDING_RULES);
    
    Logger.info('🔄 Сброс правил к значениям по умолчанию');
    
    this.currentMetadata = {
      rules: DEFAULT_PARSING_RULES,
      source: 'embedded',
      lastUpdated: Date.now(),
      hash: simpleHash(JSON.stringify(DEFAULT_PARSING_RULES))
    };
    
    return this.currentMetadata;
  }
  
  /**
   * Сохраняет URL для удалённого конфига
   */
  async setRemoteUrl(url: string): Promise<void> {
    await figma.clientStorage.setAsync(STORAGE_KEYS.REMOTE_URL, url);
    Logger.info('🔗 Remote config URL установлен: ' + url);
  }
  
  /**
   * Получает текущий URL удалённого конфига
   */
  async getRemoteUrl(): Promise<string | null> {
    return await figma.clientStorage.getAsync(STORAGE_KEYS.REMOTE_URL);
  }
  
  /**
   * Возвращает текущие метаданные правил
   */
  getCurrentMetadata(): ParsingRulesMetadata | null {
    return this.currentMetadata;
  }
  
  /**
   * Возвращает текущие правила (для использования в парсерах)
   */
  getCurrentRules(): ParsingSchema {
    if (!this.currentMetadata) {
      return DEFAULT_PARSING_RULES;
    }
    return this.currentMetadata.rules;
  }
}

