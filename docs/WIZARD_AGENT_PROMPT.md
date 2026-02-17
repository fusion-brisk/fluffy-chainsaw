# Промпт для агента: Добавление поддержки колдунщиков (wizards)

> Этот документ — промпт для агента Opus 4.6.
> Передай его целиком в новую сессию вместе с контекстом проекта (.cursorrules).

---

## Контекст проекта

Ты работаешь с Figma-плагином **Contentify**, который автоматически заполняет макеты реальными данными из поисковой выдачи Яндекса. Архитектура:

```
Browser Extension --> Relay Server (localhost:3847) --> Figma Plugin
```

Сейчас система обрабатывает только **сниппеты** (карточки товаров/результатов) в формате плоского `CSVRow` (ключ-значение). Нужно добавить обработку **колдунщиков (wizards)** — в частности «Ответ Алисы» (FuturisSearch) — в формате **структурированного JSON** с массивом компонентов.

Полное описание архитектуры — в `.cursorrules` в корне проекта. Прочти его и `docs/EXTENDING.md` перед началом работы.

---

## Справочные материалы

Коллеги уже создали расширение, которое парсит ответ Алисы и выдаёт структурированный JSON. Файлы лежат в `mishamisha/`:

| Файл/ресурс | Назначение |
|------|------------|
| `mishamisha/llm-answers-exporter-0.1.0/` | Расширение коллег (полный исходник) |
| `mishamisha/sample.html` | HTML фрагмент с реальным ответом Алисы (весь `<li>` блок) |
| `mishamisha/extension-answer.json` | JSON, который выдаёт расширение коллег из этого HTML |
| Figma: `n0s4JjpG1iJknTLikVgLEx`, node `127:89951` | Артборд "Answer Content" --- результат работы плагина коллег |

**ВАЖНО**: Прочти все три файла в `mishamisha/` перед началом работы. Они --- эталон парсинга и формата данных. Артборд в Figma показывает целевую структуру компонентов.

---

## Задача

Добавить в Contentify третий путь данных — **wizard** — параллельно существующему пути сниппетов.

### Два независимых потока данных

```
                    +-- rawRows: CSVRow[] -------> processImportCSV() --> заполнение сниппетов
Extension/HTML ---->|
                    +-- wizards: WizardPayload[] -> processWizards() ---> построение wizard-блоков
```

Сниппеты и wizards — это разные сущности, с разным форматом, с разными обработчиками. Они НЕ смешиваются в CSVRow.

---

## Формат данных wizard (JSON-схема)

Используем формат, совместимый с расширением коллег. Каждый wizard — объект `WizardPayload`:

```typescript
interface WizardPayload {
  type: 'FuturisSearch';
  components: WizardComponent[];
}

// Типы компонентов:

type WizardComponent =
  | WizardHeading
  | WizardParagraph
  | WizardList
  | WizardImage
  | WizardVideo;

interface WizardHeading {
  type: 'h2';  // также h1, h3, h4, h5, h6
  text: string;
}

interface WizardParagraph {
  type: 'p';
  spans: WizardSpan[];
  footnotes: WizardFootnote[];
}

interface WizardSpan {
  text: string;
  bold: boolean;
}

interface WizardFootnote {
  text: string;       // "ru.wikipedia.org*"
  href: string;       // "https://ru.wikipedia.org/wiki/..."
  iconUrl: string;    // "https://favicon.yandex.net/favicon/v2/..."
  debug: null | object;
}

interface WizardList {
  type: 'ul' | 'ol';
  items: WizardListItem[];
}

interface WizardListItem {
  spans: WizardSpan[];
  footnotes: WizardFootnote[];
}

interface WizardImage {
  type: 'img';
  src: string;
  alt: string;
}

interface WizardVideo {
  type: 'video';
  poster: string;
  title: string;
  host: string;
  channelTitle: string;
  views: string;
  date: string;
  duration: string;
}
```

### Пример реального JSON

Файл `mishamisha/extension-answer.json` — реальный вывод для запроса «ибупрофен». Содержит:
- Параграфы с bold-спанами и footnote-ссылками на источники
- Заголовки h2 (секции: «Показания к применению», «Противопоказания» и т.д.)
- Маркированные списки (ul)
- Картинку (img)

---

## DOM-структура ответа Алисы на странице Яндекса

Из `mishamisha/sample.html`. Ключевые селекторы:

