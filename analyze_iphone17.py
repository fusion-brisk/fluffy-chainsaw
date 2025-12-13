#!/usr/bin/env python3
"""
Анализ HTML-файла iPhone 17 для поиска новых типов сниппетов.
Ищем классы, которых нет в текущей реализации парсера.
"""

import re
from bs4 import BeautifulSoup
from pathlib import Path
from collections import Counter

# Известные типы контейнеров сниппетов
KNOWN_CONTAINERS = [
    'EShopItem', 'ESnippet', 'EProductSnippet2', 
    'Organic', 'Organic_withOfferInfo',
    'AdvProductGalleryCard'  # Реклама - пропускаем
]

# Известные компоненты внутри сниппетов
KNOWN_COMPONENTS = [
    'EPriceGroup', 'EPrice', 'LabelDiscount', 'ELabelRating',
    'EShopName', 'OfficialShop', 'EDeliveryGroup', 'EPriceBarometer',
    'Fintech', 'EBnpl', 'EMarketCheckoutLabel', 'Sitelinks',
    'OrganicUgcReviews', 'CoveredPhone', 'PromoOffer'
]

CHECKOUT_MARKERS = {
    # The most reliable checkout marker used in snippet-parser.ts
    "data-market-url-type": "market_checkout",
    # Common classes used in snippet-parser.ts
    "classes": [
        "MarketCheckout-Button",
        "EMarketCheckoutButton-Container",
        "EMarketCheckoutButton-Button",
        "EMarketCheckoutLabel",
        "EThumb-LabelsCheckoutContainer",
        "Organic-Checkout",
        "Button_view_primary",
        "Button_view_white",
        "Button_view_default",
    ],
    # Common href patterns used in snippet-parser.ts
    "href_contains": [
        "/cart",
        "/express",
        "market.yandex.ru/my/cart",
        "checkout.kit.yandex.ru/express",
    ],
    # Common id prefix used in snippet-parser.ts
    "id_prefixes": [
        "MarketCheckoutButtonBase__",
    ],
    # UI copy fallback used in snippet-parser.ts
    "text_contains": [
        "Купить в 1 клик",
    ],
}


def _get_class_list(tag) -> list:
    try:
        cls = tag.get("class", [])
        return cls if isinstance(cls, list) else [str(cls)]
    except Exception:
        return []


def _class_str(tag, limit: int = 120) -> str:
    s = " ".join(_get_class_list(tag)).strip()
    if len(s) > limit:
        return s[:limit] + "..."
    return s


def _find_nearest_container(tag):
    """Walk up to nearest known snippet container by class string."""
    cur = tag
    while cur is not None and getattr(cur, "name", None) is not None:
        classes = " ".join(_get_class_list(cur))
        for c in KNOWN_CONTAINERS:
            if c in classes:
                return c, cur
        cur = cur.parent
    return None, None


