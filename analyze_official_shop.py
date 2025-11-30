#!/usr/bin/env python3
"""
Анализ HTML для поиска OfficialShop внутри EShopName
"""

import re
from bs4 import BeautifulSoup

file_path = '/Users/shchuchkin/Downloads/кофеварка — Яндекс.html'

try:
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    print(f"✅ Файл загружен, размер: {len(content)} символов")
    
    soup = BeautifulSoup(content, 'html.parser')
    
    # Находим все сниппеты (не рекламные)
    snippet_selectors = [
        re.compile(r'Organic_withOfferInfo'),
        re.compile(r'EProductSnippet2'),
        re.compile(r'EShopItem')
    ]
    
    all_snippets = []
    for selector in snippet_selectors:
        snippets = soup.find_all(class_=selector)
        all_snippets.extend(snippets)
    
    # Дедупликация и фильтрация
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
    
    # Анализ EShopName и OfficialShop
    print("\n🔍 Анализ EShopName и OfficialShop:")
    print("-" * 100)
    
    snippets_with_official = []
    snippets_without_official = []
    
    for idx, snippet in enumerate(unique_snippets):
        # Ищем EShopName
        shop_name_el = snippet.find(class_=re.compile(r'EShopName'))
        
        if not shop_name_el:
            print(f"⚠️ Сниппет #{idx + 1}: EShopName не найден")
            continue
        
        # Полный текст EShopName (текущая проблема)
        full_text = shop_name_el.get_text(strip=True)
        
        # Ищем OfficialShop внутри EShopName
        official_shop = shop_name_el.find(class_=re.compile(r'OfficialShop'))
        has_official = official_shop is not None
        
        # Получаем чистое имя магазина (без OfficialShop)
        clean_name = ""
        if has_official:
            # Находим первый текстовый элемент до OfficialShop
            for child in shop_name_el.children:
                if hasattr(child, 'get_text'):
                    # Это тег
                    if 'OfficialShop' not in ' '.join(child.get('class', [])):
                        text = child.get_text(strip=True)
                        if text:
                            clean_name = text
                            break
                else:
                    # Это текст
                    text = str(child).strip()
                    if text:
                        clean_name = text
                        break
            
            # Альтернативный способ - убрать текст OfficialShop
            if not clean_name:
                official_text = official_shop.get_text(strip=True)
                clean_name = full_text.replace(official_text, '').strip()
            
            snippets_with_official.append(idx + 1)
            marker = "✅"
        else:
            clean_name = full_text
            snippets_without_official.append(idx + 1)
            marker = "❌"
        
        # Ищем заголовок для идентификации
        title_el = snippet.find(class_=re.compile(r'OrganicTitle|EProductSnippet2-Title'))
        title = title_el.get_text(strip=True)[:40] if title_el else "N/A"
        
        print(f"{marker} Сниппет #{idx + 1}: {title}...")
        print(f"   EShopName полный: \"{full_text[:80]}...\"" if len(full_text) > 80 else f"   EShopName полный: \"{full_text}\"")
        print(f"   EShopName чистый: \"{clean_name}\"")
        if has_official:
            official_text = official_shop.get_text(strip=True)[:60]
            print(f"   OfficialShop: \"{official_text}...\"" if len(official_shop.get_text(strip=True)) > 60 else f"   OfficialShop: \"{official_shop.get_text(strip=True)}\"")
        print()
    
    print("-" * 100)
    print(f"\n📊 Итог:")
    print(f"  С OfficialShop: {len(snippets_with_official)} сниппетов")
    print(f"  Номера: {snippets_with_official}")
    print(f"\n  Без OfficialShop: {len(snippets_without_official)} сниппетов")
    
    # Структура EShopName с OfficialShop
    print("\n\n📐 Структура EShopName с OfficialShop (первый пример):")
    for snippet in unique_snippets:
        shop_name_el = snippet.find(class_=re.compile(r'EShopName'))
        if shop_name_el:
            official_shop = shop_name_el.find(class_=re.compile(r'OfficialShop'))
            if official_shop:
                print(f"\nEShopName classes: {' '.join(shop_name_el.get('class', []))}")
                print("\nДети EShopName:")
                for i, child in enumerate(shop_name_el.children):
                    if hasattr(child, 'get'):
                        child_classes = ' '.join(child.get('class', []))[:60]
                        child_text = child.get_text(strip=True)[:40]
                        print(f"  {i}: <{child.name}> .{child_classes} → \"{child_text}...\"")
                    else:
                        text = str(child).strip()[:40]
                        if text:
                            print(f"  {i}: [TEXT] \"{text}\"")
                
                print(f"\nOfficialShop classes: {' '.join(official_shop.get('class', []))}")
                break

except Exception as e:
    import traceback
    print(f"❌ Ошибка: {e}")
    traceback.print_exc()

