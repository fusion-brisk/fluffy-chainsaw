# Code Connect Map — DC · Ecom → React

> Generated: 2026-04-11T15:01:42.301Z
> Import pattern: `@oceania/depot/components/{ComponentName}`

## Summary

| Source | Count |
|--------|-------|
| Code Connect (from Figma) | 6 |
| User confirmed | 1 |
| Inferred (need verification) | 42 |
| Graphics/Icons (not React components) | 42 |
| **Total** | **91** |

## Confirmed Mappings

| Figma Name | React Import | Snippet | Source |
|------------|-------------|---------|--------|
| ELabelGroup | `LabelGroup` | - | code-connect |
| ELabelRating | `ELabelRating` | `<ELabelRating size="xs" view="white" value={4.5}/>...` | code-connect |
| EPriceBarometer | `EPriceBarometer` | `<EPriceBarometer/>...` | code-connect |
| EDeliveryGroup | `EDeliveryGroup` | - | code-connect |
| Line | `Line` | `<Line weight="regular">Курьер</Line>...` | code-connect |
| Line / EQuote | `EQuote` | - | code-connect |
| EProductSnippet2 | `EProductSnippet2` | `<EProductSnippet2 linkProps={{ url: "https://yandex.ru/produ...` | user-confirmed |

## Inferred Mappings (need verification)

### Atoms

| Figma Name | Inferred React Name | Variant Props | Boolean Props | Text Props |
|------------|-------------------|---------------|---------------|------------|
| Control / EProductTabs | `EProductTabs` | State(Inactive|Active) | - | - |
| Control / Favorite | `Favorite` | State(Default|Hover|Pressed) | - | - |
| EBnpl | `EBnpl` | size(l|s|m), type(split|yandex-pay|yandex-plus|dolyami|podeli|plait|plati-chastyami|mokka|t-pay|mts-pay) | - | - |
| EButton | `EButton` | size(M|L), view(secondary|primaryLong|white|primaryShort) | - | - |
| ELabelPlus | `ELabelPlus` | Mode(Light|Dark), Size(3XS|2XS), Value(Absolute|Percent) | - | - |
| EMarketCheckoutLabel | `EMarketCheckoutLabel` | Size(L|M|S|XS), View(Light Fill • Always|Accent Fill|Dark Fill • Always) | - | - |
| EPrice | `EPrice` | size(2xl (not in storybook)|xl|l|m|s|xs), view(undefined|special|old), weight(regular|medium|bold) | footnote, lineThrough, range | value |
| EPrice / Barometer Description | `EPrice / Barometer Description` | Variant(below-market|in-market|above-market) | - | - |
| EPriceBarometerLegend | `EPriceBarometerLegend` | Сollapsed(false|true) | - | - |
| Fintech | `Fintech` | size(s (not in storybook)|m|l), type(pay|yandexPay|split|ozon|alfaCard|vtbCard), view(default|extra-short|short|long|extra-long) | - | - |
| Image Overlay Controller | `Image Overlay Controller` | Padding(M|S|XS), Type(Label|Action|Dot Indicator) | withButton | - |
| Image Placeholder | `ImagePlaceholder` | Size(64|56|52|48|44|40|36|32|28|24|20|16|14|12) | - | - |
| Image Ratio | `ImageRatio` | Ratio(1:1|2:3|3:2|3:4|4:3|9:16|16:9|Manual) | - | - |
| Label | `Label` | size(m|s|xs|2xs|3xs), view(default|light|outlinePrimary|special|outlineSecondary|white|dark), weight(regular|medium|bold) | after, before, label (reverse OnlyAddons) | value |
| LabelDiscount | `LabelDiscount` | size(m|s|xs|2xs|3xs), view(outlinePrimary|outlineSpecial|special|textPrimary|textSpecial) | - | - |

### Molecules

| Figma Name | Inferred React Name | Variant Props | Boolean Props | Text Props |
|------------|-------------------|---------------|---------------|------------|
| [Beta] / ListItem | `ListItem` | skeleton(true|false) | - | - |
| Empty State | `EmptyState` | platform(desktop|touch) | illustration | - |
| EPriceGroup | `EPriceGroup` | size(m|l|L2), Сombining Elements(None|Discount + Old Price) | [EXP] Calculation, Plus Cashback, withBarometer, withDisclaimer, withFintech, withLabelDiscount, withPriceOld | - |
| EShopName | `EShopName` | size(xs|s|m|l|xl|xxl), weight(regular|medium|bold) | favicon, isOfficial | name |
| EThumb | `EThumb` | Ratio(Nested|1:1|2:3|3:2|3:4|4:3|9:16|16:9|Manual), Type(current-default|current-selected|EThumbGroup|New; feb-26) | Dot indicator, Favorite, Image Fill, Label, White BG | - |
| Image Gallery / Preview | `Image Gallery / Preview` | State(Default|Hover), View(Image|Overflow) | - | - |
| Image Gallery | `ImageGallery` | SIze(XL|L|M) | - | - |
| Info block | `InfoBlock` | platform(desktop|touch) | - | - |
| Line / Combo | `LineCombo` | Size(Line) | withDelivery | - |
| Line / Official Shop | `LineOfficialShop` | size(m|l) | - | - |
| PreviewGallery | `PreviewGallery` | platform(desktop|touch), posOverflow(right|both|left|none) | - | - |
| PreviewSingle | `PreviewSingle` | platform(touch|desktop) | - | - |
| ShopInfo-Bnpl | `ShopInfoBnpl` | size(xs|s|m) | first-child, second-child, third-child | - |
| Title | `Title` | Size(L|M|S|XS) | 1-Action, 2-Action, 3-Action, ACTION ICON, ADV Text Label, Chevron, Favicon, Grid | List Control, Subtitle | titleText |

