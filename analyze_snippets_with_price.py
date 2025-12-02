#!/usr/bin/env python3
"""
Анализ сниппетов с ценой в iPhone 17 HTML.
Главный критерий: наличие цены = сниппет подходит для обработки.
"""

import re
from bs4 import BeautifulSoup
from pathlib import Path
from collections import Counter, defaultdict


def find_snippets_with_price(soup):
    """Находит все сниппеты, содержащие цену."""
    
    # Селекторы для поиска цен
    price_selectors = [
        '.EPrice',
        '[class*="EPrice"]',
        '.Price',
        '[class*="Price"]'
    ]
    
    # Находим все элементы с ценой
    price_elements = []
    for selector in price_selectors:
        price_elements.extend(soup.select(selector))
    
    print(f"🔍 Найдено элементов с ценой: {len(price_elements)}")
    
    # Собираем родительские контейнеры (сниппеты)
    snippet_classes = Counter()
    snippet_examples = defaultdict(list)
    
    for price_el in price_elements:
        # Поднимаемся вверх по DOM, ищем контейнер-сниппет
        current = price_el.parent
        depth = 0
        
        while current and depth < 15:
            classes = current.get('class', [])
            class_str = ' '.join(classes)
            
            # Ищем контейнеры с характерными классами
            for cls in classes:
                # Organic сниппеты
                if cls.startswith('Organic') and not cls.startswith('OrganicTitle'):
                    snippet_classes[cls] += 1
                    if len(snippet_examples[cls]) < 2:
                        snippet_examples[cls].append(current)
                
                # E-компоненты (EShopItem, EProductSnippet2, etc.)
                if cls.startswith('E') and ('Snippet' in cls or 'Item' in cls or 'Product' in cls):
                    snippet_classes[cls] += 1
                    if len(snippet_examples[cls]) < 2:
                        snippet_examples[cls].append(current)
                
                # Product карточки
                if 'Product' in cls and not cls.startswith('EProduct'):
                    snippet_classes[cls] += 1
                    if len(snippet_examples[cls]) < 2:
                        snippet_examples[cls].append(current)
            
            current = current.parent
            depth += 1
    
    return snippet_classes, snippet_examples


def analyze_organic_snippets(soup):
    """Детальный анализ Organic сниппетов."""
    
    print("\n" + "="*80)
    print("📦 ORGANIC СНИППЕТЫ (с модификаторами)")
    print("="*80)
    
    # Ищем все Organic элементы
    organic_elements = soup.find_all(class_=re.compile(r'^Organic(?:_|$)'))
    
    organic_types = Counter()
    for el in organic_elements:
        for cls in el.get('class', []):
            if cls.startswith('Organic'):
                organic_types[cls] += 1
    
    print("\nВсе классы Organic:")
    for cls, cnt in organic_types.most_common(30):
        # Проверяем, есть ли цена внутри
        examples = soup.find_all(class_=cls)
        has_price_count = 0
        for ex in examples:
            if ex.find(class_=re.compile(r'EPrice|Price')):
                has_price_count += 1
        
        price_status = f"✅ с ценой: {has_price_count}" if has_price_count > 0 else "❌ без цены"
        print(f"  {cls}: {cnt} ({price_status})")


def analyze_snippet_structure(soup, class_name: str, max_examples: int = 2):
    """Анализирует структуру конкретного типа сниппета."""
    
    print(f"\n{'='*80}")
    print(f"🔍 Структура: {class_name}")
    print('='*80)
    
    elements = soup.find_all(class_=class_name)
    print(f"Найдено элементов: {len(elements)}")
    
    for idx, el in enumerate(elements[:max_examples]):
        print(f"\n--- Пример #{idx+1} ---")
        
        # Заголовок
        title_el = el.find(class_=re.compile(r'Title'))
        if title_el:
            print(f"  📝 Title: {title_el.get_text(strip=True)[:60]}...")
        
        # Цена
        price_el = el.find(class_=re.compile(r'EPrice-Value|Price-Value'))
        if price_el:
            print(f"  💰 Price: {price_el.get_text(strip=True)}")
        
        # Старая цена
        old_price = el.find(class_=re.compile(r'EPrice_view_old|Price_old'))
        if old_price:
            val = old_price.find(class_=re.compile(r'Value'))
            print(f"  💸 Old Price: {val.get_text(strip=True) if val else old_price.get_text(strip=True)[:20]}")
        
        # Скидка
        discount = el.find(class_=re.compile(r'LabelDiscount|Discount'))
        if discount:
            print(f"  🏷️ Discount: {discount.get_text(strip=True)[:30]}")
        
        # Магазин
        shop = el.find(class_=re.compile(r'ShopName|Shop'))
        if shop:
            print(f"  🏪 Shop: {shop.get_text(strip=True)[:40]}")
        
        # URL
        link = el.find('a', href=True)
        if link:
            href = link.get('href', '')[:60]
            print(f"  🔗 URL: {href}...")
        
        # Изображение
        img = el.find('img')
        if img:
            src = img.get('src', img.get('data-src', ''))[:50]
            if src:
                print(f"  🖼️ Image: {src}...")
        
        # Доставка
        delivery = el.find(class_=re.compile(r'Delivery'))
        if delivery:
            print(f"  🚚 Delivery: {delivery.get_text(strip=True)[:40]}")
        
        # Рейтинг
        rating = el.find(class_=re.compile(r'Rating'))
        if rating:
            print(f"  ⭐ Rating: {rating.get_text(strip=True)[:20]}")


