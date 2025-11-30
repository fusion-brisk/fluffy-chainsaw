#!/usr/bin/env python3
"""
Детальный анализ сниппета GATE31
"""

import re
from bs4 import BeautifulSoup

file_path = '/Users/shchuchkin/Downloads/футболка оверсайз — Яндекс.html'

try:
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    soup = BeautifulSoup(content, 'html.parser')
    
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
    
    unique_snippets = []
    seen_ids = set()
    
    for snippet in all_snippets:
        snippet_id = id(snippet)
        if snippet_id in seen_ids:
            continue
        
        is_adv = any('Adv' in c for c in snippet.get('class', []))
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
    
    # Ищем GATE31 (сниппет 6)
    print(f"📋 Всего сниппетов: {len(unique_snippets)}")
    
    for idx, snippet in enumerate(unique_snippets):
        title_el = snippet.find(class_=re.compile(r'OrganicTitle|EProductSnippet2-Title'))
        title = title_el.get_text(strip=True) if title_el else ""
        
        if 'GATE31' in title or idx == 5:  # индекс 5 = сниппет 6
            print(f"\n{'='*80}")
            print(f"📦 СНИППЕТ #{idx+1}: {title[:50]}...")
            print(f"{'='*80}")
            
            # Все EPrice элементы
            print(f"\n🔍 ВСЕ ЭЛЕМЕНТЫ С ЦЕНОЙ:")
            
            # EPrice-Value (основные значения)
            price_values = snippet.find_all(class_=re.compile(r'EPrice-Value'))
            print(f"\n   EPrice-Value элементов: {len(price_values)}")
            for i, pv in enumerate(price_values):
                text = pv.get_text(strip=True)
                parent_classes = ' '.join(pv.parent.get('class', []))[:40] if pv.parent else ''
                print(f"      {i+1}. \"{text}\" (parent: {parent_classes})")
            
            # EPrice-A11yValue (скрытые значения для скринридеров)
            a11y_values = snippet.find_all(class_=re.compile(r'EPrice-A11yValue'))
            print(f"\n   EPrice-A11yValue элементов: {len(a11y_values)}")
            for i, av in enumerate(a11y_values):
                text = av.get_text(strip=True)
                print(f"      {i+1}. \"{text}\"")
            
            # EPriceGroup-Price (контейнер цены)
            price_containers = snippet.find_all(class_=re.compile(r'EPriceGroup-Price'))
            print(f"\n   EPriceGroup-Price контейнеров: {len(price_containers)}")
            for i, pc in enumerate(price_containers):
                classes = ' '.join(pc.get('class', []))
                text = pc.get_text(strip=True)[:30]
                # Проверяем, это старая цена или нет
                is_old = 'EPrice_view_old' in classes
                print(f"      {i+1}. {'[OLD]' if is_old else '[NEW]'} \"{text}\" classes: {classes[:60]}")
            
            # Текущая vs старая цена
            print(f"\n   📊 АНАЛИЗ:")
            
            # Находим текущую цену (не old)
            current_price_container = snippet.find(class_=lambda c: c and 'EPriceGroup-Price' in c and 'EPrice_view_old' not in c)
            if current_price_container:
                value_el = current_price_container.find(class_=re.compile(r'EPrice-Value'))
                if value_el:
                    current_price = value_el.get_text(strip=True)
                    digits = re.sub(r'[^\d]', '', current_price)
                    print(f"      Текущая цена: \"{current_price}\" → {digits}")
            
            # Находим старую цену
            old_price_container = snippet.find(class_=re.compile(r'EPrice_view_old'))
            if old_price_container:
                value_el = old_price_container.find(class_=re.compile(r'EPrice-Value'))
                if value_el:
                    old_price = value_el.get_text(strip=True)
                    digits = re.sub(r'[^\d]', '', old_price)
                    print(f"      Старая цена: \"{old_price}\" → {digits}")
            
            if idx == 5:  # Выходим после GATE31
                break

except Exception as e:
    import traceback
    print(f"❌ Ошибка: {e}")
    traceback.print_exc()