### Organisms

| Figma Name | Inferred React Name | Variant Props | Boolean Props | Text Props |
|------------|-------------------|---------------|---------------|------------|
| AdvProductGallery | `AdvProductGallery` | fullWidth(false|true), platform(desktop|touch), screenWidth(-1252px|≥1252px) | overflow | - |
| EOfferItem | `EOfferItem` | platform(desktop|touch), type(offerMain|offerPrices) | Brand, Price Disclaimer, withButton, withData, withDelivery, withEcomMeta, withFavoritesButton, withFintech, withReviews, withTitle | organicTitle |
| EProductSnippetExp | `EProductSnippetExp` | state(resting|hovered|selected), type(product|product-promo|from-images|from-rhytm|skeleton|banner-promo) | - | SourceMeta, SourceName |
| EProductSpecs, EProductSpecsFull | `EProductSpecs` | platform(desktop|touch), wrapped(false|true) | - | - |
| EQuickFilters | `EQuickFilters` | filtered(false|true), platform(desktop|touch), type(wide|narrow) | filterBrand, filterPrice, overflowLeft, overflowRight, priceSort↑, priceSort↓, suggests | - |
| EShopItem | `EShopItem` | platform(desktop|touch) | withButton, withDelivery, withDisclaimer, withFavoritesButton, withFintech, withHostLink, withMeta, withReviews | organicText, organicTitle |
| ESnippet | `ESnippet` | image(none|group|single), platform(desktop|touch) | isOfficial, showKebab, withAddress, withButton, withData, withDelivery, withDeliveryBnpl, withFintech, withOnboarding, withPrice, withPromo, withQuotes, withReviews, withSitelinks | organicHost, organicPath, organicText, organicTitle |
| FuturisProductReview | `FuturisProductReview` | platform(desktop|touch), wrapped(false|true) | - | - |
| FuturisProductsChat | `FuturisProductsChat` | dialog(false|true), platform(desktop|touch) | - | - |
| InfoCard, Onboarding | `InfoCard` | feature(checkout|barometer), type(miniCardVertical-v1|miniCardVertical-v2|miniCardHorizontal|fullWidth-v1|fullWidth-v2) | - | - |
| ReviewSummarization | `ReviewSummarization` | platform(desktop|touch) | - | - |

### Section

| Figma Name | Inferred React Name | Variant Props | Boolean Props | Text Props |
|------------|-------------------|---------------|---------------|------------|
| FintechAlice | `FintechAlice` | Fintech(Alfa|PayBox|Split|PayCard|VTB|Ozon|WB) | - | - |

### Templates

| Figma Name | Inferred React Name | Variant Props | Boolean Props | Text Props |
|------------|-------------------|---------------|---------------|------------|
| EProductCard | `EProductCard` | platform(desktop|touch) | alice, avgPrice, defaultOffer, findCheaper, prices, specs, ugc | - |

## Graphics / Icons (not React components)

These are visual assets, not React components. They use a different import pattern.

| Figma Name | Variants |
|------------|----------|
| SkeletonElement | 2 |
| Graphic / Alfa-Bank | 6 |
| Graphic / Alfa-Pay | 2 |
| Graphic / BNPL / Dolyame | 5 |
| Graphic / BNPL / Mokka | 2 |
| Graphic / BNPL / MTS Pay | 5 |
| Graphic / BNPL / Plait | 5 |
| Graphic / BNPL / Plati Chastyami | 5 |
| Graphic / BNPL / Plus | 15 |
| Graphic / BNPL / Podeli | 5 |
| Graphic / BNPL / Sber | 3 |
| Graphic / BNPL / SBP | 5 |
| Graphic / BNPL / Split | 8 |
| Graphic / BNPL / T-Bank | 3 |
| Graphic / BNPL / Yandex Pay | 6 |
| Graphic / Robokassa | 2 |
| Graphic / T-Pay | 2 |
| Graphic / Various / Cursors | 4 |
| Graphic / Various / Ecom Favicon | 4 |
| Graphic / Various / Point | 3 |
| Graphic / Various / Range Line | 3 |
| Graphic / YandexPayNew | 24 |
| Graphic / Юkassa | 2 |
| Graphics / Illustration | 4 |
| Icon / ArrowLong Down | 4 |
| Icon / ArrowLong Up | 4 |
| Icon / Cargo | 3 |
| Icon / Cart | 6 |
| Icon / Comments | 6 |
| Icon / Crossborder | 6 |
| Icon / ItemGrid | 4 |
| Icon / ItemList | 4 |
| Icon / Lock | 6 |
| Icon / Multiplication | 6 |
| Icon / Official Shop | 6 |
| Icon / Purchases | 6 |
| Icon / Star | 11 |
| Icon / Van | 6 |
| Icon / Wallet | 6 |
| Mini Illustaration | 13 |
| TestFintech | 90 |
| Как сейчас | 90 |

