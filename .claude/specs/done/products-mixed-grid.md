# ProductsImagesMixedGrid — новый формат продуктовой плитки

## Контекст

На Яндекс SERP появился новый формат группировки продуктов — `ProductsImagesMixedGrid`.
Отличается от старого `ProductsTiles` layout'ом и типами карточек.
На одной выдаче могут быть оба формата (старый `AdvProductGallery` + новый `MixedGrid`).

## DOM-анализ (live, "kitfort кофемашина", 1440px viewport)

### Обнаружение

| Признак | Значение |
|---------|----------|
| `data-fast-name` | `"ideas"` |
| `data-fast-subtype` | `"mixed_grid"` |
| Корневой класс | `.ProductsImagesMixedGrid` |
| Layout engine | `.JustifierColumnLayout` (JS masonry) |
| Карточки | `.ProductsImagesMixedGrid-ProductCard` |

### Layout

- **2 колонки** при 1440px viewport (container 760px)
- Card width: **248px**, gap: **8px**
- JS masonry через `JustifierColumnLayout` (position: relative, не CSS grid/columns)
- Parent: `ProductTile-Products` (display: flex, flex-wrap: wrap)

### Типы карточек

| Тип | Модификатор | Кол-во | Высота | Содержимое |
|-----|------------|--------|--------|------------|
| Regular | — | 37 | 361-380px | Фото + название + цена + магазин |
| Image-only | `_image` | 9 | 166-330px | Только фото товара (промо) |

Image-карточки НЕ содержат: delivery, checkout, rating, barometer, discount, favorites, officialShop.

### "Показать ещё"

- Класс: `.ProductMoreButton` (а не `a.Button[class*="Button_width_max"]` как в старом формате!)
- Текст: "Показать ещё"
- Видимых карточек до кнопки: ~8

### DebrandingTitle

- Класс: `.DebrandingTitle-Text`
- Текст: "Популярные товары по запросу «kitfort кофемашина»"

## Сравнение форматов

| | ProductsTiles (старый) | AdvProductGallery | ProductsImagesMixedGrid (НОВЫЙ) |
|---|---|---|---|
| Detection | `.ProductsTiles`, count > 1 | `.AdvProductGallery` | `fast-subtype="mixed_grid"`, `.ProductsImagesMixedGrid` |
| Layout | Flex wrap, 4 col | Horizontal carousel | JS masonry, 2 col |
| Card class | `.ProductTile-Item` | `.AdvProductGalleryCard` | `.ProductsImagesMixedGrid-ProductCard` |
| Image cards | Нет | Нет | Да (`_image`) |
| Show more | `a.Button[class*="Button_width_max"]` | Нет | `.ProductMoreButton` |
| Title | — | Header favicon + title | `.DebrandingTitle` |
| `data-fast-name` | разное | — | `"ideas"` |
| Masonry | Нет | Нет | Да (`JustifierColumnLayout`) |

## Что нужно изменить

### Extension (content.ts)

1. **Detection** — добавить проверку `data-fast-subtype="mixed_grid"` ИЛИ `.ProductsImagesMixedGrid`
   → `containerType: 'ProductsMixedGrid'`
2. **Card selector** — `.ProductsImagesMixedGrid-ProductCard` внутри контейнера
3. **Image card flag** — новое поле `#isImageCard: 'true'` если `_image` модификатор
4. **Column count** — считать уникальные X-позиции из `getBoundingClientRect()` → `#gridColumns: '2'`
5. **Show more** — детект `.ProductMoreButton` (помимо существующего `a.Button[class*="Button_width_max"]`)

### CSVFields (csv-fields.ts)

- `'#isImageCard'?: 'true' | 'false'` — тип карточки
- `'#gridColumns'?: string` — количество колонок в grid

### Plugin (page-builder)

1. **component-map.ts** — добавить `ProductsMixedGrid` config:
   - `columns: 2` (или dynamic из `#gridColumns`)
   - `childWidth: 248` (или пропорционально от parent width)
   - Masonry layout (вертикальное распределение по колонкам)
2. **page-creator.ts** — обработка `containerType: 'ProductsMixedGrid'`:
   - Title из `.DebrandingTitle`
   - Masonry 2-col layout
   - Image-only карточки: другой размер/вариант
   - "Показать ещё" кнопка

### Без изменений

- Старый `ProductsTiles` и `AdvProductGallery` продолжают работать как раньше
- Карточки `EProductSnippet2` внутри обоих форматов — та же схема маппинга

## Порядок реализации

1. Extension: detection + extraction с `containerType: 'ProductsMixedGrid'`
2. CSVFields: `#isImageCard`, `#gridColumns`
3. Plugin component-map: `ProductsMixedGrid` config
4. Plugin page-creator: masonry layout + image cards
5. Test на live data

## Verification

- Запустить extension на "kitfort кофемашина" → relay получает `containerType: 'ProductsMixedGrid'`
- Плагин рендерит 2-колоночный masonry с image-only карточками
- Старый ProductsTiles на другом запросе работает как раньше
