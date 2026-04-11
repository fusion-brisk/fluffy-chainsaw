# Component Map Coverage Report

> Generated: 2026-04-11T08:25:27.473Z
> Library: DC · Ecom (`x8INBftMZ21bme9kwZDu1A`)

## 1. Code Key Validation

Checking all component keys from `component-map.ts` against the library:

| Status | Code Name | Key (16 chars) | Context | Library Match |
|--------|-----------|----------------|---------|---------------|
| OK | ESnippet (Desktop) | `17bada92cf531668` | SNIPPET_COMPONENT_MAP | ESnippet / platform=desktop, image=none |
| OK | ESnippet (Touch) | `fd4c85bc57a4b46b` | SNIPPET_COMPONENT_MAP | ESnippet / platform=touch, image=single |
| OK | EOfferItem (Desktop) | `ad30904f3637a4c1` | SNIPPET_COMPONENT_MAP | EOfferItem / platform=desktop, type=offerPrices |
| OK | EOfferItem (Touch) | `09f5630474c44e65` | SNIPPET_COMPONENT_MAP | EOfferItem / platform=touch, type=offerPrices |
| OK | EShopItem (Desktop) | `a209c6636b3fa7c2` | SNIPPET_COMPONENT_MAP | EShopItem / platform=desktop |
| OK | EShopItem (Touch) | `b1c1848c5454036c` | SNIPPET_COMPONENT_MAP | EShopItem / platform=touch |
| OK | EProductSnippet2 | `f921fc66ed6f56cc` | SNIPPET_COMPONENT_MAP | EProductSnippet2 / type=organic, selected=false |
| STALE | Header | `6cea05769f0320a0` | LAYOUT_COMPONENT_MAP | _not found_ |
| STALE | Related | `e8b88751731dfbe9` | LAYOUT_COMPONENT_MAP | _not found_ |
| STALE | Pager | `074d6f70fff0d97e` | LAYOUT_COMPONENT_MAP | _not found_ |
| STALE | Footer (Desktop) | `613e88ddf7078ead` | LAYOUT_COMPONENT_MAP | _not found_ |
| STALE | Footer (Touch) | `b9a5b3a68ea666aa` | LAYOUT_COMPONENT_MAP | _not found_ |
| OK | Title | `b49cc069e0de9428` | LAYOUT_COMPONENT_MAP | Title / Size=M |
| STALE | FilterButton (set) | `af9d11ebc792f3fb` | FILTER_COMPONENTS | _not found_ |
| STALE | FilterButton (variant) | `c3162fdf2f6fc1fb` | FILTER_COMPONENTS | _not found_ |
| STALE | QuickFilterButton (set) | `a7ca09ed0f1e27d8` | FILTER_COMPONENTS | _not found_ |
| STALE | QuickFilterButton (variant) | `3729962e75d05135` | FILTER_COMPONENTS | _not found_ |
| OK | SectionTitle (set) | `cd47767eeadd9168` | ASIDE_FILTER_COMPONENTS | SET: Title |
| STALE | EnumFilterItem (set) | `9a6666cffa6a4bd5` | ASIDE_FILTER_COMPONENTS | _not found_ |
| STALE | CategoryItem (set) | `5da09ab6d1f513d6` | ASIDE_FILTER_COMPONENTS | _not found_ |
| STALE | NumberInput (set) | `c3a1d52c5f471c2b` | ASIDE_FILTER_COMPONENTS | _not found_ |
| OK | EThumb (set) | `8faefce0c971aee2` | ETHUMB_CONFIG | SET: EThumb |
| OK | EThumb (Manual variant) | `931437402c9c36dd` | ETHUMB_CONFIG | EThumb / Type=New; feb-26, Ratio=Manual |
| STALE | Background/Primary | `cc3c77fb5e00f762` | PAINT_STYLE_KEYS | _not found_ |
| STALE | Background/Overflow | `b43d617320789eba` | PAINT_STYLE_KEYS | _not found_ |

## 2. Stale Keys (need update)

**14 keys in code are NOT found in the library:**