def create_container_mapping(soup):
    """Создаёт итоговый маппинг контейнеров с ценой."""
    
    print("\n" + "="*80)
    print("📋 ИТОГОВЫЙ МАППИНГ КОНТЕЙНЕРОВ С ЦЕНОЙ")
    print("="*80)
    
    # Известные контейнеры
    container_selectors = [
        'EShopItem',
        'EProductSnippet2',
        'Organic_withOfferInfo',
        'Organic_productOnly',
        'ProductTile-Item',
        'AdvProductGalleryCard',  # Реклама - пропускаем
    ]
    
    results = []
    
    for selector in container_selectors:
        elements = soup.find_all(class_=re.compile(rf'^{selector}(?:_|\s|$)'))
        
        # Считаем, сколько с ценой
        with_price = 0
        for el in elements:
            if el.find(class_=re.compile(r'EPrice|Price')):
                with_price += 1
        
        is_adv = 'Adv' in selector
        status = "🚫 РЕКЛАМА" if is_adv else ("✅" if with_price > 0 else "❌")
        
        results.append({
            'selector': selector,
            'total': len(elements),
            'with_price': with_price,
            'is_adv': is_adv
        })
        
        print(f"\n{status} {selector}")
        print(f"   Всего: {len(elements)}, с ценой: {with_price}")
    
    # Ищем новые контейнеры, которые могли пропустить
    print("\n" + "-"*40)
    print("🔎 Поиск других контейнеров с ценой...")
    
    all_with_price = soup.find_all(class_=re.compile(r'EPrice'))
    parent_classes = Counter()
    
    for price_el in all_with_price:
        # Идём вверх на 3-5 уровней
        current = price_el
        for _ in range(5):
            if current.parent:
                current = current.parent
                for cls in current.get('class', []):
                    # Исключаем уже известные и служебные классы
                    if any(k in cls for k in container_selectors):
                        continue
                    if cls.startswith('E') or 'Snippet' in cls or 'Product' in cls or 'Organic' in cls:
                        parent_classes[cls] += 1
    
    print("\nДругие контейнеры с EPrice внутри:")
    for cls, cnt in parent_classes.most_common(20):
        if cnt >= 5:  # Показываем только частые
            print(f"   {cls}: {cnt}")
    
    return results


if __name__ == "__main__":
    html_path = "/Users/shchuchkin/Documents/GitHub/fluffy-chainsaw/examples/iphone17.html"
    
    print(f"📄 Загрузка файла: {html_path}")
    
    with open(html_path, 'r', encoding='utf-8') as f:
        html = f.read()
    
    print(f"📏 Размер HTML: {len(html):,} байт")
    
    soup = BeautifulSoup(html, 'html.parser')
    
    # Анализ Organic сниппетов
    analyze_organic_snippets(soup)
    
    # Маппинг контейнеров
    containers = create_container_mapping(soup)
    
    # Детальный анализ основных типов
    for container in ['Organic_withOfferInfo', 'EProductSnippet2', 'EShopItem']:
        analyze_snippet_structure(soup, container)
    
    # Итоговые рекомендации
    print("\n" + "="*80)
    print("📝 РЕКОМЕНДАЦИИ ДЛЯ ПАРСЕРА")
    print("="*80)
    print("""
Контейнеры сниппетов с ценой (для SNIPPET_CONTAINER_NAMES):

1. ✅ EShopItem — карточки магазинов Яндекс.Маркета
2. ✅ EProductSnippet2 — сниппеты товаров (новый формат)
3. ✅ Organic_withOfferInfo — органические сниппеты с офером (цена, магазин)
4. 🆕 Organic_productOnly — сниппеты только с товаром (без сравнения)
5. 🚫 AdvProductGalleryCard — РЕКЛАМА (пропускаем!)

Селекторы для добавления в config.ts:
""")
    
    print("""
// В SNIPPET_CONTAINER_NAMES добавить:
export const SNIPPET_CONTAINER_NAMES = [
  'EShopItem',
  'ESnippet', 
  'EProductSnippet2',
  'Organic_withOfferInfo',     // ← Органик с офером
  'Organic_productOnly',       // ← Органик только товар
  // НЕ добавлять: AdvProductGalleryCard (реклама)
];
""")