def analyze_checkout_buttons(soup, max_examples: int = 12):
    """Analyze checkout-related markers in iphone17.html for debugging snippet-parser.ts."""
    print("\n" + "=" * 80)
    print("🛒 CHECKOUT BUTTONS / LABELS ANALYSIS (iphone17.html)")
    print("=" * 80)

    # 1) data-market-url-type="market_checkout"
    checkout_by_data = soup.find_all(attrs={"data-market-url-type": CHECKOUT_MARKERS["data-market-url-type"]})
    print(f"\n1) [data-market-url-type=\"{CHECKOUT_MARKERS['data-market-url-type']}\"] найдено: {len(checkout_by_data)}")
    for idx, el in enumerate(checkout_by_data[:max_examples]):
        container_type, container = _find_nearest_container(el)
        href = el.get("href", "") if hasattr(el, "get") else ""
        text = el.get_text(strip=True) if hasattr(el, "get_text") else ""
        print(f"  - #{idx+1}: <{el.name}> container={container_type or 'N/A'} class='{_class_str(el)}' href='{href[:80]}' text='{text[:60]}'")

    # 2) id prefixes (MarketCheckoutButtonBase__)
    id_prefix = CHECKOUT_MARKERS["id_prefixes"][0]
    checkout_by_id = soup.find_all(id=re.compile(rf"^{re.escape(id_prefix)}"))
    print(f"\n2) [id^=\"{id_prefix}\"] найдено: {len(checkout_by_id)}")
    for idx, el in enumerate(checkout_by_id[:max_examples]):
        container_type, _ = _find_nearest_container(el)
        print(f"  - #{idx+1}: <{el.name}> container={container_type or 'N/A'} id='{str(el.get('id', ''))[:80]}' class='{_class_str(el)}'")

    # 3) Class markers (presence-based)
    print("\n3) Маркеры по классам (presence):")
    for cls in CHECKOUT_MARKERS["classes"]:
        # Exact class is safest (matches our parser intent best),
        # but many YM classes are BEM-like and may appear with modifiers.
        exact = soup.find_all(class_=re.compile(rf"(^|\s){re.escape(cls)}(\s|$)"))
        partial = soup.find_all(class_=re.compile(re.escape(cls)))
        print(f"  - {cls}: exact={len(exact)}, partial={len(partial)}")

    # 4) href contains
    print("\n4) Ссылки, похожие на checkout (href contains):")
    href_hits = []
    for a in soup.find_all("a"):
        href = a.get("href", "") or ""
        for needle in CHECKOUT_MARKERS["href_contains"]:
            if needle in href:
                href_hits.append((needle, href, a))
                break
    print(f"  найдено ссылок: {len(href_hits)}")
    for idx, (needle, href, a) in enumerate(href_hits[:max_examples]):
        container_type, _ = _find_nearest_container(a)
        text = a.get_text(strip=True)
        print(f"  - #{idx+1}: needle='{needle}' container={container_type or 'N/A'} href='{href[:90]}' text='{text[:50]}' class='{_class_str(a)}'")

    # 5) Text contains "Купить в 1 клик"
    # We do a cheap scan: find Button-Text nodes and check text.
    text_hits = []
    for el in soup.find_all(class_=re.compile(r"Button-Text")):
        t = el.get_text(strip=True)
        if any(s in t for s in CHECKOUT_MARKERS["text_contains"]):
            text_hits.append(el)
    print(f"\n5) Текстовые маркеры (Button-Text содержит {CHECKOUT_MARKERS['text_contains']}): {len(text_hits)}")
    for idx, el in enumerate(text_hits[:max_examples]):
        container_type, _ = _find_nearest_container(el)
        print(f"  - #{idx+1}: container={container_type or 'N/A'} text='{el.get_text(strip=True)[:80]}' class='{_class_str(el)}'")

    # 6) Container-level coverage summary: does each container have checkout/label/organic-checkout?
    print("\n6) Сводка по контейнерам: наличие checkout/label/Organic-Checkout")
    container_selector = re.compile(r"(EProductSnippet2|Organic_withOfferInfo|Organic|EShopItem)")
    containers = soup.find_all(class_=container_selector)

    def has_marker(container_tag, marker_cls: str) -> bool:
        # check class of container itself or any child
        if marker_cls in " ".join(_get_class_list(container_tag)):
            return True
        return container_tag.find(class_=re.compile(re.escape(marker_cls))) is not None

    summary = Counter()
    examples = { "checkout": [], "label": [], "organic_checkout": [] }

    for c in containers:
        classes = " ".join(_get_class_list(c))
        # Pick an inferred container type (best effort)
        ctype = None
        for t in ["EShopItem", "EProductSnippet2", "Organic_withOfferInfo", "Organic"]:
            if t in classes:
                ctype = t
                break
        if not ctype:
            continue

        # Markers aligned with snippet-parser.ts logic
        has_label = has_marker(c, "EMarketCheckoutLabel") or has_marker(c, "EThumb-LabelsCheckoutContainer")
        has_organic_checkout = has_marker(c, "Organic-Checkout")
        has_data_checkout = c.find(attrs={"data-market-url-type": CHECKOUT_MARKERS["data-market-url-type"]}) is not None
        has_primary_btn = c.find(class_=re.compile(r"Button_view_primary")) is not None
        has_checkout = has_label or has_organic_checkout or has_data_checkout or has_primary_btn

        summary[(ctype, "total")] += 1
        if has_checkout:
            summary[(ctype, "has_checkout")] += 1
            if len(examples["checkout"]) < 6:
                examples["checkout"].append((ctype, _class_str(c, 140)))
        if has_label:
            summary[(ctype, "has_label")] += 1
            if len(examples["label"]) < 6:
                examples["label"].append((ctype, _class_str(c, 140)))
        if has_organic_checkout:
            summary[(ctype, "has_organic_checkout")] += 1
            if len(examples["organic_checkout"]) < 6:
                examples["organic_checkout"].append((ctype, _class_str(c, 140)))

    for t in ["EProductSnippet2", "Organic_withOfferInfo", "Organic", "EShopItem"]:
        total = summary[(t, "total")]
        if total == 0:
            continue
        print(
            f"  - {t}: total={total}, "
            f"has_checkout={summary[(t, 'has_checkout')]}, "
            f"has_label={summary[(t, 'has_label')]}, "
            f"has_organic_checkout={summary[(t, 'has_organic_checkout')]}"
        )

    if examples["checkout"]:
        print("\n  Примеры контейнеров с checkout-маркерами:")
        for ctype, ccls in examples["checkout"]:
            print(f"   - {ctype}: class='{ccls}'")