- `6cea05769f0320a02cce6ce168573daa75395308` — **Header** (LAYOUT_COMPONENT_MAP)
- `e8b88751731dfbe91a6951472ae0233f07c5c32a` — **Related** (LAYOUT_COMPONENT_MAP)
- `074d6f70fff0d97ec766385cf475ae43b70e9356` — **Pager** (LAYOUT_COMPONENT_MAP)
- `613e88ddf7078ead49e2573bae4929880bf3e770` — **Footer (Desktop)** (LAYOUT_COMPONENT_MAP)
- `b9a5b3a68ea666aae0cb1b0c6f27500fda95d0b6` — **Footer (Touch)** (LAYOUT_COMPONENT_MAP)
- `af9d11ebc792f3fb6cef88babe0f092c6b8fd589` — **FilterButton (set)** (FILTER_COMPONENTS)
- `c3162fdf2f6fc1fb2252d14d73288265151d5b51` — **FilterButton (variant)** (FILTER_COMPONENTS)
- `a7ca09ed0f1e27d8b6bb038d6f91fa100f40b1bf` — **QuickFilterButton (set)** (FILTER_COMPONENTS)
- `3729962e75d05135920ef313930f59ecd45e8bd5` — **QuickFilterButton (variant)** (FILTER_COMPONENTS)
- `9a6666cffa6a4bd51a72be430526e517e33ef8fa` — **EnumFilterItem (set)** (ASIDE_FILTER_COMPONENTS)
- `5da09ab6d1f513d699940e507379e254dbaf1ea7` — **CategoryItem (set)** (ASIDE_FILTER_COMPONENTS)
- `c3a1d52c5f471c2b55307225ae4350953826c781` — **NumberInput (set)** (ASIDE_FILTER_COMPONENTS)
- `cc3c77fb5e00f762a4950a9fb73a82819c3408b9` — **Background/Primary** (PAINT_STYLE_KEYS)
- `b43d617320789eba79aed9086a546e7cacb2fee8` — **Background/Overflow** (PAINT_STYLE_KEYS)

> These keys may have changed after a component was republished. Re-fetch from the library.

## 3. Unmapped Library Components

Component sets in the library that are NOT referenced in `component-map.ts`:

### Atoms (19 unmapped)

| Name | Set Key (16) | Variants | Properties |
|------|-------------|----------|------------|
| Control / EProductTabs | `cfd6056764d8ac0a` | 2 | State |
| Control / Favorite | `cbf43672a1023ab7` | 3 | State |
| EBnpl | `3187b1020fc4459d` | 30 | size, type |
| EButton | `d114ec46803a4905` | 8 | size, view |
| ELabelGroup | `64a4f1e3450f7753` | 4 | Label Order Variant |
| ELabelPlus | `3a9ad6ffab0da584` | 8 | Mode, Size, Value |
| ELabelRating | `5c1d3fe8f97d7cdb` | 60 | size, view, weight |
| EMarketCheckoutLabel | `1761aeb672923d7c` | 12 | Size, View |
| EPrice | `734a311660904f8b` | 30 | size, view, weight |
| EPrice / Barometer Description | `ef725e91853269d8` | 3 | Variant |
| EPriceBarometer | `901a0be0640b4dbd` | 24 | isCompact, size, theme, view |
| EPriceBarometerLegend | `1ef30b962be626fa` | 2 | Сollapsed |
| Fintech | `938c922fa93e5c3c` | 90 | size, type, view |
| Image Overlay Controller | `87f45dfb06913532` | 6 | Padding, Type |
| Image Placeholder | `b3a12009da25baed` | 14 | Size |
| Image Ratio | `af3a1fb1f2d02dbe` | 8 | Ratio |
| Label | `add5e3c94f3c27df` | 105 | size, view, weight |
| LabelDiscount | `7a49d5a998b1dc63` | 25 | size, view |
| SkeletonElement | `30348d5e776424f5` | 2 | animState |

### Graphics (39 unmapped)

