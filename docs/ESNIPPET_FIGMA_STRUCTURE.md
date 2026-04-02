# Структура ESnippet в Figma (по MCP)

Получено через `figma_execute` по выделенному инстансу ESnippet (id: 1325:18803).

## Корневой инстанс ESnippet

**Свойства (componentProperties):**
- `Body#31851:0` — SLOT
- `EcomMeta#31851:3` — SLOT
- Текст: `organicTitle#29154:0`, `organicText#29154:3`, `organicHost#29154:15`, `organicPath#29154:9`
- Булевы: `withReviews`, `withDelivery`, `withThumb`, `withButton`, `withData`, `withDeliveryBnpl`, `withPrice`, `withFintech`, `withPromo`, `showKebab`, `withQuotes`, `withSitelinks`, `withAddress`, `withOnboarding`, `isOfficial`
- `imageType#28721:0` — INSTANCE_SWAP
- `platform` — VARIANT (desktop)

## Дерево детей (упрощённо)

```
ESnippet
├── Content (FRAME)
│   ├── #OrganicTitle (TEXT)
│   ├── greenurl (FRAME)
│   │   ├── #OrganicHost (TEXT)
│   │   ├── Separator (›)
│   │   ├── #OrganicPath (TEXT)
│   │   └── wrapper → Block / Snippet-staff / Verified, Line / Official Shop
│   ├── Body (SLOT)
│   │   └── #OrganicText (TEXT)
│   └── …
├── EcomMeta (SLOT) — заполнен контентом
│   ├── Rating + Review + Quote (FRAME)
│   │   ├── EReviewsLabel (INSTANCE)
│   │   │   ├── Line — value#29215:165 = "4,5" (рейтинг)
│   │   │   └── Line — value#29215:165 = "126 отзывов"
│   │   └── Line / EQuote — value «...очень быстрая доставка...»
│   ├── ShopInfo-DeliveryBnplContainer (FRAME)
│   │   ├── EDeliveryGroup (INSTANCE) ✅ имя именно "EDeliveryGroup"
│   │   │   ├── Line — value "В ПВЗ СДЭК", #EDeliveryGroup-Item (TEXT)
│   │   │   ├── Line — value "· ПВЗ", #EDeliveryGroup-Item
│   │   │   └── Line — value "· СДЭК и др", #EDeliveryGroup-Item
│   │   ├── ShopInfo-Bnpl (INSTANCE) — EBnpl × 3 (split, dolyami, mts-pay)
│   │   ├── Address → #addressText, #addressLink, Line
│   │   ├── Sitelinks → #Sitelink_1…6
│   │   ├── Promo → #PromoLabel
│   │   └── Price Block
│   │       └── Price → EPriceGroup (INSTANCE) ✅
│   │           ├── EPrice — value#28592:0 = "999 999", view, #OrganicPrice (TEXT внутри)
│   │           ├── EPriceBarometer — view "in-market"
│   │           ├── LabelDiscount, EPrice (old), ELabelPlus, Fintech, …
│   │       └── EButton (INSTANCE)
├── EThumb (INSTANCE)
│   └── #OrganicImage (RECTANGLE) — слой для картинки товара
├── Kebab (INSTANCE) — меню «Действия»
└── Image Placeholder (INSTANCE)
    └── #FaviconImage (RECTANGLE) — слой для фавиконки ✅
```

## Важно для маппинга плагина

| Что | Имя в Figma | Где лежит |
|-----|--------------|-----------|
| Фавиконка | **#FaviconImage** (RECTANGLE внутри Image Placeholder) | Дочерний узел корня ESnippet |
| Картинка товара | **#OrganicImage** (в EThumb) | EThumb → #OrganicImage |
| Цена (число) | **EPrice** — свойство **value#28592:0** (TEXT) | EcomMeta → Price Block → EPriceGroup → EPrice |
| Блок цены | **EPriceGroup** | EcomMeta → Price Block → EPriceGroup |
| Доставка | **EDeliveryGroup** (INSTANCE) | EcomMeta → ShopInfo-DeliveryBnplContainer → EDeliveryGroup |
| Текст доставки | **Line** с **value#29215:165** и дочерний **#EDeliveryGroup-Item** (TEXT) | Внутри EDeliveryGroup |
| Рейтинг/отзывы | **EReviewsLabel** → два **Line** (value "4,5" и "126 отзывов") | EcomMeta → Rating + Review + Quote |
| Заголовок, хост, путь | **#OrganicTitle**, **#OrganicHost**, **#OrganicPath** (TEXT) | Content, greenurl |

## Свойства EPrice для установки цены

У инстанса **EPrice** (текущая цена, не old):
- `value#28592:0` — TEXT (число с пробелами: "999 999")
- `view` — VARIANT
- `size`, `weight`, `lineThrough`, `range`, `footnote`

Т.е. в коде нужно устанавливать свойство с ключом, начинающимся с `value` (например `value#28592:0`); сравнение по имени `value` (без учёта регистра) уже добавлено в `safeSetInstanceProperty`.

## Слоты

- **Body** и **EcomMeta** — SLOT. Их содержимое в дереве есть (дочерние узлы инстанса), поэтому кэш и хендлеры видят EDeliveryGroup, EPriceGroup, EReviewsLabel и т.д. внутри EcomMeta.
