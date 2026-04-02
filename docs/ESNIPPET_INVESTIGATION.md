# Исследование ESnippet: маппинг HTML → данные → Figma

Документ фиксирует ожидаемый поток данных для органического сниппета с оффером (пример: store77.net, Marshall Major V) и точки проверки при некорректной работе.

## Пример HTML (источник)

```html
<li class="serp-item serp-item_card " data-cid="1">
  <div class="Organic Organic_withThumb Organic_withOfferThumb Organic_thumbFloat_right ... Organic_withOfferInfo Organic_merchantDelivery ...">
    <!-- Картинка -->
    <div class="Organic-OfferThumbContainer">...</div>
    <!-- Заголовок -->
    <div class="OrganicTitle ...">
      <a href="..."><h2><span class="OrganicTitleContentSpan">Беспроводные наушники <b>Marshall</b> <b>Major</b> <b>V</b> (Черные)</span></h2></a>
    </div>
    <!-- Путь (greenurl) -->
    <div class="Path ...">store77.net › Наушники › Наушники Marshall</div>
    <!-- Описание -->
    <div class="OrganicText ..."><span class="OrganicTextContentSpan">Звук стал чище Встречайте усовершенственные наушники Marshall Major V...</span></div>
    <!-- Рейтинг + цитата -->
    <div class="OrganicUgcReviews ...">
      <div class="RatingOneStar">4,7</div>
      <div class="OrganicUgcReviews-Text">2,7K отзывов ... на магазин</div>
      <div class="EQuote-Text">«...доставка за день...»</div>
    </div>
    <!-- Доставка -->
    <div class="EDeliveryGroup ..."><span class="EDeliveryGroup-Item">В ПВЗ</span><span class="EDeliveryGroup-Item">Курьер</span></div>
    <!-- Цена + барометр -->
    <div class="EPriceGroup ...">
      <span class="EPrice-Value">7 480</span><span class="EPrice-Currency">₽</span>
      <div class="EPriceBarometer ...">Ниже рынка</div>
    </div>
  </div>
</li>
```

## 1. Расширение (content.js): HTML → CSVRow

Тип сниппета: `Organic_withOfferInfo` → при извлечении принудительно ставится `#SnippetType: 'ESnippet'` и вызывается `extractStandardSnippet(innerContent, 'ESnippet', ...)`.

Ожидаемые поля после парсинга:

| Поле | Селектор / логика | Ожидаемое значение |
|------|-------------------|--------------------|
| #OrganicTitle | .OrganicTitleContentSpan, .OrganicTitle-LinkText | "Беспроводные наушники Marshall Major V (Черные)" |
| #OrganicHost | .Path до первого › или extractProductURL | "store77.net" |
| #OrganicPath | .Path после первого › | "Наушники › Наушники Marshall" |
| #OrganicText | .OrganicTextContentSpan | "Звук стал чище Встречайте..." |
| #withThumb | класс Organic_withThumb / наличие картинки | "true" |
| #ShopName | из .Path до › | "store77.net" |
| #FaviconImage | extractFavicon (Favicon_outer style или data URL) | URL или data:image/... |
| #ShopInfo-Ugc | .RatingOneStar .Line-AddonContent | "4.7" |
| #EReviews_shopText | .OrganicUgcReviews-Text | "2,7K отзывов на магазин" |
| #QuoteText / #EQuote-Text | .EQuote-Text | «...доставка за день...» |
| #withQuotes | при наличии цитаты | "true" |
| #EDeliveryGroup | наличие .EDeliveryGroup / .ShopInfo-Deliveries | "true" |
| #EDeliveryGroup-Item-1 | .EDeliveryGroup-Item | "В ПВЗ" |
| #EDeliveryGroup-Item-2 | .EDeliveryGroup-Item | "Курьер" |
| #OrganicPrice | .EPrice-Value (не view_old) | "7 480" |
| #EPriceBarometer_View | класс below-market / EPriceBarometer-Cheap | "below-market" |
| #EPriceGroup_Barometer | наличие .EPriceBarometer | "true" |
| #EMarketCheckoutLabel | наличие кнопки чекаута | "false" (в этом сниппете нет кнопки «В корзину») |

Проверка: в консоли расширения при отправке в Figma можно временно вывести `console.log(JSON.stringify(row, null, 2))` для первого Organic_withOfferInfo и сверить с таблицей выше.

## 2. Плагин: CSVRow → свойства корня ESnippet

Схема (`src/schema/esnippet.ts`) и handlers выставляют на **корневой инстанс** ESnippet:

- organicTitle, organicText, organicHost, organicPath — из строки как есть.
- withThumb, withReviews, withQuotes, withDelivery, withPrice, withDeliveryBnpl, withButton и т.д. — по compute/equals из полей строки.

Если в логах плагина видно «Свойства: установлено X, не применено Y» и в списке доступных свойств корня есть organicTitle, withDelivery и т.д., то эти свойства должны быть установлены. Если их не видно в Figma на корне — проверить выделение (должен быть выбран именно корневой инстанс ESnippet, а не слой внутри слота).

## 3. Вложенные блоки (доставка, цитата, кнопка, барометр)

Текст доставки («В ПВЗ», «Курьер»), цитата, кнопка, барометр, EcomMeta и т.д. заполняются **handlers**, которые ищут узлы по имени в кэше: EDeliveryGroup, EQuote, EButton, EPriceBarometer, EcomMeta и т.д. Кэш строится обходом всего дерева контейнера, включая содержимое слотов (если есть). Если EcomMeta не слот, а фиксированный фрейм в компоненте, он находится как обычный узел.

Если слот Body (или другой) **пустой** или заполнен фреймом без ожидаемой структуры:

- `getCachedInstance(cache, 'EDeliveryGroup')` и аналоги вернут `null`;
- handlers не смогут выставить текст доставки, цитату, вид кнопки и т.д.

Итог: «некорректная работа» может быть из‑за:

1. **Парсинг** — какое‑то поле не извлекается (проверить по логу строки в расширении).
2. **Корневые свойства** — не применяются из‑за другого имени свойства в Figma (проверить по логам «Искали: … — не найдено» и списку доступных свойств).
3. **SLOT** — слот Body (или другой) пустой/другая структура → вложенные узлы не находятся, текст доставки/цитата/кнопка не заполняются. Решение: заполнить слот в Figma ожидаемой структурой (фрейм с EDeliveryGroup, EQuote, EButton и т.д.) или не переводить эти блоки в слоты.

## 4. Чеклист отладки

- [ ] В расширении: для этого сниппета в консоли есть строка с #OrganicTitle, #EDeliveryGroup, #EDeliveryGroup-Item-1/2, #QuoteText, #OrganicPrice, #EPriceBarometer_View.
- [ ] В плагине: в логах после импорта нет массовых «не найдено» для organicTitle, withDelivery, withQuotes (или есть явные алиасы/правки схемы под имена в Figma).
- [ ] В Figma: у корневого инстанса ESnippet в Component Inspector видны нужные свойства и значения (organicTitle, withDelivery и т.д.).
- [ ] В Figma: слот Body (или аналог) заполнен фреймом, внутри которого есть узлы с именами EDeliveryGroup, EQuote и т.д., если ожидается заполнение доставки/цитаты.