### Корневой контейнер
```
li.serp-item.serp-item__futuris-snippet
  > div.Root.Root-FuturisSearchOuter.Root_inited
    > div > div.FuturisSearch
      > div.FuturisSearch-Content
        > div.FuturisInlineHeader              // Заголовок "Алиса AI"
        > div.FactFold
          > div.FactFold-Container
            > article.Futuris-RequestResponsePair
              > section.FuturisGPTMessage
                > section.FuturisGPTMessage-GroupContent
                  > div.FuturisGPTMessage-GroupContentComponentWrapper  // <-- ROOT для парсинга
```

### Внутри GroupContentComponentWrapper

```
section.FuturisContentSection.FuturisRSRContent-CompositionBlock
  > h2.FuturisTitle.FuturisContentSection-Title      // Заголовок секции
  > div.FuturisMarkdown.FuturisRSRContent-Block       // Markdown-блок
    > div.FuturisMarkdown-Paragraph                    // Параграф (внутри: <strong>, текст, .FuturisFootnote)
    > ul.FuturisMarkdown-UnorderedList                 // Список
      > li.FuturisMarkdown-ListItem                    // Элемент списка
  > div.FuturisImage.FuturisRSRContent-MediaBlock      // Картинка
    > img.FuturisImage-Image                           // src + alt
  > div.FuturisProductReview                           // Блок отзывов (пока не парсим)
```

### Footnote (сноска-источник)
```html
<a class="Link FuturisFootnote FuturisFootnote_redesign" href="https://...">
  <span class="FuturisFootnote-Icon" style="background-image:url(...)"></span>
  ru.wikipedia.org*
</a>
```

### Карусель источников (внизу ответа)
```
section.FuturisGPTMessage-GroupSources
  > ol.FuturisGPTMessage-Sources
    > li.FuturisGPTMessage-SourcesItem
      > a.FuturisSource
        > div.FuturisSource-Path
          > i.FuturisSource-Icon (style background-image)
          > div.FuturisSource-Host  // текст хоста
```

### Определение контейнера
```
data-fast-name="neuro_answer"     // атрибут на li.serp-item
class содержит "serp-item__futuris-snippet"
class содержит "Root-FuturisSearchOuter"
```

---

## Логика парсинга (из расширения коллег)

Расширение коллег парсит DOM рекурсивным обходом. Ключевые функции:

### extractSpans(containerEl) — извлечение текста с форматированием
Обходит DOM-дерево контейнера, собирая текстовые ноды. `<strong>` и `<b>` теги помечаются как bold. Элементы `.FuturisFootnote` пропускаются (они обрабатываются отдельно). Соседние спаны с одинаковым bold-значением склеиваются.

### extractFootnotes(containerEl) — извлечение ссылок-источников
Ищет `a.Link.FuturisFootnote.FuturisFootnote_redesign`, для каждой извлекает:
- text (textContent)
- href
- iconUrl (из `background-image` на `.FuturisFootnote-Icon`)

### buildComponentFromElement(el) — определение типа компонента
- `.FuturisContentSection-Title` --> `{ type: "h2", text }`
- `.FuturisMarkdown-Paragraph` --> `{ type: "p", spans, footnotes }`
- `.FuturisMarkdown-UnorderedList` --> `{ type: "ul", items: [{ spans, footnotes }] }`
- `.FuturisMarkdown-OrderedList` --> `{ type: "ol", items }`
- `.FuturisImage-Image` --> `{ type: "img", src, alt }`
- `.VideoSnippet` / `.VideoSnippet2` --> `{ type: "video", poster, title, ... }`

### collectComponents(rootEl) — рекурсивный обход
Обходит дочерние элементы rootEl. Если элемент распознаётся buildComponentFromElement — добавляет компонент. Если нет — рекурсивно обходит его детей.

### Корневой элемент
`.FuturisGPTMessage-GroupContentComponentWrapper`

---

## План реализации

### Фаза 1: Типы данных

Создать `src/types/wizard-types.ts` с интерфейсами: `WizardPayload`, `WizardComponent`, `WizardSpan`, `WizardFootnote`, `WizardImage`, `WizardVideo` (см. схему выше).

### Фаза 2: Парсинг

#### 2.1 Extension (живой DOM) — `extension/content.js`

1. В `extractSnippets()` — после извлечения сниппетов, отдельно найти wizard-контейнеры:

```javascript
// Ищем FuturisSearch-блоки
var futurisContainers = document.querySelectorAll(
  'li.serp-item[data-fast-name="neuro_answer"], li.Root-FuturisSearchOuter'
);
```

