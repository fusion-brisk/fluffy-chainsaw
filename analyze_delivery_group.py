#!/usr/bin/env python3
"""
Анализ HTML для поиска EDeliveryGroup и EDeliveryGroup-Item
"""

import re
from bs4 import BeautifulSoup

file_path = '/Users/shchuchkin/Downloads/кофеварка — Яндекс.html'

try:
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    print(f"✅ Файл загружен, размер: {len(content)} символов")
    
    soup = BeautifulSoup(content, 'html.parser')
    
    # 1. Находим все EDeliveryGroup
    delivery_groups = soup.find_all(class_=re.compile(r'EDeliveryGroup'))
    print(f"\n📦 Найдено элементов с классом EDeliveryGroup: {len(delivery_groups)}")
    
    if delivery_groups:
        unique_classes = set()
        for el in delivery_groups[:10]:
            classes = ' '.join(el.get('class', []))
            unique_classes.add(classes)
        print("Примеры классов:")
        for cls in list(unique_classes)[:5]:
            print(f"  - {cls}")
    
    # 2. Находим все EDeliveryGroup-Item
    delivery_items = soup.find_all(class_=re.compile(r'EDeliveryGroup-Item'))
    print(f"\n📋 Найдено элементов с классом EDeliveryGroup-Item: {len(delivery_items)}")
    
    if delivery_items:
        unique_classes = set()
        for el in delivery_items[:10]:
            classes = ' '.join(el.get('class', []))
            unique_classes.add(classes)
        print("Примеры классов:")
        for cls in list(unique_classes)[:5]:
            print(f"  - {cls}")
    
    # Находим сниппеты
    snippet_selectors = [
        re.compile(r'Organic_withOfferInfo'),
        re.compile(r'EProductSnippet2'),
        re.compile(r'EShopItem')
    ]
    
    all_snippets = []
    for selector in snippet_selectors:
        snippets = soup.find_all(class_=selector)
        all_snippets.extend(snippets)
    
    # Дедупликация
    unique_snippets = []
    seen_ids = set()
    
    for snippet in all_snippets:
        snippet_id = id(snippet)
        if snippet_id in seen_ids:
            continue
        
        is_adv = False
        if snippet.find(class_=re.compile(r'advertisement|AdvProduct')):
            is_adv = True
        if any('Adv' in c for c in snippet.get('class', [])):
            is_adv = True
        
        if not is_adv:
            is_nested = False
            parent = snippet.parent
            while parent:
                for sel in snippet_selectors:
                    if parent.get('class') and any(sel.match(c) for c in parent.get('class', [])):
                        is_nested = True
                        break
                if is_nested:
                    break
                parent = parent.parent
            
            if not is_nested:
                unique_snippets.append(snippet)
                seen_ids.add(snippet_id)
    
    print(f"\n📋 Найдено сниппетов: {len(unique_snippets)}")
    
    # 3. Анализ EDeliveryGroup в каждом сниппете
    print("\n🔍 Анализ EDeliveryGroup в сниппетах:")
    print("-" * 100)
    
    snippets_with_delivery = []
    snippets_without_delivery = []
    
    for idx, snippet in enumerate(unique_snippets):
        title_el = snippet.find(class_=re.compile(r'OrganicTitle|EProductSnippet2-Title'))
        title = title_el.get_text(strip=True)[:40] if title_el else "N/A"
        
        # Ищем EDeliveryGroup внутри сниппета
        delivery_group = snippet.find(class_=re.compile(r'EDeliveryGroup(?!-)'))
        
        if delivery_group:
            snippets_with_delivery.append(idx + 1)
            marker = "✅"
            
            # Находим все EDeliveryGroup-Item внутри
            items = delivery_group.find_all(class_=re.compile(r'EDeliveryGroup-Item'))
            items_text = []
            for item in items:
                text = item.get_text(strip=True)
                if text:
                    items_text.append(text)
            
            print(f"{marker} Сниппет #{idx + 1}: {title}...")
            print(f"   Items ({len(items)}): {items_text}")
        else:
            snippets_without_delivery.append(idx + 1)
            marker = "❌"
            print(f"{marker} Сниппет #{idx + 1}: {title}...")
        
    print("-" * 100)
    print(f"\n📊 Итог:")
    print(f"  С EDeliveryGroup: {len(snippets_with_delivery)} сниппетов")
    print(f"  Номера: {snippets_with_delivery[:20]}{'...' if len(snippets_with_delivery) > 20 else ''}")
    print(f"\n  Без EDeliveryGroup: {len(snippets_without_delivery)} сниппетов")
    print(f"  Номера: {snippets_without_delivery[:20]}{'...' if len(snippets_without_delivery) > 20 else ''}")
    
    # 4. Структура EDeliveryGroup
    print("\n\n📐 Структура EDeliveryGroup (первый пример):")
    for snippet in unique_snippets:
        delivery_group = snippet.find(class_=re.compile(r'EDeliveryGroup(?!-)'))
        if delivery_group:
            print(f"\nEDeliveryGroup classes: {' '.join(delivery_group.get('class', []))}")
            print("\nДети EDeliveryGroup:")
            for i, child in enumerate(delivery_group.children):
                if hasattr(child, 'get'):
                    child_classes = ' '.join(child.get('class', []))[:60]
                    child_text = child.get_text(strip=True)[:40]
                    print(f"  {i}: <{child.name}> .{child_classes}")
                    print(f"      Text: \"{child_text}\"")
            
            # Показываем структуру первого Item
            items = delivery_group.find_all(class_=re.compile(r'EDeliveryGroup-Item'))
            if items:
                print(f"\n  Первый EDeliveryGroup-Item:")
                item = items[0]
                print(f"    Classes: {' '.join(item.get('class', []))}")
                print(f"    Text: \"{item.get_text(strip=True)}\"")
                print(f"    HTML (первые 200 символов): {str(item)[:200]}...")
            break

except Exception as e:
    import traceback
    print(f"❌ Ошибка: {e}")
    traceback.print_exc()

