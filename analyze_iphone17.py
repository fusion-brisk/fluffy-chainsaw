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

