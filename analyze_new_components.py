#!/usr/bin/env python3
"""
Детальный анализ НОВЫХ компонентов из iPhone 17 HTML.
Создаём маппинг для парсера.
"""

import re
from bs4 import BeautifulSoup
from pathlib import Path
from collections import Counter


def analyze_component(soup, component_name: str, max_examples: int = 3):
    """Детально анализирует компонент."""
    print(f"\n{'='*80}")
    print(f"🔍 Компонент: {component_name}")
    print('='*80)
    
    elements = soup.find_all(class_=re.compile(rf'^{component_name}(?:_|-|\s|$)'))
    print(f"Найдено элементов: {len(elements)}")
    
    if not elements:
        return None
    
    # Анализ структуры
    print(f"\n📋 Варианты классов:")
    class_variants = Counter()
    for el in elements:
        for cls in el.get('class', []):
            if component_name in cls:
                class_variants[cls] += 1
    
    for cls, cnt in class_variants.most_common(15):
        print(f"    {cls}: {cnt}")
    
    # Примеры содержимого
    print(f"\n📝 Примеры содержимого (первые {max_examples}):")
    for idx, el in enumerate(elements[:max_examples]):
        print(f"\n  --- Пример #{idx+1} ---")
        classes = ' '.join(el.get('class', []))[:80]
        print(f"  Класс: {classes}")
        
        # Структура вложенных элементов
        children_summary = []
        for child in el.find_all(recursive=False):
            child_cls = ' '.join(child.get('class', []))[:40] or child.name
            children_summary.append(child_cls)
        
        if children_summary:
            print(f"  Дети (прямые): {', '.join(children_summary[:5])}")
        
        # Текстовое содержимое
        text = el.get_text(strip=True)[:100]
        if text:
            print(f"  Текст: {text}...")
        
        # Атрибуты
        attrs = {k: v[:50] if isinstance(v, str) else v for k, v in el.attrs.items() if k != 'class'}
        if attrs:
            print(f"  Атрибуты: {attrs}")
    
    return elements


def analyze_reviews(soup):
    """Анализ EReviews."""
    print("\n" + "="*80)
    print("⭐ ДЕТАЛЬНЫЙ АНАЛИЗ: EReviews (отзывы/рейтинг магазина)")
    print("="*80)
    
    reviews = soup.find_all(class_=re.compile(r'EReviews'))
    
    for idx, rev in enumerate(reviews[:5]):
        print(f"\n--- EReviews #{idx+1} ---")
        
        # Ищем компоненты внутри
        shop_text = rev.find(class_=re.compile(r'EReviews-ShopText'))
        if shop_text:
            text = shop_text.get_text(strip=True)
            print(f"  ShopText: {text}")
        
        # Есть ли thumbnail
        thumb = rev.find(class_=re.compile(r'withThumb'))
        if thumb:
            print(f"  С миниатюрой: да")
        
        # Структура классов
        classes = ' '.join(rev.get('class', []))
        print(f"  Классы: {classes[:80]}")


def analyze_quote(soup):
    """Анализ EQuote."""
    print("\n" + "="*80)
    print("💬 ДЕТАЛЬНЫЙ АНАЛИЗ: EQuote (цитаты из отзывов)")
    print("="*80)
    
    quotes = soup.find_all(class_=re.compile(r'^EQuote(?:_|-|\s|$)'))
    
    for idx, q in enumerate(quotes[:5]):
        print(f"\n--- EQuote #{idx+1} ---")
        
        # Аватар
        avatar = q.find(class_=re.compile(r'EQuote-AuthorAvatar'))
        if avatar:
            img = avatar.find('img')
            if img:
                src = img.get('src', img.get('data-src', ''))[:60]
                print(f"  Аватар: {src}...")
        
        # Текст цитаты
        text_el = q.find(class_=re.compile(r'EQuote-Text'))
        if text_el:
            text = text_el.get_text(strip=True)[:100]
            print(f"  Цитата: {text}...")
        
        # Родительский контекст
        parent = q.parent
        if parent:
            parent_cls = ' '.join(parent.get('class', []))[:60]
            print(f"  Родитель: {parent_cls}")


