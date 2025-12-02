#!/usr/bin/env python3
"""
Детальный анализ Organic_withOfferInfo сниппетов.
Проверяем, какие данные можно извлечь и какие селекторы нужны.
"""

import re
from bs4 import BeautifulSoup
from pathlib import Path


def analyze_organic_offerinfo(html_path: str):
    """Детально анализирует структуру Organic_withOfferInfo."""
    
    print(f"📄 Загрузка файла: {html_path}")
    
    with open(html_path, 'r', encoding='utf-8') as f:
        html = f.read()
    
    soup = BeautifulSoup(html, 'html.parser')
    
    # Находим все Organic_withOfferInfo
    snippets = soup.find_all(class_=re.compile(r'Organic_withOfferInfo'))
    print(f"\n🔍 Найдено Organic_withOfferInfo: {len(snippets)}")
    
    # Проверяем, не вложены ли они
    top_level = []
    for s in snippets:
        # Проверяем, нет ли родителя с таким же классом
        parent = s.parent
        is_nested = False
        while parent:
            parent_classes = ' '.join(parent.get('class', []))
            if 'Organic_withOfferInfo' in parent_classes or 'EProductSnippet2' in parent_classes or 'EShopItem' in parent_classes:
                is_nested = True
                break
            parent = parent.parent
        if not is_nested:
            top_level.append(s)
    
    print(f"📊 Top-level (не вложенные): {len(top_level)}")
    
    print("\n" + "="*80)
    print("📋 МАППИНГ ПОЛЕЙ ДЛЯ Organic_withOfferInfo")
    print("="*80)
    
    # Анализируем структуру каждого сниппета
    fields_found = {
        'title': [],
        'price': [],
        'old_price': [],
        'discount': [],
        'shop_name': [],
        'image': [],
        'rating': [],
        'delivery': [],
        'url': [],
    }
    
    for idx, snippet in enumerate(top_level[:10], 1):
        print(f"\n{'='*40}")
        print(f"📦 Сниппет #{idx}")
        print(f"{'='*40}")
        
        # Все классы контейнера
        classes = snippet.get('class', [])
        print(f"Классы: {' '.join(classes)[:100]}...")
        
        # 1. ЗАГОЛОВОК
        title_selectors = [
            ('.OrganicTitle', 'OrganicTitle'),
            ('.Organic-Title', 'Organic-Title'),
            ('[class*="OrganicTitle"]', 'OrganicTitle*'),
            ('[class*="Organic-Title"]', 'Organic-Title*'),
        ]
        
        title_el = None
        for selector, name in title_selectors:
            el = snippet.select_one(selector)
            if el:
                title_el = el
                fields_found['title'].append(name)
                break
        
        if title_el:
            print(f"📝 Заголовок [{fields_found['title'][-1] if fields_found['title'] else '?'}]:")
            print(f"   {title_el.get_text(strip=True)[:60]}...")
        else:
            print(f"❌ Заголовок: НЕ НАЙДЕН")
        
        # 2. ЦЕНА
        price_selectors = [
            ('.EPrice-Value', 'EPrice-Value'),
            ('.EPriceGroup-Price .EPrice-Value', 'EPriceGroup-Price .EPrice-Value'),
            ('[class*="EPrice-Value"]', 'EPrice-Value*'),
        ]
        
        price_el = None
        # Ищем цену, исключая старую цену
        for selector, name in price_selectors:
            els = snippet.select(selector)
            for el in els:
                # Проверяем, что это не старая цена
                parent_classes = ' '.join(el.parent.get('class', []) if el.parent else [])
                if 'EPrice_view_old' not in parent_classes and 'old' not in parent_classes.lower():
                    price_el = el
                    fields_found['price'].append(name)
                    break
            if price_el:
                break
        
        if price_el:
            print(f"💰 Цена [{fields_found['price'][-1] if fields_found['price'] else '?'}]:")
            print(f"   {price_el.get_text(strip=True)}")
        else:
            print(f"❌ Цена: НЕ НАЙДЕНА")
        
        # 3. СТАРАЯ ЦЕНА
        old_price_selectors = [
            ('.EPrice_view_old .EPrice-Value', 'EPrice_view_old .EPrice-Value'),
            ('[class*="EPrice_view_old"] .EPrice-Value', 'EPrice_view_old* .EPrice-Value'),
            ('.EPrice_view_old', 'EPrice_view_old'),
        ]
        
        old_price_el = None
        for selector, name in old_price_selectors:
            el = snippet.select_one(selector)
            if el:
                old_price_el = el
                fields_found['old_price'].append(name)
                break
        
        if old_price_el:
            print(f"💸 Старая цена [{fields_found['old_price'][-1] if fields_found['old_price'] else '?'}]:")
            print(f"   {old_price_el.get_text(strip=True)}")
        
        # 4. СКИДКА
        discount_selectors = [
            ('.LabelDiscount .Label-Content', 'LabelDiscount .Label-Content'),
            ('.LabelDiscount', 'LabelDiscount'),
            ('[class*="LabelDiscount"]', 'LabelDiscount*'),
        ]
        
        discount_el = None
        for selector, name in discount_selectors:
            el = snippet.select_one(selector)
            if el:
                discount_el = el
                fields_found['discount'].append(name)
                break
        
        if discount_el:
            print(f"🏷️ Скидка [{fields_found['discount'][-1] if fields_found['discount'] else '?'}]:")
            print(f"   {discount_el.get_text(strip=True)}")
        
        # 5. МАГАЗИН / HOST
        shop_selectors = [
            ('.Path', 'Path'),
            ('.Organic-Path', 'Organic-Path'),
            ('[class*="Path"]', 'Path*'),
            ('.OrganicUrl', 'OrganicUrl'),
        ]
        
        shop_el = None
        for selector, name in shop_selectors:
            el = snippet.select_one(selector)
            if el:
                shop_el = el
                fields_found['shop_name'].append(name)
                break
        
        if shop_el:
            print(f"🏪 Магазин/Host [{fields_found['shop_name'][-1] if fields_found['shop_name'] else '?'}]:")
            text = shop_el.get_text(strip=True)[:50]
            print(f"   {text}")
        
        # 6. ИЗОБРАЖЕНИЕ
        img_selectors = [
            ('.Organic-OfferThumb img', 'Organic-OfferThumb img'),
            ('.Organic-OfferThumbImage', 'Organic-OfferThumbImage'),
            ('[class*="OfferThumb"] img', 'OfferThumb* img'),
            ('.EThumb-Image', 'EThumb-Image'),
            ('img', 'img'),
        ]
        
        img_el = None
        for selector, name in img_selectors:
            el = snippet.select_one(selector)
            if el:
                src = el.get('src') or el.get('data-src')
                if src:
                    img_el = el
                    fields_found['image'].append(name)
                    break
        
        if img_el:
            src = img_el.get('src') or img_el.get('data-src') or ''
            print(f"🖼️ Изображение [{fields_found['image'][-1] if fields_found['image'] else '?'}]:")
            print(f"   {src[:60]}...")
        
        # 7. РЕЙТИНГ
        rating_selectors = [
            ('.ELabelRating .Label-Content', 'ELabelRating .Label-Content'),
            ('.ELabelRating', 'ELabelRating'),
            ('.RatingOneStar', 'RatingOneStar'),
        ]
        
        rating_el = None
        for selector, name in rating_selectors:
            el = snippet.select_one(selector)
            if el:
                rating_el = el
                fields_found['rating'].append(name)
                break
        
        if rating_el:
            print(f"⭐ Рейтинг [{fields_found['rating'][-1] if fields_found['rating'] else '?'}]:")
            print(f"   {rating_el.get_text(strip=True)}")
        
        # 8. URL
        url_selectors = [
            ('.Organic-Checkout a[href]', 'Organic-Checkout a'),
            ('.OrganicTitle a[href]', 'OrganicTitle a'),
            ('a[href]', 'a'),
        ]
        
        url_el = None
        for selector, name in url_selectors:
            el = snippet.select_one(selector)
            if el:
                href = el.get('href')
                if href and not href.startswith('#'):
                    url_el = el
                    fields_found['url'].append(name)
                    break
        
        if url_el:
            href = url_el.get('href', '')
            print(f"🔗 URL [{fields_found['url'][-1] if fields_found['url'] else '?'}]:")
            print(f"   {href[:60]}...")
        
        # 9. ДОСТАВКА
        delivery_el = snippet.select_one('.EDeliveryGroup, [class*="EDeliveryGroup"]')
        if delivery_el:
            items = delivery_el.select('.EDeliveryGroup-Item')
            print(f"🚚 Доставка: {len(items)} вариантов")
            for item in items[:2]:
                print(f"   - {item.get_text(strip=True)[:40]}")
            fields_found['delivery'].append('EDeliveryGroup')
        
        # 10. Другие компоненты
        components = []
        comp_checks = [
            ('EPriceGroup', '.EPriceGroup, [class*="EPriceGroup"]'),
            ('EPriceBarometer', '.EPriceBarometer, [class*="EPriceBarometer"]'),
            ('EBnpl', '.EBnpl, [class*="EBnpl"]'),
            ('Fintech', '.Fintech:not(.Fintech-Icon)'),
            ('EMarketCheckoutLabel', '.EMarketCheckoutLabel'),
        ]
        
        for name, selector in comp_checks:
            if snippet.select_one(selector):
                components.append(name)
        
        if components:
            print(f"🧩 Компоненты: {', '.join(components)}")
    
    # Итоговая статистика
    print("\n" + "="*80)
    print("📊 СТАТИСТИКА НАЙДЕННЫХ СЕЛЕКТОРОВ")
    print("="*80)
    
    from collections import Counter
    
    for field, selectors in fields_found.items():
        if selectors:
            counter = Counter(selectors)
            print(f"\n{field}:")
            for sel, cnt in counter.most_common():
                print(f"   {sel}: {cnt}")
        else:
            print(f"\n{field}: НЕ НАЙДЕНО")
    
    # Рекомендации
    print("\n" + "="*80)
    print("📝 РЕКОМЕНДАЦИИ ПО СЕЛЕКТОРАМ ДЛЯ Organic_withOfferInfo")
    print("="*80)
    
    recommendations = {
        '#OrganicTitle': ['.OrganicTitle', '.Organic-Title', '[class*="OrganicTitle"]'],
        '#OrganicPrice': ['.EPrice-Value (исключая EPrice_view_old)'],
        '#OldPrice': ['.EPrice_view_old .EPrice-Value'],
        '#discount': ['.LabelDiscount .Label-Content'],
        '#OrganicHost': ['.Path (первая часть до ›)'],
        '#OrganicImage': ['.Organic-OfferThumb img', '.EThumb-Image'],
        '#ProductRating': ['.ELabelRating .Label-Content'],
        '#ProductURL': ['.OrganicTitle a[href]', '.Organic-Checkout a[href]'],
    }
    
    for field, sels in recommendations.items():
        print(f"\n{field}:")
        for s in sels:
            print(f"   - {s}")


if __name__ == "__main__":
    html_path = "/Users/shchuchkin/Documents/GitHub/fluffy-chainsaw/examples/iphone17.html"
    
    if not Path(html_path).exists():
        print(f"❌ Файл не найден: {html_path}")
        exit(1)
    
    analyze_organic_offerinfo(html_path)

