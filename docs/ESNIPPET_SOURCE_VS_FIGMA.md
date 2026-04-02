# Сравнение: исходные данные (HTML) → Figma ESnippet

На примере органического сниппета с оффером (apteka.ru — пена для ванн).

## Исходные данные из HTML

| Элемент | Селектор / признак | Значение в выдаче |
|--------|--------------------|-------------------|
| **Заголовок** | `.OrganicTitleContentSpan`, `organic__title` | «Рецепты бабушки агафьи пена для ванн витаминная 500...» |
| **Путь (greenurl)** | `.Organic-Path`, `.Path` | `apteka.ru` › `product/reczepty-babushki-agafi-pena-…` |
| **Хост** | из ссылки / первый сегмент path | `apteka.ru` |
| **Описание** | `.OrganicTextContentSpan` | «вспеньте под струей воды 1-2 колпачка на ванну. ... Витаминная пена для ванн чудесным образом кожу…» |
| **Картинка** | `.EThumb-Image` | `//avatars.mds.yandex.net/.../square_166` (120×100) |
| **Фавикон** | `.Favicon_outer` style background-image | data URL (base64) |
| **Меню «Действия»** | `[aria-label="Действия"]`, `.Extralinks` | есть → showKebab = true |
| **Верификация** | `.Verified_type_goods` | «Сайт специализируется на продаже товаров» (не OfficialShop) |
| **Рейтинг** | `.OrganicUgcReviews-Rating` → `.Line-AddonContent` | 4,8 → #ShopInfo-Ugc, #ProductRating |
| **Отзывы** | `.OrganicUgcReviews-Text`, `.EReviews` | «52,4K отзывов» → #ReviewsNumber, #EReviews_shopText |
| **Доставка** | `.ShopInfo-Deliveries` / `.EDeliveryGroup-Item` | «Из аптеки» → #EDeliveryGroup, #EDeliveryGroup-Item-1 |
| **Цена** | `.EPriceGroup-Price .EPrice-Value` | 229 ₽ → #OrganicPrice |
| **Барометр** | `.EPriceBarometer_type_in-market` | «ОК–цена» → #EPriceBarometer_View = in-market |
| **Тип сниппета** | класс корня | `Organic_withOfferInfo` → #SnippetType (не Organic) |

## Маппинг в CSVRow (extension)

| Поле CSVRow | Откуда берётся |
|-------------|----------------|
| #OrganicTitle | getTitleTextClean(.OrganicTitleContentSpan) |
| #OrganicPath | текст после «›» в .Path (path без хоста) |
| #OrganicHost | часть path до «›» или host из ссылки |
| #ShopName | то же, что хост для органики |
| #OrganicText | .OrganicTextContentSpan |
| #OrganicImage / #ThumbImage | .EThumb-Image src |
| #FaviconImage | extractFavicon(container) |
| #showKebab | наличие [aria-label="Действия"] → 'true'/'false' |
| #OfficialShop | .OfficialShop (отдельно от Verified_type_goods) → false для этого кейса |
| #VerifiedType | 'goods' при .Verified_type_goods |
| #ShopInfo-Ugc | рейтинг 4,8 |
| #ProductRating | то же значение (добавлено для withDeliveryBnpl) |
| #ReviewsNumber | число из «52,4K отзывов» |
| #EReviews_shopText | «52,4K отзывов на магазин» |
| #EDeliveryGroup | 'true', #EDeliveryGroup-Item-1 = «Из аптеки» |
| #OrganicPrice | «229» (с тонким пробелом при форматировании) |
| #EPriceBarometer_View | 'in-market' |
| #SnippetType | 'Organic_withOfferInfo' |

## Ожидаемые свойства в Figma (ESnippet)

| Свойство Figma | Источник | Ожидаемое значение |
|----------------|----------|--------------------|
| organicTitle | #OrganicTitle | «Рецепты бабушки агафьи пена для ванн витаминная 500...» |
| organicText | #OrganicText | «вспеньте под струей воды...» |
| organicHost | #OrganicHost | apteka.ru |
| organicPath | #OrganicPath | product/reczepty-babushki-agafi-pena-… |
| withThumb | класс Organic_withThumb / наличие картинки | true |
| withReviews | #ReviewsNumber \|\| #ShopInfo-Ugc | true |
| withDelivery | #EDeliveryGroup | true |
| withPrice | #OrganicPrice | true |
| withDeliveryBnpl | доставка/финтех/рейтинг/цена | true |
| withData | отзывы ИЛИ доставка ИЛИ BNPL | true |
| withButton | Desktop по умолчанию (для Organic_withOfferInfo не plain) | по platform |
| showKebab | #showKebab | true |
| isOfficial | #OfficialShop | false (Verified_type_goods ≠ официальный магазин) |
| withFintech | #EPriceGroup_Fintech | false (в этом сниппете нет финтеха) |
| withPromo | #Promo | false |

Тексты рейтинга/отзывов/доставки/цены/барометра заполняются в дочерних компонентах (EcomMeta, ShopInfo и т.д.) через хендлеры и вложенные инстансы.

## Что проверять в Figma

1. **Заголовок, описание, хост, путь** — совпадают с выдачей.
2. **Картинка** — превью товара (EThumb), не плейсхолдер.
3. **Рейтинг и отзывы** — 4,8 и «52,4K отзывов» в блоке ShopInfo/Ugc.
4. **Доставка** — «Из аптеки» в блоке доставки.
5. **Цена** — 229 ₽ и барометр «ОК–цена».
6. **Меню «Действия»** — showKebab = true (три точки видны).
7. **Без промо/финтеха/официального магазина** — соответствующие флаги false.

## Зависимость от типа сниппета

Для `#SnippetType === 'Organic'` (простая органика без оффера) в трансформах используется `isPlainOrganic(row)` → все «with*» для оффера/доставки/цены/рейтинга дают false. Для `Organic_withOfferInfo` и других типов с оффером эти флаги считаются по данным (withDelivery, withPrice, withDeliveryBnpl и т.д.).