def analyze_product_tabs(soup):
    """Анализ EProductTabs."""
    print("\n" + "="*80)
    print("📑 ДЕТАЛЬНЫЙ АНАЛИЗ: EProductTabs (вкладки товара)")
    print("="*80)
    
    tabs_containers = soup.find_all(class_=re.compile(r'^EProductTabs(?:_|\s|$)'))
    
    for idx, container in enumerate(tabs_containers[:3]):
        print(f"\n--- EProductTabs #{idx+1} ---")
        
        # Отдельные вкладки
        tabs = container.find_all(class_=re.compile(r'EProductTabs-Tab'))
        print(f"  Количество вкладок: {len(tabs)}")
        
        for tab_idx, tab in enumerate(tabs[:5]):
            tab_text = tab.get_text(strip=True)[:30]
            is_active = 'active' in ' '.join(tab.get('class', []))
            status = "✅ active" if is_active else ""
            print(f"    Tab {tab_idx+1}: {tab_text} {status}")
        
        # Содержимое панелей
        panes = container.find_all(class_=re.compile(r'EProductTabs-Pane'))
        print(f"  Панелей: {len(panes)}")


def analyze_product_specs(soup):
    """Анализ EProductSpecs."""
    print("\n" + "="*80)
    print("📋 ДЕТАЛЬНЫЙ АНАЛИЗ: EProductSpecs (характеристики товара)")
    print("="*80)
    
    specs_containers = soup.find_all(class_=re.compile(r'^EProductSpecs(?:_|\s|$)'))
    
    for idx, container in enumerate(specs_containers[:3]):
        print(f"\n--- EProductSpecs #{idx+1} ---")
        
        # Отдельные свойства
        properties = container.find_all(class_=re.compile(r'EProductSpecs-Property'))
        print(f"  Количество свойств: {len(properties)}")
        
        for prop_idx, prop in enumerate(properties[:10]):
            name_el = prop.find(class_=re.compile(r'EProductSpecs-PropertyName'))
            value_el = prop.find(class_=re.compile(r'EProductSpecs-PropertyValue'))
            
            name = name_el.get_text(strip=True) if name_el else "?"
            value = value_el.get_text(strip=True) if value_el else "?"
            print(f"    {name}: {value}")


def analyze_entity_card(soup):
    """Анализ EntityCard."""
    print("\n" + "="*80)
    print("🃏 ДЕТАЛЬНЫЙ АНАЛИЗ: EntityCard (карточка сущности)")
    print("="*80)
    
    cards = soup.find_all(class_=re.compile(r'^EntityCard(?:_|-|\s|$)'))
    
    for idx, card in enumerate(cards[:3]):
        print(f"\n--- EntityCard #{idx+1} ---")
        
        classes = ' '.join(card.get('class', []))
        print(f"  Классы: {classes[:100]}")
        
        # Items внутри
        items = card.find_all(class_=re.compile(r'EntityCard-Item|EntityCardItem'))
        print(f"  Items: {len(items)}")
        
        for item_idx, item in enumerate(items[:5]):
            # Изображение
            img = item.find('img')
            if img:
                src = img.get('src', '')[:40]
                alt = img.get('alt', '')[:30]
                print(f"    Item {item_idx+1}: img={src}... alt='{alt}'")
            else:
                text = item.get_text(strip=True)[:40]
                print(f"    Item {item_idx+1}: {text}")


def analyze_shop_split_discount(soup):
    """Анализ EShopSplitDiscount."""
    print("\n" + "="*80)
    print("💳 ДЕТАЛЬНЫЙ АНАЛИЗ: EShopSplitDiscount (Сплит со скидкой)")
    print("="*80)
    
    elements = soup.find_all(class_=re.compile(r'EShopSplitDiscount'))
    
    for idx, el in enumerate(elements[:5]):
        print(f"\n--- EShopSplitDiscount #{idx+1} ---")
        
        classes = ' '.join(el.get('class', []))
        print(f"  Классы: {classes}")
        
        # Цена
        price_el = el.find(class_=re.compile(r'EShopSplitDiscount-Price'))
        if price_el:
            print(f"  Цена: {price_el.get_text(strip=True)}")
        
        # Скидка
        discount_el = el.find(class_=re.compile(r'EShopSplitDiscount-DiscountLabel'))
        if discount_el:
            print(f"  Скидка: {discount_el.get_text(strip=True)}")
        
        # Метод оплаты
        pay_el = el.find(class_=re.compile(r'EShopSplitDiscount-PayMethod'))
        if pay_el:
            print(f"  Метод оплаты: {pay_el.get_text(strip=True)}")
        
        # Инфо
        info_el = el.find(class_=re.compile(r'EShopSplitDiscount-Info'))
        if info_el:
            print(f"  Инфо: {info_el.get_text(strip=True)}")


