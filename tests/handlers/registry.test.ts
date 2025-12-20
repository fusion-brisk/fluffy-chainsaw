/**
 * Tests for handler registry
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HandlerPriority } from '../../src/handlers/registry';
import { HandlerContext, HandlerResult } from '../../src/handlers/types';
import { createMockInstance, resetFigmaMocks } from '../setup';

// Создаём свежий registry для тестов
class TestHandlerRegistry {
  private handlers: Array<{
    name: string;
    handler: (ctx: HandlerContext) => void | Promise<void>;
    metadata: { priority: number; mode: string; containers: string[]; dependsOn: string[] };
  }> = [];

  register(
    name: string,
    handler: (ctx: HandlerContext) => void | Promise<void>,
    metadata: { priority?: number; mode?: string; containers?: string[]; dependsOn?: string[] } = {}
  ): void {
    this.handlers.push({
      name,
      handler,
      metadata: {
        priority: metadata.priority ?? HandlerPriority.VARIANTS,
        mode: metadata.mode ?? 'sync',
        containers: metadata.containers ?? [],
        dependsOn: metadata.dependsOn ?? []
      }
    });
    this.handlers.sort((a, b) => a.metadata.priority - b.metadata.priority);
  }

  async executeAll(context: HandlerContext): Promise<HandlerResult[]> {
    const results: HandlerResult[] = [];

    for (const h of this.handlers) {
      const start = Date.now();
      try {
        await h.handler(context);
        results.push({ handlerName: h.name, success: true, duration: Date.now() - start });
      } catch (error) {
        results.push({
          handlerName: h.name,
          success: false,
          duration: Date.now() - start,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return results;
  }

  getHandlers() {
    return this.handlers;
  }

  reset() {
    this.handlers = [];
  }
}

describe('HandlerRegistry', () => {
  let registry: TestHandlerRegistry;

  beforeEach(() => {
    registry = new TestHandlerRegistry();
    resetFigmaMocks();
  });

  describe('register', () => {
    it('should register a handler', () => {
      const handler = vi.fn();
      registry.register('TestHandler', handler);

      expect(registry.getHandlers()).toHaveLength(1);
      expect(registry.getHandlers()[0].name).toBe('TestHandler');
    });

    it('should sort handlers by priority', () => {
      registry.register('Low', vi.fn(), { priority: HandlerPriority.FALLBACK });
      registry.register('Critical', vi.fn(), { priority: HandlerPriority.CRITICAL });
      registry.register('Normal', vi.fn(), { priority: HandlerPriority.VARIANTS });

      const names = registry.getHandlers().map(h => h.name);
      expect(names).toEqual(['Critical', 'Normal', 'Low']);
    });

    it('should use default priority if not specified', () => {
      registry.register('Default', vi.fn());

      expect(registry.getHandlers()[0].metadata.priority).toBe(HandlerPriority.VARIANTS);
    });
  });

  describe('executeAll', () => {
    it('should execute all handlers', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      registry.register('Handler1', handler1);
      registry.register('Handler2', handler2);

      const context: HandlerContext = {
        container: createMockInstance('TestContainer'),
        containerKey: 'test-key',
        row: { '#ShopName': 'Test Shop' }
      };

      const results = await registry.executeAll(context);

      expect(handler1).toHaveBeenCalledWith(context);
      expect(handler2).toHaveBeenCalledWith(context);
      expect(results).toHaveLength(2);
      expect(results.every(r => r.success)).toBe(true);
    });

    it('should catch and report errors', async () => {
      const failingHandler = vi.fn().mockRejectedValue(new Error('Test error'));
      registry.register('FailingHandler', failingHandler);

      const context: HandlerContext = {
        container: createMockInstance('TestContainer'),
        containerKey: 'test-key',
        row: null
      };

      const results = await registry.executeAll(context);

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe('Test error');
    });

    it('should execute handlers in priority order', async () => {
      const executionOrder: string[] = [];

      registry.register('Last', () => { executionOrder.push('Last'); }, { priority: 50 });
      registry.register('First', () => { executionOrder.push('First'); }, { priority: 0 });
      registry.register('Middle', () => { executionOrder.push('Middle'); }, { priority: 25 });

      const context: HandlerContext = {
        container: createMockInstance('TestContainer'),
        containerKey: 'test-key',
        row: {}
      };

      await registry.executeAll(context);

      expect(executionOrder).toEqual(['First', 'Middle', 'Last']);
    });

    it('should measure execution duration', async () => {
      registry.register('SlowHandler', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });

      const context: HandlerContext = {
        container: createMockInstance('TestContainer'),
        containerKey: 'test-key',
        row: {}
      };

      const results = await registry.executeAll(context);

      expect(results[0].duration).toBeGreaterThanOrEqual(10);
    });
  });

  describe('HandlerPriority enum', () => {
    it('should have correct priority values', () => {
      expect(HandlerPriority.CRITICAL).toBe(0);
      expect(HandlerPriority.VARIANTS).toBe(10);
      expect(HandlerPriority.VISIBILITY).toBe(20);
      expect(HandlerPriority.TEXT).toBe(30);
      expect(HandlerPriority.FALLBACK).toBe(40);
      expect(HandlerPriority.FINAL).toBe(50);
    });

    it('should maintain correct ordering', () => {
      expect(HandlerPriority.CRITICAL).toBeLessThan(HandlerPriority.VARIANTS);
      expect(HandlerPriority.VARIANTS).toBeLessThan(HandlerPriority.VISIBILITY);
      expect(HandlerPriority.VISIBILITY).toBeLessThan(HandlerPriority.TEXT);
      expect(HandlerPriority.TEXT).toBeLessThan(HandlerPriority.FALLBACK);
      expect(HandlerPriority.FALLBACK).toBeLessThan(HandlerPriority.FINAL);
    });
  });
});

describe('HandlerContext', () => {
  it('should accept typed CSVRow', () => {
    const context: HandlerContext = {
      container: createMockInstance('EShopItem'),
      containerKey: 'shop-123',
      row: {
        '#SnippetType': 'EShopItem',
        '#ShopName': 'Test Shop',
        '#OrganicPrice': '1 990 ₽',
        '#EPriceGroup_Discount': 'true'
      }
    };

    expect(context.row?.['#ShopName']).toBe('Test Shop');
    expect(context.row?.['#EPriceGroup_Discount']).toBe('true');
  });

  it('should allow null row', () => {
    const context: HandlerContext = {
      container: createMockInstance('Unknown'),
      containerKey: 'unknown-123',
      row: null
    };

    expect(context.row).toBeNull();
  });
});

