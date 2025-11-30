#!/usr/bin/env python3
"""
Анализ порядка EProductSnippet2 сниппетов в HTML.
Проверяет, какой сниппет идёт первым и какие данные у него.
"""

import re
from bs4 import BeautifulSoup
from pathlib import Path

def analyze_eproductsnippet_order(html_path: str):
    """Анализирует порядок EProductSnippet2 сниппетов."""
    
    print(f"📄 Загрузка файла: {html_path}")
    
    with open(html_path, 'r', encoding='utf-8') as f:
        html = f.read()
    
    print(f"📏 Размер HTML: {len(html):,} байт")
    
    soup = BeautifulSoup(html, 'html.parser')
    
    # Находим все EProductSnippet2 контейнеры
    snippets = soup.find_all(class_=re.compile(r'EProductSnippet2(?!-)'))
    print(f"\n🔍 Найдено EProductSnippet2: {len(snippets)}")
    
    for idx, snippet in enumerate(snippets[:10], 1):  # Первые 10
        # Название товара
        title_el = snippet.find(class_=re.compile(r'EProductSnippet2-Title'))
        title = title_el.get_text(strip=True)[:50] if title_el else 'N/A'
        
        # Бренд/домен
        brand_el = snippet.find(class_=re.compile(r'EProductSnippet2-Meta'))
        brand = brand_el.get_text(strip=True)[:30] if brand_el else 'N/A'
        
        # Цена
        price_el = snippet.find(class_=re.compile(r'EPriceGroup-Price|EPrice'))
        price = 'N/A'
        if price_el:
            price_text = price_el.get_text(strip=True)
            # Извлекаем только цифры
            price_digits = re.sub(r'[^\d]', '', price_text)
            if price_digits:
                # Форматируем с пробелами
                price = f"{int(price_digits):,}".replace(',', ' ')
        
        # Скидка
        discount_el = snippet.find(class_=re.compile(r'EPrice_view_discount|Discount'))
        discount = 'нет'
        if discount_el:
            discount_text = discount_el.get_text(strip=True)
            if discount_text:
                discount = discount_text
        
        print(f"\n#{idx}: {brand}")
        print(f"    Цена: {price}")
        print(f"    Скидка: {discount}")
        print(f"    Заголовок: {title}...")

if __name__ == '__main__':
    html_file = '/Users/shchuchkin/Downloads/iphone 16 pro max — Яндекс.html'
    analyze_eproductsnippet_order(html_file)

