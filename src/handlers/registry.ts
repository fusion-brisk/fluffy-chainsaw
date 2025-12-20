/**
 * Handler Registry — централизованная регистрация и выполнение обработчиков
 * 
 * Преимущества:
 * - Единое место для всех обработчиков
 * - Контроль порядка выполнения через приоритеты
 * - Группировка sync/async обработчиков
 * - Легкое добавление новых обработчиков
 */

import { Logger } from '../logger';
import { HandlerContext, HandlerResult, HandlerMetadata, RegisteredHandler } from './types';

// Import all handlers
import { handleBrandLogic, handleELabelGroup, handleEPriceBarometer, handleEMarketCheckoutLabel } from './label-handlers';
import { handleMarketCheckoutButton, handleEButton } from './button-handlers';
import { handleESnippetOrganicTextFallback, handleESnippetOrganicHostFromFavicon, handleShopInfoUgcAndEReviewsShopText, handleOfficialShop, handleEOfferItem, handleShopOfflineRegion } from './snippet-handlers';
import { handleEDeliveryGroup, handleShopInfoBnpl, handleShopInfoDeliveryBnplContainer } from './delivery-handlers';
import { handleEPriceGroup, handleEPriceView, handleLabelDiscountView } from './price-handlers';

/**
 * Приоритеты выполнения обработчиков
 * Меньше число = раньше выполняется
 */
export enum HandlerPriority {
  /** Критические обработчики, влияющие на структуру (EPriceGroup) */
  CRITICAL = 0,
  /** Обработчики вариантов компонентов */
  VARIANTS = 10,
  /** Обработчики видимости элементов */
  VISIBILITY = 20,
  /** Обработчики текстовых полей */
  TEXT = 30,
  /** Fallback обработчики */
  FALLBACK = 40,
  /** Финальные обработчики */
  FINAL = 50
}

/**
 * Режим выполнения обработчика
 */
export type HandlerMode = 'sync' | 'async' | 'parallel';

/**
 * Реестр обработчиков
 */
class HandlerRegistry {
  private handlers: RegisteredHandler[] = [];
  private initialized = false;

  /**
   * Регистрация обработчика
   */
  register(
    name: string,
    handler: (context: HandlerContext) => void | Promise<void>,
    metadata: Partial<HandlerMetadata> = {}
  ): void {
    const fullMetadata: HandlerMetadata = {
      priority: metadata.priority ?? HandlerPriority.VARIANTS,
      mode: metadata.mode ?? 'sync',
      containers: metadata.containers ?? [],
      dependsOn: metadata.dependsOn ?? [],
      description: metadata.description ?? ''
    };

    this.handlers.push({ name, handler, metadata: fullMetadata });
    
    // Сортируем по приоритету после каждой регистрации
    this.handlers.sort((a, b) => a.metadata.priority - b.metadata.priority);
  }