def create_mapping_suggestions(soup):
    """Создаёт предложения по маппингу для snippet-parser.ts"""
    print("\n" + "="*80)
    print("📝 ПРЕДЛОЖЕНИЯ ПО МАППИНГУ ДЛЯ snippet-parser.ts")
    print("="*80)
    
    mappings = []
    
    # EReviews
    reviews = soup.find_all(class_=re.compile(r'^EReviews(?:_|\s|$)'))
    if reviews:
        mappings.append({
            'field': '#EReviews_ShopText',
            'selectors': ['.EReviews-ShopText', '[class*="EReviews-ShopText"]'],
            'description': 'Текст отзывов магазина (рейтинг + отзывы)',
            'count': len(reviews)
        })
    
    # EQuote
    quotes = soup.find_all(class_=re.compile(r'^EQuote(?:_|\s|$)'))
    if quotes:
        mappings.append({
            'field': '#EQuote_Text',
            'selectors': ['.EQuote-Text', '[class*="EQuote-Text"]'],
            'description': 'Текст цитаты из отзыва',
            'count': len(quotes)
        })
        mappings.append({
            'field': '#EQuote_Avatar',
            'selectors': ['.EQuote-AuthorAvatar img', '[class*="EQuote-AuthorAvatar"] img'],
            'description': 'Аватар автора цитаты',
            'count': len(quotes)
        })
    
    # EProductSpecs
    specs = soup.find_all(class_=re.compile(r'^EProductSpecs(?:_|\s|$)'))
    if specs:
        mappings.append({
            'field': '#EProductSpecs',
            'selectors': ['.EProductSpecs', '[class*="EProductSpecs"]'],
            'description': 'Блок характеристик товара',
            'count': len(specs)
        })
    
    # EShopSplitDiscount
    split_disc = soup.find_all(class_=re.compile(r'EShopSplitDiscount'))
    if split_disc:
        mappings.append({
            'field': '#EShopSplitDiscount',
            'selectors': ['.EShopSplitDiscount', '[class*="EShopSplitDiscount"]'],
            'description': 'Блок Сплит со скидкой',
            'count': len(split_disc)
        })
        mappings.append({
            'field': '#EShopSplitDiscount_Price',
            'selectors': ['.EShopSplitDiscount-Price', '[class*="EShopSplitDiscount-Price"]'],
            'description': 'Цена в Сплит со скидкой',
            'count': len(split_disc)
        })
    
    # EntityCard
    entity_cards = soup.find_all(class_=re.compile(r'^EntityCard(?:_|\s|$)'))
    if entity_cards:
        mappings.append({
            'field': '#EntityCard',
            'selectors': ['.EntityCard', '[class*="EntityCard"]'],
            'description': 'Карточка сущности (похожие товары)',
            'count': len(entity_cards)
        })
    
    # Выводим маппинги
    print("\n// Добавить в parsing-rules.ts или parsing-rules.json:")
    print("// (или в src/utils/snippet-parser.ts)")
    print()
    
    for m in mappings:
        print(f"// {m['description']} ({m['count']} найдено)")
        print(f"'{m['field']}': {{")
        print(f"    domSelectors: {m['selectors']},")
        print(f"    description: '{m['description']}'")
        print(f"}},")
        print()
    
    return mappings


if __name__ == "__main__":
    html_path = "/Users/shchuchkin/Documents/GitHub/fluffy-chainsaw/examples/iphone17.html"
    
    print(f"📄 Загрузка файла: {html_path}")
    
    with open(html_path, 'r', encoding='utf-8') as f:
        html = f.read()
    
    print(f"📏 Размер HTML: {len(html):,} байт")
    
    soup = BeautifulSoup(html, 'html.parser')
    
    # Анализ новых компонентов
    analyze_reviews(soup)
    analyze_quote(soup)
    analyze_product_tabs(soup)
    analyze_product_specs(soup)
    analyze_entity_card(soup)
    analyze_shop_split_discount(soup)
    
    # Предложения по маппингу
    create_mapping_suggestions(soup)

