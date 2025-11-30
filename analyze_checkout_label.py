#!/usr/bin/env python3
"""
Анализ HTML для поиска EMarketCheckoutLabel внутри сниппетов
"""

import re
from bs4 import BeautifulSoup

file_path = '/Users/shchuchkin/Downloads/кофеварка — Яндекс.html'

try:
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    print(f"✅ Файл загружен, размер: {len(content)} символов")
    
    # Парсим HTML
    soup = BeautifulSoup(content, 'html.parser')
    
    # 1. Находим все элементы с EMarketCheckoutLabel
    checkout_labels = soup.find_all(class_=re.compile(r'EMarketCheckoutLabel'))
    print(f"\n📦 Найдено элементов с классом EMarketCheckoutLabel: {len(checkout_labels)}")
    
    # Выводим примеры классов
    if checkout_labels:
        unique_classes = set()
        for label in checkout_labels[:10]:
            classes = ' '.join(label.get('class', []))
            unique_classes.add(classes)
        print("Примеры классов:")
        for cls in list(unique_classes)[:5]:
            print(f"  - {cls}")
    
    # 2. Находим все сниппеты (не рекламные)
    # Ищем контейнеры сниппетов
    snippet_selectors = [
        re.compile(r'Organic_withOfferInfo'),
        re.compile(r'EProductSnippet2'),
        re.compile(r'EShopItem')
    ]
    
    all_snippets = []
    for selector in snippet_selectors:
        snippets = soup.find_all(class_=selector)
        all_snippets.extend(snippets)
    
    # Дедупликация и удаление вложенных
    unique_snippets = []
    seen_ids = set()
    
    for snippet in all_snippets:
        snippet_id = id(snippet)
        if snippet_id in seen_ids:
            continue
        
        # Проверяем, не является ли рекламным
        is_adv = False
        if snippet.find(class_=re.compile(r'advertisement|AdvProduct')):
            is_adv = True
        if any('Adv' in c for c in snippet.get('class', [])):
            is_adv = True
        
        if not is_adv:
            # Проверяем, не вложен ли в другой сниппет
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
    
    print(f"\n📋 Найдено сниппетов (не рекламных, верхнеуровневых): {len(unique_snippets)}")
    
    # 3. Проверяем каждый сниппет на наличие EMarketCheckoutLabel
    print("\n🔍 Анализ сниппетов:")
    print("-" * 80)
    
    snippets_with_label = []
    snippets_without_label = []
    
    for idx, snippet in enumerate(unique_snippets):
        # Ищем заголовок
        title_el = snippet.find(class_=re.compile(r'OrganicTitle|EProductSnippet2-Title'))
        title = ""
        if title_el:
            title = title_el.get_text(strip=True)[:50]
        
        # Ищем EMarketCheckoutLabel внутри сниппета
        has_checkout_label = snippet.find(class_=re.compile(r'EMarketCheckoutLabel')) is not None
        
        if has_checkout_label:
            snippets_with_label.append(idx + 1)
            marker = "✅"
        else:
            snippets_without_label.append(idx + 1)
            marker = "❌"
        
        print(f"{marker} Сниппет #{idx + 1}: {title}...")
    
    print("-" * 80)
    print(f"\n📊 Итог:")
    print(f"  С EMarketCheckoutLabel: {len(snippets_with_label)} сниппетов")
    print(f"  Номера: {snippets_with_label}")
    print(f"\n  Без EMarketCheckoutLabel: {len(snippets_without_label)} сниппетов")
    print(f"  Номера: {snippets_without_label}")
    
    # 4. Выводим структуру EMarketCheckoutLabel
    if checkout_labels:
        print("\n\n📐 Структура EMarketCheckoutLabel (первый пример):")
        label = checkout_labels[0]
        print(f"  Tag: {label.name}")
        print(f"  Classes: {' '.join(label.get('class', []))}")
        
        # Выводим родительскую цепочку
        print("\n  Родительская цепочка:")
        parent = label.parent
        depth = 0
        while parent and depth < 5:
            parent_classes = ' '.join(parent.get('class', []))[:60]
            print(f"    {'  ' * depth}└── {parent.name}.{parent_classes}")
            parent = parent.parent
            depth += 1

except Exception as e:
    import traceback
    print(f"❌ Ошибка: {e}")
    traceback.print_exc()

