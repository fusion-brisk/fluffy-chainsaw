#!/usr/bin/env python3
"""
Сравнение цен из HTML
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
        if snippet.find(class_=re.compile(r'advertisement|AdvProduct')):
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
    
    print(f"📋 Сниппетов: {len(unique_snippets)}")
    print(f"\n{'='*100}")
    print(f"{'#':>3} | {'Заголовок':<40} | {'Цена':>12} | {'Стар.цена':>10} | {'Скидка':>8} | {'Fintech'}")
    print(f"{'='*100}")
    
    for idx, snippet in enumerate(unique_snippets[:10]):
        # Заголовок
        title_el = snippet.find(class_=re.compile(r'OrganicTitle|EProductSnippet2-Title'))
        title = title_el.get_text(strip=True)[:38] if title_el else "N/A"
        
        # Цена (основная)
        price = ""
        # Ищем EPrice-Value (основное значение цены)
        price_value = snippet.find(class_=re.compile(r'EPrice-Value'))
        if price_value:
            price_text = price_value.get_text(strip=True)
            # Извлекаем только цифры
            price_digits = re.sub(r'[^\d]', '', price_text)
            if price_digits:
                price = price_digits
        
        # Старая цена
        old_price = ""
        old_price_el = snippet.find(class_=re.compile(r'EPrice_view_old'))
        if old_price_el:
            old_price_value = old_price_el.find(class_=re.compile(r'EPrice-Value'))
            if old_price_value:
                old_price_text = old_price_value.get_text(strip=True)
                old_price_digits = re.sub(r'[^\d]', '', old_price_text)
                if old_price_digits:
                    old_price = old_price_digits
        
        # Скидка
        discount = ""
        discount_el = snippet.find(class_=re.compile(r'LabelDiscount'))
        if discount_el:
            label_content = discount_el.find(class_=re.compile(r'Label-Content'))
            if label_content:
                discount_text = label_content.get_text(strip=True)
                # Ищем процент
                match = re.search(r'[-−–]?\s*(\d+)\s*%', discount_text)
                if match:
                    discount = f"-{match.group(1)}%"
        
        # Fintech
        fintech = ""
        fintech_el = snippet.find(class_=re.compile(r'^Fintech$|Fintech[^-]'))
        if fintech_el:
            fintech_classes = ' '.join(fintech_el.get('class', []))
            if 'split' in fintech_classes.lower():
                fintech = "Сплит"
            elif 'pay' in fintech_classes.lower():
                fintech = "Пэй"
            else:
                fintech = "да"
        
        print(f"{idx+1:>3} | {title:<40} | {price:>12} | {old_price:>10} | {discount:>8} | {fintech}")
    
    print(f"{'='*100}")
    
    # Детальный анализ первых 8 сниппетов
    print(f"\n\n📊 ДЕТАЛЬНЫЙ АНАЛИЗ ЦЕН:")
    print(f"{'='*100}")
    
    for idx, snippet in enumerate(unique_snippets[:8]):
        title_el = snippet.find(class_=re.compile(r'OrganicTitle|EProductSnippet2-Title'))
        title = title_el.get_text(strip=True)[:40] if title_el else "N/A"
        
        print(f"\n--- Сниппет #{idx+1}: {title}... ---")
        
        # Все элементы с ценой
        price_elements = snippet.find_all(class_=re.compile(r'EPrice'))
        print(f"   Найдено EPrice элементов: {len(price_elements)}")
        
        for i, pel in enumerate(price_elements[:5]):
            classes = ' '.join(pel.get('class', []))[:60]
            text = pel.get_text(strip=True)[:30]
            print(f"      {i+1}. {classes}")
            print(f"         Text: \"{text}\"")

except Exception as e:
    import traceback
    print(f"❌ Ошибка: {e}")
    traceback.print_exc()