## Full Import Reference

```typescript
// Confirmed imports (from Code Connect + user)
import { LabelGroup } from '@oceania/depot/components/LabelGroup';
import { ELabelRating } from '@oceania/depot/components/ELabelRating';
import { EPriceBarometer } from '@oceania/depot/components/EPriceBarometer';
import { EDeliveryGroup } from '@oceania/depot/components/EDeliveryGroup';
import { Line } from '@oceania/depot/components/Line';
import { EQuote } from '@oceania/depot/components/EQuote';
import { EProductSnippet2 } from '@oceania/depot/components/EProductSnippet2';

// Inferred imports (verify before use)
import { EProductTabs } from '@oceania/depot/components/EProductTabs'; // inferred
import { Favorite } from '@oceania/depot/components/Favorite'; // inferred
import { EBnpl } from '@oceania/depot/components/EBnpl'; // inferred
import { EButton } from '@oceania/depot/components/EButton'; // inferred
import { ELabelPlus } from '@oceania/depot/components/ELabelPlus'; // inferred
import { EMarketCheckoutLabel } from '@oceania/depot/components/EMarketCheckoutLabel'; // inferred
import { EPrice } from '@oceania/depot/components/EPrice'; // inferred
import { EPrice / Barometer Description } from '@oceania/depot/components/EPrice / Barometer Description'; // inferred
import { EPriceBarometerLegend } from '@oceania/depot/components/EPriceBarometerLegend'; // inferred
import { Fintech } from '@oceania/depot/components/Fintech'; // inferred
import { Image Overlay Controller } from '@oceania/depot/components/Image Overlay Controller'; // inferred
import { ImagePlaceholder } from '@oceania/depot/components/ImagePlaceholder'; // inferred
import { ImageRatio } from '@oceania/depot/components/ImageRatio'; // inferred
import { Label } from '@oceania/depot/components/Label'; // inferred
import { LabelDiscount } from '@oceania/depot/components/LabelDiscount'; // inferred
import { ListItem } from '@oceania/depot/components/ListItem'; // inferred
import { EmptyState } from '@oceania/depot/components/EmptyState'; // inferred
import { EPriceGroup } from '@oceania/depot/components/EPriceGroup'; // inferred
import { EShopName } from '@oceania/depot/components/EShopName'; // inferred
import { EThumb } from '@oceania/depot/components/EThumb'; // inferred
import { Image Gallery / Preview } from '@oceania/depot/components/Image Gallery / Preview'; // inferred
import { ImageGallery } from '@oceania/depot/components/ImageGallery'; // inferred
import { InfoBlock } from '@oceania/depot/components/InfoBlock'; // inferred
import { LineCombo } from '@oceania/depot/components/LineCombo'; // inferred
import { LineOfficialShop } from '@oceania/depot/components/LineOfficialShop'; // inferred
import { PreviewGallery } from '@oceania/depot/components/PreviewGallery'; // inferred
import { PreviewSingle } from '@oceania/depot/components/PreviewSingle'; // inferred
import { ShopInfoBnpl } from '@oceania/depot/components/ShopInfoBnpl'; // inferred
import { Title } from '@oceania/depot/components/Title'; // inferred
import { AdvProductGallery } from '@oceania/depot/components/AdvProductGallery'; // inferred
import { EOfferItem } from '@oceania/depot/components/EOfferItem'; // inferred
import { EProductSnippetExp } from '@oceania/depot/components/EProductSnippetExp'; // inferred
import { EProductSpecs } from '@oceania/depot/components/EProductSpecs'; // inferred
import { EQuickFilters } from '@oceania/depot/components/EQuickFilters'; // inferred
import { EShopItem } from '@oceania/depot/components/EShopItem'; // inferred
import { ESnippet } from '@oceania/depot/components/ESnippet'; // inferred
import { FuturisProductReview } from '@oceania/depot/components/FuturisProductReview'; // inferred
import { FuturisProductsChat } from '@oceania/depot/components/FuturisProductsChat'; // inferred
import { InfoCard } from '@oceania/depot/components/InfoCard'; // inferred
import { ReviewSummarization } from '@oceania/depot/components/ReviewSummarization'; // inferred
import { FintechAlice } from '@oceania/depot/components/FintechAlice'; // inferred
import { EProductCard } from '@oceania/depot/components/EProductCard'; // inferred
```
