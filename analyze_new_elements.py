#!/usr/bin/env python3
"""
Анализ HTML для поиска новых элементов в сниппетах
Сравнивает с известными правилами парсинга
"""

import re
from bs4 import BeautifulSoup
from collections import Counter

file_path = '/Users/shchuchkin/Downloads/футболка оверсайз — Яндекс.html'

# Известные классы, которые уже обрабатываются
KNOWN_CLASSES = [
    'OrganicTitle', 'EProductSnippet2-Title',
    'EShopName', 'ShopName', 'OfficialShop',
    'Path', 'OrganicPath',
    'OrganicTextContentSpan', 'EProductSnippet2-Text',
    'Organic-OfferThumbImage', 'EProductSnippet2-Thumb',
    'Price', 'EPrice', 'EPriceGroup',
    'Rating', 'Review', 'ELabelRating',
    'Discount', 'LabelDiscount',
    'EPriceBarometer',
    'EMarketCheckoutLabel',
    'EDeliveryGroup', 'EDeliveryGroup-Item',
    'Favicon', 'EThumb',
    'Label', 'LabelGroup',
    'A11yHidden'  # скрытые элементы
]

try:
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    print(f"✅ Файл загружен: {file_path}")
    print(f"   Размер: {len(content):,} символов")
    
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
    
    # Собираем все уникальные классы внутри сниппетов
    all_classes = Counter()
    class_examples = {}  # class -> example text
    
    for snippet in unique_snippets:
        for el in snippet.find_all(True):  # все элементы
            classes = el.get('class', [])
            for cls in classes:
                # Пропускаем служебные классы
                if cls.startswith('_') or cls.startswith('css-'):
                    continue
                all_classes[cls] += 1
                if cls not in class_examples:
                    text = el.get_text(strip=True)[:50]
                    if text:
                        class_examples[cls] = text
    
    # Фильтруем новые классы (не известные)
    new_classes = {}
    for cls, count in all_classes.items():
        is_known = False
        for known in KNOWN_CLASSES:
            if known.lower() in cls.lower() or cls.lower() in known.lower():
                is_known = True
                break
        if not is_known and count >= 3:  # минимум 3 вхождения
            new_classes[cls] = count
    
    # Сортируем по частоте
    sorted_new = sorted(new_classes.items(), key=lambda x: -x[1])
    
    print("\n" + "=" * 80)
    print("🆕 НОВЫЕ КЛАССЫ (не обрабатываются, минимум 3 вхождения):")
    print("=" * 80)
    
    for cls, count in sorted_new[:50]:
        example = class_examples.get(cls, '')[:40]
        print(f"  {count:3}× .{cls}")
        if example:
            print(f"       └─ \"{example}...\"" if len(example) == 40 else f"       └─ \"{example}\"")
    
    # Ищем интересные паттерны
    print("\n" + "=" * 80)
    print("🔍 ПОТЕНЦИАЛЬНО ИНТЕРЕСНЫЕ ЭЛЕМЕНТЫ:")
    print("=" * 80)
    
    # Ищем элементы, которые могут содержать данные
    interesting_patterns = [
        (r'Color', 'Цвет товара'),
        (r'Size', 'Размер'),
        (r'Brand', 'Бренд'),
        (r'Stock', 'Наличие'),
        (r'Cashback', 'Кэшбэк'),
        (r'Bonus', 'Бонусы'),
        (r'Credit', 'Кредит/Рассрочка'),
        (r'Installment', 'Рассрочка'),
        (r'Pickup', 'Самовывоз'),
        (r'Express', 'Экспресс'),
        (r'Promo', 'Промо'),
        (r'Badge', 'Бейджи'),
        (r'Tag', 'Теги'),
        (r'Variant', 'Варианты'),
        (r'Option', 'Опции'),
        (r'Gallery', 'Галерея'),
        (r'Seller', 'Продавец'),
        (r'Merchant', 'Мерчант'),
        (r'Fintech', 'Финтех'),
        (r'Bnpl', 'BNPL/Рассрочка'),
        (r'Spl', 'SPL'),
    ]
    
    for pattern, description in interesting_patterns:
        matching = [(cls, count) for cls, count in all_classes.items() 
                    if re.search(pattern, cls, re.IGNORECASE)]
        if matching:
            print(f"\n  📌 {description} ({pattern}):")
            for cls, count in sorted(matching, key=lambda x: -x[1])[:5]:
                example = class_examples.get(cls, '')[:40]
                print(f"     {count:3}× .{cls}")
                if example:
                    print(f"          └─ \"{example}\"")
    
    # Детальный анализ первых 3 сниппетов
    print("\n" + "=" * 80)
    print("📊 ДЕТАЛЬНЫЙ АНАЛИЗ ПЕРВЫХ 3 СНИППЕТОВ:")
    print("=" * 80)
    
    for idx, snippet in enumerate(unique_snippets[:3]):
        title_el = snippet.find(class_=re.compile(r'OrganicTitle|EProductSnippet2-Title'))
        title = title_el.get_text(strip=True)[:50] if title_el else "N/A"
        
        print(f"\n{'─' * 40}")
        print(f"Сниппет #{idx + 1}: {title}...")
        print(f"{'─' * 40}")
        
        # Основные блоки
        blocks = [
            ('EShopName', 'Магазин'),
            ('EDeliveryGroup', 'Доставка'),
            ('EPriceGroup', 'Цена'),
            ('ELabelGroup', 'Лейблы'),
            ('EMarketCheckoutLabel', 'Покупки'),
            ('OfficialShop', 'Офиц.магазин'),
        ]
        
        for block_class, block_name in blocks:
            block = snippet.find(class_=re.compile(block_class))
            status = "✅" if block else "❌"
            extra = ""
            if block:
                text = block.get_text(strip=True)[:30]
                if text:
                    extra = f" → \"{text}\""
            print(f"  {status} {block_name}: {block_class}{extra}")
        
        # Ищем неизвестные блоки с содержимым
        print(f"\n  🆕 Новые элементы:")
        shown = set()
        for el in snippet.find_all(True):
            classes = el.get('class', [])
            for cls in classes:
                if cls in shown:
                    continue
                is_known = False
                for known in KNOWN_CLASSES:
                    if known.lower() in cls.lower():
                        is_known = True
                        break
                if not is_known and not cls.startswith('_') and not cls.startswith('css-'):
                    text = el.get_text(strip=True)[:40]
                    if text and len(text) > 2:
                        print(f"     .{cls} → \"{text}\"")
                        shown.add(cls)

except Exception as e:
    import traceback
    print(f"❌ Ошибка: {e}")
    traceback.print_exc()