  /**
   * Инициализация реестра с дефолтными обработчиками
   */
  initialize(): void {
    if (this.initialized) return;

    // === CRITICAL (0) — влияют на структуру ===
    this.register('EPriceGroup', handleEPriceGroup, {
      priority: HandlerPriority.CRITICAL,
      mode: 'async',
      description: 'Обработка цен, скидок, Fintech'
    });

    this.register('EPriceView', handleEPriceView, {
      priority: HandlerPriority.CRITICAL,
      mode: 'sync',
      description: 'EPrice view (special/default)'
    });

    // === VARIANTS (10) — варианты компонентов ===
    this.register('BrandLogic', handleBrandLogic, {
      priority: HandlerPriority.VARIANTS,
      mode: 'sync',
      description: 'Brand variant'
    });

    this.register('EPriceBarometer', handleEPriceBarometer, {
      priority: HandlerPriority.VARIANTS,
      mode: 'sync',
      description: 'Барометр цен'
    });

    this.register('EMarketCheckoutLabel', handleEMarketCheckoutLabel, {
      priority: HandlerPriority.VARIANTS,
      mode: 'sync',
      description: 'Лейбл чекаута'
    });

    this.register('MarketCheckoutButton', handleMarketCheckoutButton, {
      priority: HandlerPriority.VARIANTS,
      mode: 'sync',
      description: 'BUTTON variant на контейнере'
    });

    this.register('EOfferItem', handleEOfferItem, {
      priority: HandlerPriority.VARIANTS,
      mode: 'sync',
      containers: ['EOfferItem'],
      description: 'Модификаторы карточки предложения'
    });

    this.register('ShopInfoBnpl', handleShopInfoBnpl, {
      priority: HandlerPriority.VARIANTS,
      mode: 'sync',
      description: 'BNPL иконки'
    });

    this.register('ShopInfoDeliveryBnplContainer', handleShopInfoDeliveryBnplContainer, {
      priority: HandlerPriority.VARIANTS,
      mode: 'sync',
      description: 'Контейнер доставки/BNPL'
    });

    // === VISIBILITY (20) — видимость элементов ===
    this.register('EButton', handleEButton, {
      priority: HandlerPriority.VISIBILITY,
      mode: 'sync',
      description: 'EButton view и visible'
    });

    this.register('OfficialShop', handleOfficialShop, {
      priority: HandlerPriority.VISIBILITY,
      mode: 'sync',
      description: 'Галочка официального магазина'
    });

    // === TEXT (30) — текстовые поля ===
    this.register('LabelDiscountView', handleLabelDiscountView, {
      priority: HandlerPriority.TEXT,
      mode: 'async',
      dependsOn: ['EPriceGroup'],
      description: 'LabelDiscount view и текст'
    });

    this.register('ShopInfoUgcAndEReviewsShopText', handleShopInfoUgcAndEReviewsShopText, {
      priority: HandlerPriority.TEXT,
      mode: 'async',
      description: 'Рейтинг и отзывы магазина'
    });

    this.register('ShopOfflineRegion', handleShopOfflineRegion, {
      priority: HandlerPriority.TEXT,
      mode: 'async',
      description: 'Адрес магазина (#addressText, #addressLink)'
    });

    this.register('ELabelGroup', handleELabelGroup, {
      priority: HandlerPriority.TEXT,
      mode: 'async',
      description: 'Rating + Barometer'
    });

    this.register('EDeliveryGroup', handleEDeliveryGroup, {
      priority: HandlerPriority.TEXT,
      mode: 'async',
      description: 'Группа доставки'
    });

    // === FALLBACK (40) — fallback обработчики ===
    this.register('ESnippetOrganicTextFallback', handleESnippetOrganicTextFallback, {
      priority: HandlerPriority.FALLBACK,
      mode: 'async',
      containers: ['ESnippet', 'Snippet'],
      description: 'Fallback для OrganicText'
    });

    this.register('ESnippetOrganicHostFromFavicon', handleESnippetOrganicHostFromFavicon, {
      priority: HandlerPriority.FALLBACK,
      mode: 'async',
      containers: ['ESnippet', 'Snippet'],
      description: 'Fallback для OrganicHost из favicon'
    });

    this.initialized = true;
    Logger.debug(`[HandlerRegistry] Зарегистрировано ${this.handlers.length} обработчиков`);
  }

  /**
   * Выполнение всех обработчиков для контекста
   */
  async executeAll(context: HandlerContext): Promise<HandlerResult[]> {
    if (!this.initialized) this.initialize();

    const results: HandlerResult[] = [];
    const containerName = context.container && 'name' in context.container 
      ? String(context.container.name) 
      : '';

    // Группируем обработчики по режиму выполнения
    const syncHandlers: RegisteredHandler[] = [];
    const asyncSequential: RegisteredHandler[] = [];
    const asyncParallel: RegisteredHandler[] = [];

    for (const h of this.handlers) {
      // Проверяем ограничение по контейнерам
      if (h.metadata.containers && h.metadata.containers.length > 0) {
        if (!h.metadata.containers.includes(containerName)) {
          continue;
        }
      }

      if (h.metadata.mode === 'sync') {
        syncHandlers.push(h);
      } else if (h.metadata.dependsOn && h.metadata.dependsOn.length > 0) {
        asyncSequential.push(h);
      } else {
        asyncParallel.push(h);
      }
    }

    // 1. Выполняем sync обработчики
    for (const h of syncHandlers) {
      const result = await this.executeHandler(h, context);
      results.push(result);
    }

    // 2. Выполняем async с зависимостями последовательно
    for (const h of asyncSequential) {
      const result = await this.executeHandler(h, context);
      results.push(result);
    }

    // 3. Выполняем независимые async параллельно
    if (asyncParallel.length > 0) {
      const parallelResults = await Promise.all(
        asyncParallel.map(h => this.executeHandler(h, context))
      );
      results.push(...parallelResults);
    }

    return results;
  }

  /**
   * Выполнение одного обработчика
   */
  private async executeHandler(
    registered: RegisteredHandler,
    context: HandlerContext
  ): Promise<HandlerResult> {
    const startTime = Date.now();
    
    try {
      await registered.handler(context);
      
      return {
        handlerName: registered.name,
        success: true,
        duration: Date.now() - startTime
      };
    } catch (error) {
      Logger.error(`[${registered.name}] Error:`, error);
      
      return {
        handlerName: registered.name,
        success: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Получить список зарегистрированных обработчиков
   */
  getHandlers(): ReadonlyArray<RegisteredHandler> {
    return this.handlers;
  }

  /**
   * Сброс реестра (для тестов)
   */
  reset(): void {
    this.handlers = [];
    this.initialized = false;
  }
}

// Singleton instance
export const handlerRegistry = new HandlerRegistry();

// Инициализация при импорте
handlerRegistry.initialize();