| Name | Set Key (16) | Variants | Properties |
|------|-------------|----------|------------|
| Graphic / Alfa-Bank | `7f37465cc1abf288` | 6 | Filled, Size, View |
| Graphic / Alfa-Pay | `af2c228b41f27112` | 2 | Size, View |
| Graphic / BNPL / Dolyame | `79dbc31acdb62250` | 5 | Size, View |
| Graphic / BNPL / Mokka | `6838b31c0253719f` | 2 | Size, View |
| Graphic / BNPL / MTS Pay | `b2e701ba87a3695d` | 5 | Size, View |
| Graphic / BNPL / Plait | `6cd30ad495079263` | 5 | Size, View |
| Graphic / BNPL / Plati Chastyami | `17f74165f6d0abdf` | 5 | Size, View |
| Graphic / BNPL / Plus | `5e9b895f568cbf16` | 15 | Color, Size |
| Graphic / BNPL / Podeli | `01dec7a2ec3c1b77` | 5 | Size, View |
| Graphic / BNPL / Sber | `e31ae2f28d42dd3a` | 3 | Size, View |
| Graphic / BNPL / SBP | `93cd25a876da35bf` | 5 | Size, View |
| Graphic / BNPL / Split | `77659ffb991aaa16` | 8 | Size, View |
| Graphic / BNPL / T-Bank | `07294d3b0857cfbb` | 3 | Size, View |
| Graphic / BNPL / Yandex Pay | `696fd40abb8735f3` | 6 | Size, View |
| Graphic / Robokassa | `552181b3d33b8f4d` | 2 | Size, View |
| Graphic / T-Pay | `869b4418448aca2a` | 2 | Size, View |
| Graphic / Various / Cursors | `4b3e86add5edf190` | 4 | Type |
| Graphic / Various / Ecom Favicon | `be871d9f9e0c4294` | 4 | Size, View |
| Graphic / Various / Point | `4f1c24922aba2851` | 3 | Variant |
| Graphic / Various / Range Line | `311fc049a051579f` | 3 | Variant |
| Graphic / YandexPayNew | `c6279c284162b696` | 24 | color, lang, size |
| Graphic / Юkassa | `c666cb55d3388387` | 2 | Size, View |
| Graphics / Illustration | `4b8dfa4b63aaae43` | 4 | Type |
| Icon / ArrowLong Down | `af1e9f932cad24ba` | 4 | Fill, Size |
| Icon / ArrowLong Up | `2f2757352c3c2211` | 4 | Fill, Size |
| Icon / Cargo | `b8600ac90e5d3f99` | 3 | size |
| Icon / Cart | `4a90158b7de25576` | 6 | Size |
| Icon / Comments | `b325afe78ca1e2c0` | 6 | Size |
| Icon / Crossborder | `191e641fe2e78fd3` | 6 | Size |
| Icon / ItemGrid | `57b0a79dc7372dbc` | 4 | Fill, Size |
| Icon / ItemList | `fb852c26bc0e9c75` | 4 | Fill, Size |
| Icon / Lock | `e22ff2e166571e77` | 6 | Size |
| Icon / Multiplication | `e50fef371a24a3b2` | 6 | Size |
| Icon / Official Shop | `773c8d159cdaec0e` | 6 | Size |
| Icon / Purchases | `39f2b38455a1d6f7` | 6 | Size |
| Icon / Star | `4a43adfa1145a3e6` | 11 | Fill, Size |
| Icon / Van | `7ea3c18059d7f36c` | 6 | Size |
| Icon / Wallet | `4a6e08e070bf77e3` | 6 | Size |
| Mini Illustaration | `1dc8e0bbbf31e394` | 13 | Variant |

### Molecules (15 unmapped)

| Name | Set Key (16) | Variants | Properties |
|------|-------------|----------|------------|
| [Beta] / ListItem | `f87cf724851aab6b` | 2 | skeleton |
| EDeliveryGroup | `14b22661c666d3c9` | 7 | abroad, size |
| Empty State | `b51e56378ac76e39` | 2 | platform |
| EPriceGroup | `90f26a9468b99cc5` | 5 | size, Сombining Elements |
| EShopName | `f3c1ebef0cf18512` | 12 | size, weight |
| Image Gallery / Preview | `31d48aaf3cefe5ca` | 4 | State, View |
| Image Gallery | `57eff0fbe1a75bdf` | 3 | SIze |
| Info block | `81bd255e5103a5f6` | 2 | platform |
| Line | `a57c4be711e225fd` | 8 | size, textStyle |
| Line / Combo | `f9c30b37fa48af0b` | 1 | Size |
| Line / EQuote | `1455429345c136c2` | 2 | size |
| Line / Official Shop | `0bca28e4891c5e09` | 2 | size |
| PreviewGallery | `3cc78d7f7db84313` | 7 | platform, posOverflow |
| PreviewSingle | `75426e3499bf1da4` | 2 | platform |
| ShopInfo-Bnpl | `79718d224067e2a9` | 3 | size |

### Organisms (8 unmapped)

| Name | Set Key (16) | Variants | Properties |
|------|-------------|----------|------------|
| AdvProductGallery | `bd498bf39e896fbe` | 5 | fullWidth, platform, screenWidth |
| EProductSnippetExp | `686d259e95227248` | 18 | state, type |
| EProductSpecs, EProductSpecsFull | `7da7f674771a376f` | 4 | platform, wrapped |
| EQuickFilters | `54fe3a8d49af9087` | 8 | filtered, platform, type |
| FuturisProductReview | `6ec13d47921c5283` | 4 | platform, wrapped |
| FuturisProductsChat | `947172ffe57bf729` | 4 | dialog, platform |
| InfoCard, Onboarding | `5ce4fb4f7f5c7d34` | 6 | feature, type |
| ReviewSummarization | `635d1640777da601` | 2 | platform |

### Section (3 unmapped)

| Name | Set Key (16) | Variants | Properties |
|------|-------------|----------|------------|
| FintechAlice | `9ed68be5e00d151c` | 7 | Fintech |
| TestFintech | `5b7a10e39882d10d` | 90 | size, type, view |
| Как сейчас | `2408d2d183407359` | 90 | size, type, view |

### Templates (1 unmapped)

| Name | Set Key (16) | Variants | Properties |
|------|-------------|----------|------------|
| EProductCard | `fdb83fe5b0732a1d` | 2 | platform |

## 4. Summary

| Metric | Count |
|--------|-------|
| Library component sets | 91 |
| Library total variants | 993 |
| Code keys checked | 25 |
| Valid keys | 11 |
| Stale keys | 14 |
| Unmapped component sets | 85 |
| Set coverage | 6.6% |
