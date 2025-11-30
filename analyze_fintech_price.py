#!/usr/bin/env python3
"""
Анализ Fintech, EPrice_view_special и Label_view_outlineSpecial
"""

import re
from bs4 import BeautifulSoup

file_path = '/Users/shchuchkin/Downloads/футболка оверсайз — Яндекс.html'

try:
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    print(f"✅ Файл загружен")
    
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
    
    # Анализ интересующих сниппетов (1 и 6)
    for idx in [0, 5]:  # индексы 0 и 5 = сниппеты 1 и 6
        if idx >= len(unique_snippets):
            continue
            
        snippet = unique_snippets[idx]
        title_el = snippet.find(class_=re.compile(r'OrganicTitle|EProductSnippet2-Title'))
        title = title_el.get_text(strip=True)[:40] if title_el else "N/A"
        
        print(f"\n{'=' * 80}")
        print(f"📦 СНИППЕТ #{idx + 1}: {title}...")
        print(f"{'=' * 80}")
        
        # 1. EPrice_view_special
        price_special = snippet.find(class_=re.compile(r'EPrice_view_special'))
        if price_special:
            price_classes = ' '.join(price_special.get('class', []))
            price_text = price_special.get_text(strip=True)[:30]
            print(f"\n✅ EPrice_view_special найден:")
            print(f"   Classes: {price_classes}")
            print(f"   Text: \"{price_text}\"")
        else:
            print(f"\n❌ EPrice_view_special не найден")
        
        # 2. Label_view_outlineSpecial (скидка "Вам")
        label_outline = snippet.find(class_=re.compile(r'Label_view_outlineSpecial'))
        if label_outline:
            label_classes = ' '.join(label_outline.get('class', []))
            label_text = label_outline.get_text(strip=True)
            print(f"\n✅ Label_view_outlineSpecial найден:")
            print(f"   Classes: {label_classes}")
            print(f"   Text: \"{label_text}\"")
            
            # Ищем слово "Вам" внутри
            vam_el = label_outline.find(string=re.compile(r'Вам'))
            if vam_el:
                print(f"   ✅ Слово 'Вам' найдено")
        else:
            print(f"\n❌ Label_view_outlineSpecial не найден")
        
        # 3. Fintech блок
        fintech = snippet.find(class_=re.compile(r'^Fintech$|Fintech[^-]'))
        if fintech:
            fintech_classes = ' '.join(fintech.get('class', []))
            fintech_text = fintech.get_text(strip=True)[:50]
            print(f"\n✅ Fintech найден:")
            print(f"   Classes: {fintech_classes}")
            print(f"   Text: \"{fintech_text}\"")
            
            # Определяем type
            if 'Fintech_type_split' in fintech_classes:
                print(f"   → type = Split")
            elif 'Fintech_type_pay' in fintech_classes:
                print(f"   → type = Pay")
            else:
                # Ищем по тексту
                if 'Сплит' in fintech_text:
                    print(f"   → type = Split (по тексту)")
                elif 'Пэй' in fintech_text:
                    print(f"   → type = Pay (по тексту)")
            
            # Определяем view
            if 'Fintech_view_extra-short' in fintech_classes:
                print(f"   → view = extra-short")
            elif 'Fintech_view_short' in fintech_classes:
                print(f"   → view = short")
        else:
            print(f"\n❌ Fintech не найден")
        
        # 4. Структура EPriceGroup
        price_group = snippet.find(class_=re.compile(r'EPriceGroup'))
        if price_group:
            pg_classes = ' '.join(price_group.get('class', []))
            print(f"\n📊 EPriceGroup:")
            print(f"   Classes: {pg_classes}")
            
            # Проверяем withFintech
            if 'EPriceGroup_withFintech' in pg_classes:
                print(f"   ✅ EPriceGroup_withFintech = true")
            else:
                print(f"   ❌ EPriceGroup_withFintech не найден")
    
    # Общая статистика
    print(f"\n{'=' * 80}")
    print(f"📊 ОБЩАЯ СТАТИСТИКА:")
    print(f"{'=' * 80}")
    
    fintech_count = 0
    price_special_count = 0
    label_outline_count = 0
    
    for snippet in unique_snippets:
        if snippet.find(class_=re.compile(r'^Fintech$|Fintech[^-]')):
            fintech_count += 1
        if snippet.find(class_=re.compile(r'EPrice_view_special')):
            price_special_count += 1
        if snippet.find(class_=re.compile(r'Label_view_outlineSpecial')):
            label_outline_count += 1
    
    print(f"  Fintech: {fintech_count} из {len(unique_snippets)}")
    print(f"  EPrice_view_special: {price_special_count} из {len(unique_snippets)}")
    print(f"  Label_view_outlineSpecial: {label_outline_count} из {len(unique_snippets)}")

except Exception as e:
    import traceback
    print(f"❌ Ошибка: {e}")
    traceback.print_exc()

