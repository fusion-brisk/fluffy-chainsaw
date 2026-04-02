# Extend — proactive gap detection and guided mapping

Проактивно сопоставляет три источника данных и предлагает маппинги:

1. Реальный DOM Яндекса (Playwright)
2. Реальные Figma-компоненты (MCP)
3. Текущий код (static analysis)

Аргумент: `$ARGUMENTS` — поисковый запрос для Яндекса (например: "купить iphone 15").
Если пустой — пропустить Playwright-шаг и работать только со статикой + Figma.

## Step 1 — Static Analysis

Запусти `npx tsx tools/coverage-report.ts` и прочитай `tools/coverage-report.json`.
Покажи компактную сводку: counts + top-5 gaps по каждому типу.

## Step 2 — Live SERP Analysis (Playwright)

Если указан поисковый запрос:

1. Открой `https://yandex.ru/search?text=<запрос>&lr=213` через `mcp__playwright__browser_navigate`
2. Дождись загрузки: `mcp__playwright__browser_wait_for` с текстом "результат"
3. Извлеки DOM-структуру всех сниппетов через `mcp__playwright__browser_evaluate`:

```javascript
() => {
  const items = document.querySelectorAll('li.serp-item, div.serp-item');
  return Array.from(items)
    .slice(0, 10)
    .map((item, i) => {
      // Detect snippet type
      const classes = item.querySelector(
        '[class*="EProduct"], [class*="EShop"], [class*="ESnippet"], [class*="EOffer"], [class*="Organic"]',
      );
      const type = classes
        ? classes.className.split(' ').find((c) => /^E[A-Z]/.test(c) || c === 'Organic')
        : 'Unknown';

      // Collect ALL unique BEM block names (first class of each element)
      const allElements = item.querySelectorAll('*');
      const bemBlocks = new Set();
      allElements.forEach((el) => {
        el.classList.forEach((cls) => {
          const block = cls.split('-')[0].split('_')[0];
          if (block && /^[A-Z]/.test(block)) bemBlocks.add(cls);
        });
      });

      // Extract visible content
      const title = item.querySelector('.OrganicTitleContentSpan, [class*="Title"]');
      const price = item.querySelector('.EPrice-Value, [class*="Price"]');
      const shop = item.querySelector('.EShopName, [class*="ShopName"]');
      const delivery = item.querySelector('[class*="Delivery"]');
      const button = item.querySelector('[class*="EButton"], [class*="Checkout"]');
      const rating = item.querySelector('[class*="Rating"], [class*="Stars"]');
      const reviews = item.querySelector('[class*="Reviews"], [class*="Ugc"]');
      const favicon = item.querySelector('.Favicon, [class*="Favicon"]');
      const thumb = item.querySelector('[class*="Thumb"] img, [class*="Leading"] img');

      return {
        index: i,
        type,
        bemBlocks: Array.from(bemBlocks).sort(),
        content: {
          title: title?.textContent?.trim()?.substring(0, 80),
          price: price?.textContent?.trim(),
          shop: shop?.textContent?.trim(),
          hasDelivery: !!delivery,
          hasButton: !!button,
          hasRating: !!rating,
          hasReviews: !!reviews,
          hasFavicon: !!favicon,
          hasThumb: !!thumb,
        },
      };
    });
};
```

4. Для каждого типа сниппета найди BEM-блоки, которые не парсятся extension (сравни с полями из coverage-report.json)

## Step 3 — Figma Component Introspection (MCP)

1. Ищи компоненты через `mcp__figma-console__figma_search_components` по именам: ESnippet, EShopItem, EOfferItem, EProductSnippet2
2. Для каждого найденного: `mcp__figma-console__figma_get_component` или `mcp__figma-console__figma_analyze_component_set` — получи ВСЕ свойства (boolean, variant, text, instance_swap)
3. Если Desktop Bridge не подключён — попробуй `mcp__figma-remote__search_design_system` как fallback
4. Результат: полный список свойств каждого компонента

## Step 4 — Three-Way Comparison

Сопоставь три источника в таблице:

```
| DOM Element         | Extension Field    | Schema Property | Figma Property | Status |
|--------------------|--------------------|-----------------|----------------|--------|
| .EDeliveryGroup    | #EDeliveryGroup    | withDelivery    | withDelivery   | ✅ OK  |
| .EPriceBarometer   | #EPriceBarometer   | (handler)       | view           | ✅ OK  |
| .NewBadge          | —                  | —               | withBadge      | ⚠ GAP  |
| .LoyaltyPoints     | #LoyaltyPoints    | —               | —              | ⚠ GAP  |
```

Приоритеты:

1. **BROKEN** — schema ссылается на свойство Figma, которого нет → красный
2. **FIGMA_UNMAPPED** — Figma-компонент имеет boolean/variant, не покрытый схемой → оранжевый
3. **DOM_NOT_PARSED** — видимый DOM-элемент, не извлекаемый extension → жёлтый
4. **PARSED_NOT_USED** — extension парсит, но schema не маппит → серый

## Step 5 — Propose Mappings

Для каждого gap типа FIGMA_UNMAPPED и DOM_NOT_PARSED предложи конкретный маппинг:

```
Gap: Figma ESnippet has boolean "withBadge" — not mapped
Proposed:
  1. csv-fields.ts: add '#Badge'?: 'true' | 'false';
  2. content.ts:    row['#Badge'] = container.querySelector('.Badge') ? 'true' : 'false';
  3. esnippet.ts:   { propertyNames: ['withBadge'], fieldName: '#Badge', hasValue: '#Badge' }
  4. Test:          add to engine.test.ts
```

Покажи все предложения, спроси какие применить.

## Step 6 — Apply & Verify

Для каждого выбранного маппинга:

1. Добавить поле в `csv-fields.ts`
2. Добавить извлечение в `content.ts` (с комментарием и CSS-селектором)
3. Добавить PropertyMapping в соответствующую schema
4. Добавить transform в `transforms.ts` если нужна логика
5. Запустить `npm run verify`
6. Перезапустить coverage: `npx tsx tools/coverage-report.ts`
7. Показать дельту: было N gaps → стало M gaps

## Правила

- Перед добавлением CSVField проверь `csv-fields.ts` — поле может уже существовать
- Для CSS-селекторов используй BEM-классы из Playwright DOM analysis
- Предпочитай `hasValue` и `equals` вместо `compute` (проще)
- `compute` только если нужна логика из нескольких полей
- Не добавляй handler если PropertyMapping достаточен
- Всегда прогоняй `npm run verify` после каждого batch изменений
