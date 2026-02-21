# Чеклист переименований слоёв — ESnippet (desktop)

Цель: привести имена текстовых слоёв к единой конвенции `#FieldName`,
чтобы плагин находил их за O(1) без fallback-цепочек.

Правило: **каждый слой, который заполняется данными, получает уникальное имя с `#`**.

---

## 1. Sitelinks (компонент `Block / Snippet-staff / Sitelinks`)

Путь: `ESnippet → Content → wrapper → EcomMeta → Sitelinks → Block / Snippet-staff / Sitelinks`

Сейчас — 6 одинаковых:
```
FRAME "Sitelink" → TEXT "Link"
FRAME "Sitelink" → TEXT "Link"
FRAME "Sitelink" → TEXT "Link"
...
```

Переименовать текстовые слои:

| # | Текущее имя фрейма | Текущее имя текста | Новое имя текста |
|---|---|---|---|
| 1 | Sitelink | Link | `#Sitelink_1` |
| 2 | Sitelink | Link | `#Sitelink_2` |
| 3 | Sitelink | Link | `#Sitelink_3` |
| 4 | Sitelink | Link | `#Sitelink_4` |
| 5 | Sitelink | Link | `#Sitelink_5` |
| 6 | Sitelink | Link | `#Sitelink_6` |

> **Внимание:** `Block / Snippet-staff / Sitelinks` используется повторно в секции `Contacts`.
> Переименование внутри мастер-компонента затронет оба инстанса — это ОК,
> плагин различает секции по родительскому фрейму (`Sitelinks` vs `Contacts`).

---

## 2. Promo

Путь: `ESnippet → Content → wrapper → EcomMeta → Promo`

Сейчас:
```
FRAME "Promo"
  INSTANCE "tag-v2"       ← иконка, не трогаем
  TEXT "Text"             ← label промо ("Акция", "Скидка" и т.д.)
  TEXT "Text"             ← описание промо
```

| # | Текущее имя | Новое имя | Что туда пишется |
|---|---|---|---|
| 1 | Text (первый) | `#PromoLabel` | Тип промо: "Акция", "Скидка" |
| 2 | Text (второй) | `#PromoText` | Текст промо: "При покупке от 5000 ₽" |

---

## 3. Phone (внутри Contacts)

Путь: `ESnippet → Content → wrapper → EcomMeta → Contacts → Phone`

Сейчас:
```
FRAME "Phone"
  TEXT "Text"             ← первый телефон
  TEXT "Separator"        ← разделитель (не трогаем)
  TEXT "Text"             ← второй телефон
```

| # | Текущее имя | Новое имя | Что туда пишется |
|---|---|---|---|
| 1 | Text (первый) | `#Phone_1` | "+7 (495) 123-45-67" |
| 2 | Separator | оставить | — |
| 3 | Text (второй) | `#Phone_2` | "+7 (800) 765-43-21" |

---

## 4. Address link (Line внутри Address)

Путь: `ESnippet → Content → wrapper → EcomMeta → Address → ItemList → Line`

Сейчас:
```
INSTANCE "Line"
  Props: value#29215:165: TEXT = "13 филиалов"
  TEXT "Title"            ← визуальный текст, привязан к value property
```

| # | Текущее имя | Новое имя | Зачем |
|---|---|---|---|
| 1 | Title | `#addressLink` | Чтобы плагин нашёл по имени, если setProperties(value) не сработает |

---

## 5. Header — поисковый запрос

Путь: `Block / Header → Main → Left → Block / Header-staff / Arrow → YandexBar → QueryHint`

Сейчас:
```
INSTANCE "QueryHint"
  TEXT "Query"            ← текст поискового запроса
```

| # | Текущее имя | Новое имя | Что туда пишется |
|---|---|---|---|
| 1 | Query | `#query` | Поисковый запрос: "пылесос makita" |

---

## Уже хорошо именованные слои (НЕ трогать)