def analyze_html(html_path: str):
    """Анализирует HTML и находит новые типы сниппетов и компонентов."""
    
    print(f"📄 Загрузка файла: {html_path}")
    
    with open(html_path, 'r', encoding='utf-8') as f:
        html = f.read()
    
    print(f"📏 Размер HTML: {len(html):,} байт ({len(html)/1024/1024:.2f} MB)")
    
    soup = BeautifulSoup(html, 'html.parser')
    
    # 1. Собираем все уникальные классы с префиксами E* (компоненты Yandex)
    all_classes = Counter()
    for el in soup.find_all(class_=True):
        for cls in el.get('class', []):
            # Интересуют классы, начинающиеся с E (EShopItem, EPrice и т.д.)
            if cls.startswith('E') or 'Snippet' in cls or 'Product' in cls:
                all_classes[cls] += 1
    
    print("\n" + "="*80)
    print("🔍 КЛАССЫ-КОМПОНЕНТЫ (E* и *Snippet*)")
    print("="*80)
    
    # Группируем по корневому имени (до первого _ или -)
    grouped = {}
    for cls, count in all_classes.most_common():
        # Извлекаем базовое имя
        base = cls.split('_')[0].split('-')[0]
        if base not in grouped:
            grouped[base] = []
        grouped[base].append((cls, count))
    
    for base, variants in sorted(grouped.items(), key=lambda x: -sum(v[1] for v in x[1])):
        total = sum(v[1] for v in variants)
        is_known = any(k in base for k in KNOWN_COMPONENTS + KNOWN_CONTAINERS)
        status = "✅" if is_known else "❌ NEW"
        
        print(f"\n{status} {base} (total: {total})")
        for cls, cnt in sorted(variants, key=lambda x: -x[1])[:10]:
            print(f"    - {cls}: {cnt}")
    
    # 2. Находим контейнеры сниппетов
    print("\n" + "="*80)
    print("📦 КОНТЕЙНЕРЫ СНИППЕТОВ")
    print("="*80)
    
    containers = []
    for container_name in KNOWN_CONTAINERS:
        found = soup.find_all(class_=re.compile(rf'^{container_name}(?:_|\s|$)'))
        if found:
            containers.extend(found)
            print(f"  ✅ {container_name}: {len(found)}")
        else:
            # Проверяем частичное совпадение
            found_partial = soup.find_all(class_=re.compile(rf'{container_name}'))
            if found_partial:
                containers.extend(found_partial)
                print(f"  ⚠️ {container_name} (partial): {len(found_partial)}")
    
    # 3. Ищем потенциально новые контейнеры сниппетов
    print("\n" + "="*80)
    print("🔎 ПОТЕНЦИАЛЬНО НОВЫЕ КОНТЕЙНЕРЫ")
    print("="*80)
    
    # Ищем элементы с атрибутами, характерными для сниппетов
    potential_new = []
    
    # Ищем по data-атрибутам
    for el in soup.find_all(attrs={'data-cid': True}):
        classes = ' '.join(el.get('class', []))
        if not any(k in classes for k in KNOWN_CONTAINERS):
            potential_new.append((classes[:80], el.name))
    
    # Ищем по структуре (элементы с ценой и изображением)
    for el in soup.find_all(class_=re.compile(r'Price|Image|Title')):
        parent = el.parent
        if parent:
            parent_classes = ' '.join(parent.get('class', []))
            if not any(k in parent_classes for k in KNOWN_CONTAINERS) and 'Adv' not in parent_classes:
                if parent_classes and len(parent_classes) < 100:
                    potential_new.append((parent_classes, parent.name))
    
    # Выводим уникальные
    unique_new = set(potential_new)
    for classes, tag in sorted(unique_new)[:30]:
        print(f"  ❓ <{tag}> class='{classes}'")
    
    # 4. Анализируем конкретные сниппеты для маппинга
    print("\n" + "="*80)
    print("📊 ДЕТАЛЬНЫЙ АНАЛИЗ СНИППЕТОВ (первые 5)")
    print("="*80)
    
    for idx, container in enumerate(containers[:5]):
        print(f"\n--- Сниппет #{idx+1} ---")
        container_class = ' '.join(container.get('class', []))[:60]
        print(f"Класс: {container_class}...")
        
        # Название товара
        title_el = container.find(class_=re.compile(r'Title'))
        if title_el:
            print(f"  📝 Title: {title_el.get_text(strip=True)[:50]}...")
        
        # Цена
        price_el = container.find(class_=re.compile(r'Price.*Value|Price$'))
        if price_el:
            print(f"  💰 Price: {price_el.get_text(strip=True)}")
        
        # Магазин
        shop_el = container.find(class_=re.compile(r'ShopName|Shop'))
        if shop_el:
            print(f"  🏪 Shop: {shop_el.get_text(strip=True)[:30]}...")
        
        # Изображение
        img_el = container.find('img')
        if img_el:
            src = img_el.get('src', img_el.get('data-src', ''))[:60]
            print(f"  🖼️ Image: {src}...")
        
        # Вложенные компоненты
        components = []
        for comp in KNOWN_COMPONENTS:
            found = container.find(class_=re.compile(rf'{comp}'))
            if found:
                components.append(comp)
        if components:
            print(f"  🧩 Components: {', '.join(components)}")
        
        # Неизвестные компоненты (E*)
        unknown = []
        for el in container.find_all(class_=True):
            for cls in el.get('class', []):
                if cls.startswith('E') and not any(k in cls for k in KNOWN_COMPONENTS + KNOWN_CONTAINERS):
                    base = cls.split('_')[0].split('-')[0]
                    if base not in unknown:
                        unknown.append(base)
        if unknown:
            print(f"  ❓ Unknown E-components: {', '.join(unknown[:10])}")

    # 5. Ищем совершенно новые типы сниппетов
    print("\n" + "="*80)
    print("🆕 ПОИСК НОВЫХ ТИПОВ СНИППЕТОВ")
    print("="*80)
    
    # Паттерн для поиска классов вида "XXXSnippet" или "EXxx" которые могут быть контейнерами
    snippet_pattern = re.compile(r'\b(E[A-Z][a-zA-Z0-9]+|[A-Z][a-zA-Z]+Snippet[0-9]*)\b')
    
    potential_snippets = Counter()
    for el in soup.find_all(class_=True):
        for cls in el.get('class', []):
            matches = snippet_pattern.findall(cls)
            for m in matches:
                # Фильтруем известные
                if not any(k in m for k in KNOWN_CONTAINERS + KNOWN_COMPONENTS):
                    potential_snippets[m] += 1
    
    print("\nПотенциально новые типы (топ-30):")
    for cls, cnt in potential_snippets.most_common(30):
        print(f"  ❓ {cls}: {cnt}")


if __name__ == "__main__":
    html_path = "/Users/shchuchkin/Documents/GitHub/fluffy-chainsaw/examples/iphone17.html"
    
    if not Path(html_path).exists():
        print(f"❌ Файл не найден: {html_path}")
        exit(1)
    
    analyze_html(html_path)

    # Extra: checkout buttons / labels analysis aligned with snippet-parser.ts
    try:
        with open(html_path, 'r', encoding='utf-8') as f:
            soup = BeautifulSoup(f.read(), 'html.parser')
        analyze_checkout_buttons(soup)
    except Exception as e:
        print(f"❌ Ошибка анализа checkout-кнопок: {e}")

