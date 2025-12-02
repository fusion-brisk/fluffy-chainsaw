#!/usr/bin/env python3
"""
Анализ EProductSnippet2 сниппетов из iphone17.html.
Сравниваем ожидаемые данные с результатом в Figma.
"""

import re
from bs4 import BeautifulSoup
from pathlib import Path


def analyze_eproductsnippet2(html_path: str):
    """Детально анализирует EProductSnippet2 сниппеты."""
    
    print(f"📄 Загрузка файла: {html_path}")
    
    with open(html_path, 'r', encoding='utf-8') as f:
        html = f.read()
    
    soup = BeautifulSoup(html, 'html.parser')
    
    # Находим все EProductSnippet2 (только top-level)
    all_eps2 = soup.find_all(class_=re.compile(r'^EProductSnippet2(?:_|\s|$)'))
    
    # Фильтруем вложенные
    snippets = []
    for s in all_eps2:
        if not s.find_parent(class_=re.compile(r'^EProductSnippet2')):
            snippets.append(s)
    
    print(f"\n🔍 Найдено EProductSnippet2 (top-level): {len(snippets)}")
    
    print("\n" + "="*80)
    print("📊 ДЕТАЛЬНЫЙ АНАЛИЗ EProductSnippet2")
    print("="*80)
    
    for idx, snippet in enumerate(snippets, 1):
        print(f"\n{'─'*60}")
        print(f"📦 EProductSnippet2 #{idx}")
        print(f"{'─'*60}")
        
        # 1. Название
        title_el = snippet.find(class_=re.compile(r'EProductSnippet2-Title'))
        title = title_el.get_text(strip=True)[:50] if title_el else "❌ НЕТ"
        print(f"📝 Название: {title}...")
        
        # 2. Цена
        price_el = snippet.find(class_=re.compile(r'EPrice-Value'))
        # Исключаем старую цену
        if price_el:
            parent_class = ' '.join(price_el.parent.get('class', []) if price_el.parent else [])
            if 'old' in parent_class.lower():
                # Ищем другую цену
                all_prices = snippet.find_all(class_=re.compile(r'EPrice-Value'))
                for p in all_prices:
                    pc = ' '.join(p.parent.get('class', []) if p.parent else [])
                    if 'old' not in pc.lower():
                        price_el = p
                        break
        price = price_el.get_text(strip=True) if price_el else "❌ НЕТ"
        print(f"💰 Цена: {price}")
        
        # 3. Старая цена
        old_price_el = snippet.find(class_=re.compile(r'EPrice_view_old'))
        if old_price_el:
            old_val = old_price_el.find(class_=re.compile(r'EPrice-Value'))
            old_price = old_val.get_text(strip=True) if old_val else old_price_el.get_text(strip=True)
            print(f"💸 Старая цена: {old_price}")
        
        # 4. Скидка
        discount_el = snippet.find(class_=re.compile(r'LabelDiscount'))
        if discount_el:
            disc_content = discount_el.find(class_=re.compile(r'Label-Content'))
            discount = disc_content.get_text(strip=True) if disc_content else discount_el.get_text(strip=True)
            print(f"🏷️ Скидка: {discount}")
        
        # 5. Магазин
        shop_el = snippet.find(class_=re.compile(r'EShopName'))
        if shop_el:
            line_addon = shop_el.find(class_=re.compile(r'Line-AddonContent'))
            shop = line_addon.get_text(strip=True) if line_addon else shop_el.get_text(strip=True)[:30]
            print(f"🏪 Магазин: {shop}")
        else:
            # Fallback на ShopInfo
            shop_info = snippet.find(class_=re.compile(r'EProductSnippet2-ShopInfo'))
            if shop_info:
                shop = shop_info.get_text(strip=True)[:30]
                print(f"🏪 Магазин (ShopInfo): {shop}")
        
        # 6. Изображение
        img_el = snippet.find(class_=re.compile(r'EProductSnippet2-Thumb'))
        if img_el:
            img = img_el.find('img')
            if img:
                src = img.get('src', img.get('data-src', ''))[:60]
                print(f"🖼️ Изображение: {src}...")
        
        # 7. Рейтинг
        rating_el = snippet.find(class_=re.compile(r'ELabelRating'))
        if rating_el:
            label_content = rating_el.find(class_=re.compile(r'Label-Content'))
            rating = label_content.get_text(strip=True) if label_content else rating_el.get_text(strip=True)
            print(f"⭐ Рейтинг: {rating}")
        
        # 8. Барометр цены
        barometer_el = snippet.find(class_=re.compile(r'EPriceBarometer'))
        if barometer_el:
            bar_classes = ' '.join(barometer_el.get('class', []))
            if 'Cheap' in bar_classes:
                print(f"📊 Барометр: Ниже рынка (below-market)")
            elif 'Average' in bar_classes:
                print(f"📊 Барометр: На уровне рынка (in-market)")
            elif 'Expensive' in bar_classes:
                print(f"📊 Барометр: Выше рынка (above-market)")
        
        # 9. Доставка
        delivery_el = snippet.find(class_=re.compile(r'EDeliveryGroup'))
        if delivery_el:
            items = delivery_el.find_all(class_=re.compile(r'EDeliveryGroup-Item'))
            delivery_texts = [i.get_text(strip=True) for i in items[:3]]
            print(f"🚚 Доставка: {', '.join(delivery_texts)}")
        
        # 10. Фавиконка
        fav_el = snippet.find(class_=re.compile(r'Favicon'))
        if fav_el:
            fav_classes = ' '.join(fav_el.get('class', []))[:60]
            fav_style = fav_el.get('style', '')[:80]
            print(f"🔖 Favicon классы: {fav_classes}...")
            if 'background-image' in fav_style:
                print(f"   Favicon style: {fav_style}...")
        
        # 11. Fintech (Сплит/Пэй)
        fintech_el = snippet.find(class_=re.compile(r'Fintech'))
        if fintech_el and 'Fintech-Icon' not in ' '.join(fintech_el.get('class', [])):
            fintech_classes = ' '.join(fintech_el.get('class', []))
            ftype = 'Split' if 'type_split' in fintech_classes else ('Pay' if 'type_pay' in fintech_classes else '?')
            print(f"💳 Fintech: {ftype}")
    
    # Сводка
    print("\n" + "="*80)
    print("📋 СВОДКА EProductSnippet2")
    print("="*80)
    
    with_price = sum(1 for s in snippets if s.find(class_=re.compile(r'EPrice-Value')))
    with_shop = sum(1 for s in snippets if s.find(class_=re.compile(r'EShopName|EProductSnippet2-ShopInfo')))
    with_image = sum(1 for s in snippets if s.find(class_=re.compile(r'EProductSnippet2-Thumb')))
    with_rating = sum(1 for s in snippets if s.find(class_=re.compile(r'ELabelRating')))
    with_barometer = sum(1 for s in snippets if s.find(class_=re.compile(r'EPriceBarometer')))
    with_delivery = sum(1 for s in snippets if s.find(class_=re.compile(r'EDeliveryGroup')))
    
    print(f"Всего: {len(snippets)}")
    print(f"С ценой: {with_price}")
    print(f"С магазином: {with_shop}")
    print(f"С изображением: {with_image}")
    print(f"С рейтингом: {with_rating}")
    print(f"С барометром: {with_barometer}")
    print(f"С доставкой: {with_delivery}")


if __name__ == "__main__":
    html_path = "/Users/shchuchkin/Documents/GitHub/fluffy-chainsaw/examples/iphone17.html"
    
    if not Path(html_path).exists():
        print(f"❌ Файл не найден: {html_path}")
        exit(1)
    
    analyze_eproductsnippet2(html_path)