Эти слои уже имеют правильные имена — плагин находит их без проблем:

| Слой | Путь | Статус |
|---|---|---|
| `#OrganicTitle` | Content → TEXT | ✅ |
| `#OrganicHost` | Content → greenurl → TEXT | ✅ |
| `#OrganicPath` | Content → greenurl → TEXT | ✅ |
| `#OrganicText` | Content → wrapper → TEXT | ✅ |
| `#EQuote-Text` | Line / EQuote → Line → TEXT | ✅ |
| `#EQuote-AuthorAvatar` | Line / EQuote → Line → Before → RECT | ✅ |
| `#EDeliveryGroup-Item` × 3 | EDeliveryGroup → Line → TEXT | ✅ |
| `#addressText` | Address → ItemList → TEXT | ✅ |
| `#OrganicPrice` | EPriceGroup → EPrice → Price → TEXT | ✅ |
| `#OldPrice` | EPriceGroup → EPrice (old) → Price → TEXT | ✅ |
| `#discount` | LabelDiscount → Label → TEXT | ✅ |
| `#Image1`, `#Image2`, `#Image3` | EThumb → wrapper → RECT | ✅ |
| `#FaviconImage` | Image Placeholder → RECT | ✅ |

---

## Вложенные инстансы с component properties (уже настроены)

Эти инстансы имеют TEXT properties, плагин устанавливает их через `setProperties()`:

| Инстанс | Property | Что устанавливается |
|---|---|---|
| `EReviewsLabel` | `rating` | Рейтинг: "4,3" |
| `EReviewsLabel` | `reviews_count` | "52,1K отзывов на магазин" |
| `EPrice` | `value` | Цена: "999 999" |
| `Label` (внутри LabelDiscount) | `value` | Скидка: "–10%" |
| `Line` (delivery) × 3 | `value` | Текст доставки |
| `Line` (address) | `value` | "13 филиалов" |
| `Line` (EQuote) | `value` | Текст цитаты |
| `Line / Official Shop → Line` | `value` | "Официальный магазин" |

---

## Визуальная карта переименований

```
ESnippet
├── Content
│   ├── #OrganicTitle ✅
│   ├── greenurl
│   │   ├── #OrganicHost ✅
│   │   ├── #OrganicPath ✅
│   │   └── wrapper
│   │       └── Line / Official Shop → Line (value property) ✅
│   ├── #OrganicText ✅
│   └── EcomMeta
│       ├── EReviewsLabel (rating, reviews_count properties) ✅
│       ├── Line / EQuote → #EQuote-Text ✅
│       ├── EDeliveryGroup → Line × 3 (value property) ✅
│       ├── ShopInfo-Bnpl → EBnpl × 3 (type property) ✅
│       ├── Address
│       │   ├── #addressText ✅
│       │   └── Line → "Title" ⟶ 🔧 `#addressLink`
│       ├── Sitelinks
│       │   └── Block / Snippet-staff / Sitelinks
│       │       └── Sitelink × 6 → "Link" ⟶ 🔧 `#Sitelink_1`..`#Sitelink_6`
│       ├── Contacts
│       │   ├── Block / Snippet-staff / Sitelinks (те же переименования)
│       │   └── Phone
│       │       ├── "Text" ⟶ 🔧 `#Phone_1`
│       │       └── "Text" ⟶ 🔧 `#Phone_2`
│       ├── Promo
│       │   ├── "Text" ⟶ 🔧 `#PromoLabel`
│       │   └── "Text" ⟶ 🔧 `#PromoText`
│       └── Price Block → EPriceGroup (properties) ✅
├── EThumb → #Image1, #Image2, #Image3 ✅
├── Image Placeholder → #FaviconImage ✅
└── Header
    └── QueryHint → "Query" ⟶ 🔧 `#query`
```

Всего переименований: **13 слоёв** (6 sitelinks + 2 promo + 2 phone + 1 address + 1 header + 1 query).
