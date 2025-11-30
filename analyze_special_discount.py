#!/usr/bin/env python3
"""Анализ special discount и Fintech в EShopItem"""

from bs4 import BeautifulSoup
from collections import defaultdict

HTML_PATH = '/Users/shchuchkin/Downloads/iphone 16 pro max — Яндекс.html'

def main():
    with open(HTML_PATH, 'r', encoding='utf-8') as f:
        html = f.read()
    
    soup = BeautifulSoup(html, 'html.parser')
    
    # 1. Анализ LabelDiscount (скидки)
    print("="*70)
    print("1. LabelDiscount — анализ классов скидок")
    print("="*70)
    
    label_discounts = soup.select('[class*="LabelDiscount"]')
    print(f"Найдено элементов LabelDiscount: {len(label_discounts)}")
    
    ld_classes = defaultdict(int)
    for el in label_discounts:
        for cls in el.get('class', []):
            ld_classes[cls] += 1
    
    print("\nВсе классы LabelDiscount:")
    for cls, count in sorted(ld_classes.items(), key=lambda x: -x[1]):
        print(f"  {cls}: {count}")
    
    # Проверяем Label_view_outlineSpecial
    print("\n\nПоиск Label_view_outlineSpecial:")
    special_labels = soup.select('.Label_view_outlineSpecial, [class*="Label_view_outlineSpecial"]')
    print(f"Найдено: {len(special_labels)}")
    
    for i, label in enumerate(special_labels[:5]):
        classes = ' '.join(label.get('class', []))
        text = label.get_text(strip=True)
        parent_classes = ' '.join(label.parent.get('class', [])) if label.parent else ''
        print(f"\n  #{i+1}:")
        print(f"    Classes: {classes[:80]}")
        print(f"    Text: {text}")
        print(f"    Parent classes: {parent_classes[:60]}")
    
    # 2. Анализ всех Label view типов
    print("\n" + "="*70)
    print("2. Все Label_view_* типы")
    print("="*70)
    
    all_labels = soup.select('[class*="Label_view"]')
    view_types = defaultdict(int)
    for el in all_labels:
        for cls in el.get('class', []):
            if 'Label_view' in cls:
                view_types[cls] += 1
    
    print("Типы view:")
    for cls, count in sorted(view_types.items(), key=lambda x: -x[1]):
        print(f"  {cls}: {count}")
    
    # 3. Анализ Fintech внутри EShopItem
    print("\n" + "="*70)
    print("3. Fintech внутри EShopItem")
    print("="*70)
    
    eshop_items = soup.select('.EShopItem')
    
    for i, item in enumerate(eshop_items[:5]):
        title_el = item.select_one('.EShopItem-Title')
        title = title_el.get_text(strip=True)[:40] if title_el else 'N/A'
        
        # Ищем Fintech внутри EShopItem
        fintech = item.select_one('[class*="Fintech"]')
        ebnpl = item.select_one('[class*="EBnpl"]')
        
        print(f"\n  #{i+1}: {title}...")
        
        if fintech:
            fintech_classes = ' '.join(fintech.get('class', []))
            fintech_text = fintech.get_text(strip=True)[:40]
            print(f"    Fintech: {fintech_classes}")
            print(f"    Fintech text: {fintech_text}")
        else:
            print(f"    Fintech: НЕТ")
        
        if ebnpl:
            ebnpl_classes = ' '.join(ebnpl.get('class', []))
            ebnpl_text = ebnpl.get_text(strip=True)[:40]
            print(f"    EBnpl: {ebnpl_classes}")
            print(f"    EBnpl text: {ebnpl_text}")
        else:
            print(f"    EBnpl: НЕТ")
    
    # 4. Анализ EPriceGroup_withFintech
    print("\n" + "="*70)
    print("4. EPriceGroup с Fintech")
    print("="*70)
    
    price_groups = soup.select('[class*="EPriceGroup"]')
    pg_classes = defaultdict(int)
    for el in price_groups:
        for cls in el.get('class', []):
            if 'EPriceGroup' in cls:
                pg_classes[cls] += 1
    
    print("Классы EPriceGroup:")
    for cls, count in sorted(pg_classes.items(), key=lambda x: -x[1]):
        print(f"  {cls}: {count}")
    
    # Найти EPriceGroup_withFintech
    with_fintech = soup.select('.EPriceGroup_withFintech, [class*="EPriceGroup_withFintech"]')
    print(f"\nEPriceGroup_withFintech: {len(with_fintech)}")
    
    for i, pg in enumerate(with_fintech[:3]):
        print(f"\n  #{i+1} структура:")
        # Ищем Fintech внутри
        fintech_inside = pg.select_one('[class*="Fintech"]')
        if fintech_inside:
            fc = ' '.join(fintech_inside.get('class', []))
            ft = fintech_inside.get_text(strip=True)[:50]
            print(f"    Fintech classes: {fc}")
            print(f"    Fintech text: {ft}")
        else:
            print(f"    Fintech внутри: НЕТ")
        
        # Ищем содержимое
        children = []
        for child in pg.children:
            if hasattr(child, 'name') and child.name:
                cc = ' '.join(child.get('class', []))[:40]
                children.append(f"{child.name}.{cc}")
        print(f"    Children: {children[:5]}")
    
    # 5. Детальный анализ первого EShopItem с скидкой
    print("\n" + "="*70)
    print("5. Детальный анализ первого EShopItem со скидкой")
    print("="*70)
    
    for i, item in enumerate(eshop_items):
        label_discount = item.select_one('[class*="LabelDiscount"]')
        if label_discount:
            title_el = item.select_one('.EShopItem-Title')
            title = title_el.get_text(strip=True)[:50] if title_el else 'N/A'
            
            print(f"\nEShopItem #{i+1}: {title}...")
            
            # Полная структура EPriceGroup
            price_group = item.select_one('.EPriceGroup')
            if price_group:
                pg_classes = ' '.join(price_group.get('class', []))
                print(f"  EPriceGroup classes: {pg_classes}")
                
                # LabelDiscount детали
                ld_classes = ' '.join(label_discount.get('class', []))
                ld_text = label_discount.get_text(strip=True)
                print(f"  LabelDiscount classes: {ld_classes}")
                print(f"  LabelDiscount text: {ld_text}")
                
                # Проверяем outlineSpecial
                if 'outlineSpecial' in ld_classes:
                    print(f"  ✅ HAS outlineSpecial!")
                
                # Fintech
                fintech = price_group.select_one('[class*="Fintech"]')
                if fintech:
                    fc = ' '.join(fintech.get('class', []))
                    ft = fintech.get_text(strip=True)
                    print(f"  Fintech classes: {fc}")
                    print(f"  Fintech text: {ft}")
            
            # Только первые 3
            if i >= 2:
                break

if __name__ == '__main__':
    main()

