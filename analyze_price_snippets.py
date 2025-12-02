#!/usr/bin/env python3
"""
Анализ сниппетов с ценой из iPhone 17 HTML.
Цена — главный признак сниппета для обработки.
"""

import re
from bs4 import BeautifulSoup
from pathlib import Path
from collections import Counter, defaultdict


def analyze_price_snippets(html_path: str):
    """Находит все типы сниппетов, содержащих цену."""
    
    print(f"📄 Загрузка файла: {html_path}")
    
    with open(html_path, 'r', encoding='utf-8') as f:
        html = f.read()
    
    print(f"📏 Размер HTML: {len(html):,} байт")
    
    soup = BeautifulSoup(html, 'html.parser')
    
    # Ищем все элементы с ценой (EPrice-Value содержит число)
    price_elements = soup.find_all(class_=re.compile(r'EPrice-Value|EPrice$'))
    print(f"\n💰 Найдено элементов с ценой: {len(price_elements)}")
    
    # Для каждой цены находим родительский контейнер-сниппет
    snippet_types = Counter()
    snippet_examples = defaultdict(list)
    
    # Известные классы-контейнеры сниппетов
    CONTAINER_PATTERNS = [
        r'EShopItem(?:_|\s|$)',
        r'EProductSnippet2(?:_|\s|$)',
        r'Organic_withOfferInfo',
        r'Organic(?:_|\s|$)',
        r'ESnippet(?:_|\s|$)',
        r'ProductTile-Item',
        r'AdvProductGalleryCard',  # реклама
        r'EntityCard(?:_|\s|$)',
    ]
    
    processed_containers = set()
    
    for price_el in price_elements:
        # Извлекаем значение цены
        price_text = price_el.get_text(strip=True)
        if not price_text or not re.search(r'\d', price_text):
            continue
        
        # Поднимаемся вверх по DOM, ищем контейнер-сниппет
        current = price_el.parent
        container = None
        container_class = None
        
        while current and current.name:
            classes = ' '.join(current.get('class', []))
            
            for pattern in CONTAINER_PATTERNS:
                if re.search(pattern, classes):
                    container = current
                    # Извлекаем базовый класс контейнера
                    match = re.search(pattern.replace(r'(?:_|\s|$)', ''), classes)
                    if match:
                        container_class = match.group(0)
                    else:
                        container_class = classes.split()[0] if classes else current.name
                    break
            
            if container:
                break
            current = current.parent
        
        if container and id(container) not in processed_containers:
            processed_containers.add(id(container))
            snippet_types[container_class] += 1
            
            # Сохраняем пример
            if len(snippet_examples[container_class]) < 3:
                # Извлекаем данные примера
                title_el = container.find(class_=re.compile(r'Title'))
                title = title_el.get_text(strip=True)[:50] if title_el else "?"
                
                shop_el = container.find(class_=re.compile(r'ShopName|Shop'))
                shop = shop_el.get_text(strip=True)[:30] if shop_el else "?"
                
                snippet_examples[container_class].append({
                    'price': price_text,
                    'title': title,
                    'shop': shop,
                    'classes': ' '.join(container.get('class', []))[:80]
                })
    
    # Выводим результаты
    print("\n" + "="*80)
    print("📊 ТИПЫ СНИППЕТОВ С ЦЕНОЙ")
    print("="*80)
    
    for container_class, count in snippet_types.most_common():
        is_ad = 'Adv' in container_class
        status = "⛔ РЕКЛАМА" if is_ad else "✅"
        
        print(f"\n{status} {container_class}: {count} сниппетов")
        
        for idx, example in enumerate(snippet_examples[container_class], 1):
            print(f"   Пример {idx}:")
            print(f"      Цена: {example['price']}")
            print(f"      Товар: {example['title']}...")
            print(f"      Магазин: {example['shop']}")
    
    # Проверяем Organic_withOfferInfo отдельно
    print("\n" + "="*80)
    print("🔍 ДЕТАЛЬНЫЙ АНАЛИЗ: Organic_withOfferInfo")
    print("="*80)
    
    organic_snippets = soup.find_all(class_=re.compile(r'Organic_withOfferInfo'))
    print(f"Найдено: {len(organic_snippets)}")
    
    for idx, snippet in enumerate(organic_snippets[:5], 1):
        print(f"\n--- Organic_withOfferInfo #{idx} ---")
        
        classes = ' '.join(snippet.get('class', []))
        print(f"Классы: {classes[:100]}")
        
        # Название
        title_el = snippet.find(class_=re.compile(r'OrganicTitle|Title'))
        if title_el:
            print(f"📝 Заголовок: {title_el.get_text(strip=True)[:60]}...")
        
        # Цена
        price_el = snippet.find(class_=re.compile(r'EPrice-Value'))
        if price_el:
            print(f"💰 Цена: {price_el.get_text(strip=True)}")
        
        # Магазин
        shop_el = snippet.find(class_=re.compile(r'EShopName|Path'))
        if shop_el:
            print(f"🏪 Магазин/Путь: {shop_el.get_text(strip=True)[:40]}")
        
        # Изображение
        img_el = snippet.find('img')
        if img_el:
            src = img_el.get('src', '')[:50]
            print(f"🖼️ Изображение: {src}...")
        
        # Компоненты внутри
        components = []
        component_names = ['EPriceGroup', 'EPriceBarometer', 'EDeliveryGroup', 'Fintech', 'EBnpl', 'LabelDiscount']
        for comp in component_names:
            if snippet.find(class_=re.compile(rf'{comp}')):
                components.append(comp)
        if components:
            print(f"🧩 Компоненты: {', '.join(components)}")
    
    # Сводка
    print("\n" + "="*80)
    print("📋 СВОДКА: СНИППЕТЫ ДЛЯ ОБРАБОТКИ")
    print("="*80)
    
    total_valid = 0
    print("\n✅ Включить в обработку:")
    for container_class, count in snippet_types.most_common():
        if 'Adv' not in container_class:
            total_valid += count
            print(f"   - {container_class}: {count}")
    
    print(f"\n📊 Итого сниппетов с ценой для обработки: {total_valid}")
    
    print("\n⛔ Исключить (реклама):")
    for container_class, count in snippet_types.most_common():
        if 'Adv' in container_class:
            print(f"   - {container_class}: {count}")
    
    # Проверяем текущую конфигурацию SNIPPET_CONTAINER_NAMES
    print("\n" + "="*80)
    print("⚙️ РЕКОМЕНДАЦИИ ПО КОНФИГУ")
    print("="*80)
    
    current_config = ['EShopItem', 'ESnippet', 'EProductSnippet2']
    found_types = [c for c in snippet_types.keys() if 'Adv' not in c]
    
    missing = [t for t in found_types if t not in current_config]
    if missing:
        print(f"\n❗ Отсутствуют в SNIPPET_CONTAINER_NAMES:")
        for m in missing:
            print(f"   + '{m}'")
    
    print(f"\n📝 Рекомендуемый SNIPPET_CONTAINER_NAMES:")
    all_valid = sorted(set(current_config + [t for t in found_types if t not in current_config]))
    print(f"   {all_valid}")


if __name__ == "__main__":
    html_path = "/Users/shchuchkin/Documents/GitHub/fluffy-chainsaw/examples/iphone17.html"
    
    if not Path(html_path).exists():
        print(f"❌ Файл не найден: {html_path}")
        exit(1)
    
    analyze_price_snippets(html_path)