2. Для каждого контейнера вызвать новую функцию `extractFuturisWizard(container)`, которая:
   - Находит `.FuturisGPTMessage-GroupContentComponentWrapper`
   - Рекурсивно обходит его (как `collectComponents` в расширении коллег)
   - Возвращает `{ type: 'FuturisSearch', components: [...] }`

3. Функции парсинга (`extractSpans`, `extractFootnotes`, `buildComponentFromElement`, `collectComponents`) — портировать из `mishamisha/llm-answers-exporter-0.1.0/src/parsers/ya-ru.js` и `src/utils/dom.js`. Они используют только стандартное DOM API.

4. Результат: `extractSnippets()` возвращает не только `rows: CSVRow[]`, но и `wizards: WizardPayload[]`.

#### 2.2 Plugin (статический HTML) — `src/utils/snippet-parser.ts`

Аналогичная логика для `DOMParser`-обработанного HTML:
1. Найти контейнер `.FuturisGPTMessage-GroupContentComponentWrapper`
2. Обойти рекурсивно, извлечь компоненты
3. Вернуть `wizards: WizardPayload[]` наряду с `rows: CSVRow[]`

**ВАЖНО**: В статическом HTML `Root-FuturisSearchOuter` может быть пустым (контент грузится динамически). Но `sample.html` показывает, что при полном сохранении страницы контент присутствует. Если контейнер пуст — просто пропускаем.

### Фаза 3: Транспорт (Relay)

#### 3.1 Расширение --> Relay

В `extension/background.js` и `extension/popup.js` — добавить `wizards` в payload:

```javascript
const payload = {
  schemaVersion: 3,  // bump version
  source: { url: tab.url, title: tab.title },
  capturedAt: new Date().toISOString(),
  rawRows: rows,
  wizards: wizards  // NEW: WizardPayload[]
};
```

#### 3.2 Relay Server

В `relay/server.js` — без изменений по сути (relay передаёт payload как есть). Но обновить `itemCount` в `/push`, `/peek`, `/status`:

```javascript
const itemCount = (entry.payload?.rawRows?.length || 0) + (entry.payload?.wizards?.length || 0);
```

#### 3.3 Plugin (приём данных)

В `src/ui.tsx` — `peekRelayData()` уже работает с payload. Добавить извлечение `wizards`:

```typescript
const wizards = payload.wizards || [];
```

В `src/code.ts` — обработчик `apply-relay-payload`: передавать `wizards` наряду с `rawRows`.

### Фаза 4: Figma-компоненты (реальная структура из макета коллег)

Плагин коллег собирает ответ Алисы из библиотечных компонентов. Артборд из Figma (файл `n0s4JjpG1iJknTLikVgLEx`, node `127:89951`) содержит фрейм `Answer Content` с дочерними инстансами:

#### Маппинг JSON -> Figma-компоненты

| JSON type | Figma instance name | Описание |
|-----------|-------------------|-----------|
| `p` (с footnotes) | `p+source: {text}` | Параграф + источники |
| `h2` | `h2: {text}` | Заголовок секции |
| `ul` item (каждый!) | `dashed list: {text}` | Элемент списка с тире |
| `img` | `img: {alt}` | Картинка с подписью |

**ВАЖНО**: Каждый элемент списка (`ul`/`ol`) — это **отдельный инстанс** `dashed list`, а не один текстовый блок на весь список!

#### Структура компонента `p+source`

```
p+source (frame, vertical, padding-y: 8px)
  +-- Text layer (YS Text Web Regular, 16px, line-height 22px)
  |   Смешанное форматирование: bold через setRangeFontName()
  |   Font bold: "YS Text Web: Text Bold"
  |   Font regular: "YS Text Web: Text Regular"
  |
  +-- sources (frame, flex-wrap, gap: 4px)
      +-- Text layer (остаток текста параграфа, если не вместился)
      +-- Source (pill chip, rounded-full, bg: rgba(0,0,0,0.05))
      |   +-- Favicon (icon, 16x16)
      |   +-- Text (12px, rgba(0,0,0,0.6), e.g. "ru.wikipedia.org*")
      +-- Source ...
```

#### Структура компонента `h2`

```
h2 (frame, padding-top: 24px, padding-bottom: 12px)
  +-- Text layer (YS Text Web Bold, 20px, line-height 24px)
```

#### Структура компонента `dashed list`

```
dashed list (frame, padding-left: 16px)
  +-- li (frame, flex-row, gap: 8px)
      +-- Dash text "---" (fixed width 15px, centered)
      +-- Text layer (YS Text Web Regular, 16px, line-height 22px)
```

#### Структура компонента `img`

