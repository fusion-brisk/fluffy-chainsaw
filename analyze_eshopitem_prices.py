#!/usr/bin/env python3
"""
Анализ EShopItem сниппетов из Яндекс HTML для проверки цен и скидок.
Проверяет, какие сниппеты имеют EPriceGroup-Pair с OldPrice и Discount.
"""

import re
import sys
from bs4 import BeautifulSoup
from pathlib import Path

def analyze_eshopitem_prices(html_path: str):
    """Анализирует цены и скидки в EShopItem сниппетах."""
    
    print(f"📄 Загрузка файла: {html_path}")
    
    with open(html_path, 'r', encoding='utf-8') as f:
        html = f.read()
    
    print(f"📏 Размер HTML: {len(html):,} байт")
    
    soup = BeautifulSoup(html, 'html.parser')
    
    # Находим все EShopItem контейнеры
    eshopitems = soup.find_all(class_=re.compile(r'EShopItem(?!-)'))
    print(f"\n🔍 Найдено EShopItem контейнеров: {len(eshopitems)}")
    
    results = []
    
    for idx, item in enumerate(eshopitems, 1):
        # Извлекаем название магазина
        shop_name_el = item.find(class_=re.compile(r'EShopName|EShopItem-ShopName'))
        shop_name = "???"
        if shop_name_el:
            line_addon = shop_name_el.find(class_=re.compile(r'Line-AddonContent'))
            if line_addon:
                shop_name = line_addon.get_text(strip=True)
            else:
                shop_name = shop_name_el.get_text(strip=True)[:30]
        
        # Извлекаем заголовок
        title_el = item.find(class_=re.compile(r'EShopItem-Title'))
        title = title_el.get_text(strip=True)[:50] if title_el else "???"
        
        # Проверяем наличие EPriceGroup-Pair
        price_group_pair = item.find(class_=re.compile(r'EPriceGroup-Pair'))
        has_pair = price_group_pair is not None
        
        # Проверяем наличие старой цены (EPrice_view_old)
        old_price_el = item.find(class_=re.compile(r'EPrice_view_old'))
        has_old_price = old_price_el is not None
        old_price_value = ""
        if old_price_el:
            price_val = old_price_el.find(class_=re.compile(r'EPrice-Value'))
            if price_val:
                old_price_value = price_val.get_text(strip=True)
            else:
                old_price_value = old_price_el.get_text(strip=True)
        
        # Проверяем наличие скидки (LabelDiscount)
        discount_el = item.find(class_=re.compile(r'LabelDiscount'))
        has_discount = discount_el is not None
        discount_value = ""
        if discount_el:
            label_content = discount_el.find(class_=re.compile(r'Label-Content'))
            if label_content:
                discount_value = label_content.get_text(strip=True)
            else:
                discount_value = discount_el.get_text(strip=True)
        
        # Извлекаем текущую цену
        current_price = ""
        # Ищем EPriceGroup-Price (не old)
        price_group_price = item.find(class_=re.compile(r'EPriceGroup-Price'))
        if price_group_price:
            # Проверяем, что это не старая цена
            if 'EPrice_view_old' not in str(price_group_price.get('class', [])):
                price_val = price_group_price.find(class_=re.compile(r'EPrice-Value'))
                if price_val:
                    current_price = price_val.get_text(strip=True)
        
        # Если не нашли в EPriceGroup, ищем обычную цену
        if not current_price:
            price_el = item.find(class_=re.compile(r'EPrice-Value'))
            if price_el:
                # Убеждаемся, что это не старая цена
                parent_classes = str(price_el.parent.get('class', []))
                if 'EPrice_view_old' not in parent_classes:
                    current_price = price_el.get_text(strip=True)
        
        # Проверяем Label_view_outlineSpecial (скидка "Вам -X%")
        outline_special = item.find(class_=re.compile(r'Label_view_outlineSpecial'))
        has_outline_special = outline_special is not None
        
        results.append({
            'idx': idx,
            'shop': shop_name,
            'title': title,
            'current_price': current_price,
            'has_pair': has_pair,
            'has_old_price': has_old_price,
            'old_price': old_price_value,
            'has_discount': has_discount,
            'discount': discount_value,
            'has_outline_special': has_outline_special
        })
    
    # Вывод результатов
    print("\n" + "="*100)
    print("📊 РЕЗУЛЬТАТЫ АНАЛИЗА ЦEЕН И СКИДОК")
    print("="*100)
    
    for r in results:
        status_pair = "✅" if r['has_pair'] else "❌"
        status_old = "✅" if r['has_old_price'] else "❌"
        status_disc = "✅" if r['has_discount'] else "❌"
        status_special = "🟡" if r['has_outline_special'] else ""
        
        print(f"\n#{r['idx']} | {r['shop']}")
        print(f"   Заголовок: {r['title']}...")
        print(f"   Текущая цена: {r['current_price']}")
        print(f"   {status_pair} EPriceGroup-Pair | {status_old} OldPrice: {r['old_price']} | {status_disc} Discount: {r['discount']} {status_special}")
        
        # Ожидаемые Variant Properties
        expected_old_price = 'true' if r['has_old_price'] and r['old_price'] else 'false'
        expected_discount = 'true' if r['has_discount'] and r['discount'] else 'false'
        print(f"   → Ожидаемые Variant Props: Discount={expected_discount}, Old Price={expected_old_price}")
    
    # Сводка
    print("\n" + "="*100)
    print("📈 СВОДКА")
    print("="*100)
    
    with_pair = sum(1 for r in results if r['has_pair'])
    with_old = sum(1 for r in results if r['has_old_price'])
    with_disc = sum(1 for r in results if r['has_discount'])
    
    print(f"Всего EShopItem: {len(results)}")
    print(f"С EPriceGroup-Pair: {with_pair}")
    print(f"С OldPrice: {with_old}")
    print(f"С Discount: {with_disc}")
    
    # Проблемные случаи
    print("\n⚠️ ПРОБЛЕМНЫЕ СЛУЧАИ (EPriceGroup-Pair без данных):")
    problematic = [r for r in results if r['has_pair'] and not r['has_old_price'] and not r['has_discount']]
    if problematic:
        for r in problematic:
            print(f"   - #{r['idx']} {r['shop']}: EPriceGroup-Pair есть, но OldPrice и Discount отсутствуют!")
    else:
        print("   Нет проблемных случаев")
    
    # Сниппеты без скидок, которые не должны показывать скидку
    print("\n✅ СНИППЕТЫ БЕЗ СКИДОК (Discount должен быть false):")
    no_discount = [r for r in results if not r['has_discount']]
    for r in no_discount:
        print(f"   - #{r['idx']} {r['shop']}: цена {r['current_price']}")

if __name__ == "__main__":
    default_path = "/Users/shchuchkin/Downloads/iphone 16 pro max — Яндекс.html"
    html_path = sys.argv[1] if len(sys.argv) > 1 else default_path
    
    if not Path(html_path).exists():
        print(f"❌ Файл не найден: {html_path}")
        sys.exit(1)
    
    analyze_eshopitem_prices(html_path)