```
img (frame, rounded: 16px, overflow: clip)
  +-- Media (frame)
  |   +-- Media Thumb (frame, overflow: clip)
  |       +-- Image (image fill layer)
  |       +-- Overlay Fill/05
  |       +-- Ratio (aspect ratio spacer, 100:150)
  +-- Title + Subtitle (frame, padding: 8px 12px 12px 12px, gap: 4px)
      +-- Title text (YS Text Web Medium, 14px, line-height 18px)
      +-- Subtitle text (YS Text Web Regular, 12px, rgba(0,0,0,0.45))
```

#### Как получить ключи компонентов

Для `importComponentByKeyAsync()` нужны ключи. Получить их можно из Figma Dev Console, выделив инстанс:

```javascript
const sel = figma.currentPage.selection[0];
if (sel && sel.type === 'INSTANCE') {
  const main = sel.mainComponent;
  console.log('Component key:', main.key);
  console.log('Name:', main.name);
  if (main.parent && main.parent.type === 'COMPONENT_SET') {
    console.log('ComponentSet key:', main.parent.key);
  }
}
```

Выполни это для каждого из 4 инстансов в артборде `127:89951` и запиши ключи.

### Фаза 5: Wizard-процессор и Page Builder

#### 5.1 Типы

В `src/page-builder/types.ts`:
- Добавить `'FuturisSearch'` в `SnippetType`
- Добавить `'FuturisSearch'` в `ContainerType`
- Расширить `StructureNode` полем `wizardData?: WizardPayload`

#### 5.2 Wizard Component Keys

Создать `src/page-builder/wizard-component-map.ts`:

```typescript
// Ключи получить из Figma Dev Console (см. инструкцию выше)
export const WIZARD_COMPONENT_KEYS = {
  'p+source': 'KEY_FROM_FIGMA',    // параграф с источниками
  'h2': 'KEY_FROM_FIGMA',          // заголовок секции
  'dashed list': 'KEY_FROM_FIGMA', // элемент списка
  'img': 'KEY_FROM_FIGMA',         // картинка
} as const;
```

#### 5.3 Structure Builder

В `src/page-builder/structure-builder.ts` --- `buildPageStructure()`:
- Wizards формируют отдельные `StructureNode` с `type: 'FuturisSearch'`
- Приоритет в `sortContentNodes()`: FuturisSearch идёт первым (после EQuickFilters)

#### 5.4 Page Creator --- рендеринг wizard-блока

В `src/page-builder/page-creator.ts` --- `renderStructureNode()`:

```typescript
if (node.type === 'FuturisSearch' && node.wizardData) {
  const frame = await createWizardAnswerFrame(node.wizardData, platform);
  if (frame) return { element: frame, count: 1 };
  return { element: null, count: 0 };
}
```

Функция `createWizardAnswerFrame()`:

```typescript
async function createWizardAnswerFrame(
  wizard: WizardPayload,
  platform: 'desktop' | 'touch'
): Promise<FrameNode> {
  // 1. Создать контейнер "Answer Content" (vertical auto-layout)
  const container = figma.createFrame();
  container.name = 'Answer Content';
  container.layoutMode = 'VERTICAL';
  container.primaryAxisSizingMode = 'AUTO';
  container.counterAxisSizingMode = 'FIXED';
  container.resize(platform === 'touch' ? 345 : 760, 100);
  container.itemSpacing = 0; // инстансы плотно друг к другу

  // 2. Для каждого JSON-компонента создать инстанс Figma-компонента
  for (const comp of wizard.components) {
    switch (comp.type) {
      case 'h2': {
        const component = await figma.importComponentByKeyAsync(WIZARD_COMPONENT_KEYS['h2']);
        const instance = component.createInstance();
        // Найти текстовый слой и заполнить
        const textNode = findTextNode(instance);
        if (textNode) {
          await figma.loadFontAsync(textNode.fontName as FontName);
          textNode.characters = comp.text;
        }
        instance.layoutAlign = 'STRETCH';
        container.appendChild(instance);
        break;
      }

      case 'p': {
        const component = await figma.importComponentByKeyAsync(WIZARD_COMPONENT_KEYS['p+source']);
        const instance = component.createInstance();

        // Заполнить текст с bold-форматированием
        const textNode = findTextNode(instance);
        if (textNode) {
          const regular = { family: 'YS Text Web', style: 'Text Regular' } as FontName;
          const bold = { family: 'YS Text Web', style: 'Text Bold' } as FontName;
          await figma.loadFontAsync(regular);
          await figma.loadFontAsync(bold);

          const fullText = comp.spans.map(s => s.text).join('');
          textNode.characters = fullText;

          let offset = 0;
          for (const span of comp.spans) {
            if (span.bold && span.text.length > 0) {
              textNode.setRangeFontName(offset, offset + span.text.length, bold);
            }
            offset += span.text.length;
          }
        }

        // Заполнить footnotes (Source chips)
        // Найти контейнер "sources" внутри инстанса
        // Для каждого footnote: найти Source-дочерний, заполнить текст + загрузить favicon
        // Лишние Source-чипы скрыть

        instance.layoutAlign = 'STRETCH';
        container.appendChild(instance);
        break;
      }

      case 'ul':
      case 'ol': {
        // Каждый item --- отдельный инстанс dashed list!
        for (const item of comp.items) {
          const component = await figma.importComponentByKeyAsync(WIZARD_COMPONENT_KEYS['dashed list']);
          const instance = component.createInstance();
          const textNode = findTextNode(instance); // второй текстовый слой (не dash)
          if (textNode) {
            await figma.loadFontAsync(textNode.fontName as FontName);
            const itemText = item.spans.map(s => s.text).join('');
            textNode.characters = itemText;
            // Применить bold к нужным участкам (аналогично p)
          }
          instance.layoutAlign = 'STRETCH';
          container.appendChild(instance);
        }
        break;
      }

      case 'img': {
        const component = await figma.importComponentByKeyAsync(WIZARD_COMPONENT_KEYS['img']);
        const instance = component.createInstance();
        // Загрузить и применить картинку через ImageProcessor
        // Заполнить Title и Subtitle текстовые слои если нужно
        instance.layoutAlign = 'STRETCH';
        container.appendChild(instance);
        break;
      }
    }
  }

  return container;
}
```

#### 5.5 CSS Class Mapping

В `component-map.ts`:
```typescript
CSS_CLASS_TO_CONTAINER_TYPE['serp-item__futuris-snippet'] = 'FuturisSearch';
CSS_CLASS_TO_CONTAINER_TYPE['Root-FuturisSearchOuter'] = 'FuturisSearch';
```

---

## Обнаружение FuturisSearch в DOM

### В extension/content.js

Определение контейнера:
```javascript
// По data-fast-name
container.getAttribute('data-fast-name') === 'neuro_answer'

// По CSS-классу
container.classList.contains('serp-item__futuris-snippet')

// Внутри: наличие Root-FuturisSearchOuter
container.querySelector('.Root-FuturisSearchOuter')
```

### В snippet-parser.ts (статический HTML)

Аналогичные селекторы через DOMParser API.

---

## Ограничения

1. **ES5 для code.js** — код в `src/` транспилируется через Babel (target: IE11). Не используй async generators и т.д.
2. **Нет Node.js API** в рантайме плагина — только Figma Plugin API и базовое браузерное API
3. **Парсинг в ДВУХ местах** — обновлять:
   - `extension/content.js` (живой DOM)
   - `src/utils/snippet-parser.ts` (статический HTML)
4. **Обратная совместимость** — существующие сниппеты работают без изменений, schemaVersion bump до 3
5. **Wizards не смешивать с CSVRow** — это параллельный поток данных

---

## Порядок работы

1. Прочти `.cursorrules`, `docs/EXTENDING.md`, и все файлы в `mishamisha/`
2. Создай типы данных (`src/types/wizard-types.ts`)
3. Добавь парсинг wizard в extension (`extension/content.js`)
4. Добавь парсинг wizard в плагин (`src/utils/snippet-parser.ts`)
5. Обнови транспорт: payload schema v3 с `wizards` полем
6. Создай wizard-процессор (`src/plugin/wizard-processor.ts`)
7. Обнови page builder для wizard-блоков
8. Убедись что `npm run build` проходит без ошибок

---

## Критерии готовности

- [ ] Типы `WizardPayload`, `WizardComponent` и др. определены
- [ ] Extension парсит FuturisSearch из живого DOM и возвращает `wizards[]`
- [ ] Plugin парсит FuturisSearch из статического HTML
- [ ] Relay передаёт `wizards[]` в payload (schemaVersion: 3)
- [ ] Плагин принимает wizard-данные и может их обработать
- [ ] Page builder создаёт wizard-блок из `components[]`
- [ ] Существующие сниппеты работают без изменений
- [ ] `npm run build` проходит без ошибок
- [ ] JSON-формат совместим с выводом расширения коллег (`mishamisha/extension-answer.json`)
