#!/usr/bin/env python3
"""
Анализ Favicon_outer элементов в HTML.
Для сниппетов Organic_withOfferInfo фавиконка может быть в background-image.
"""

import re
from bs4 import BeautifulSoup
from pathlib import Path


def analyze_favicon_outer(html_path: str):
    """Анализирует структуру Favicon_outer элементов."""
    
    print(f"📄 Загрузка файла: {html_path}")
    
    with open(html_path, 'r', encoding='utf-8') as f:
        html = f.read()
    
    soup = BeautifulSoup(html, 'html.parser')
    
    # Находим все Favicon_outer элементы
    outer_favicons = soup.find_all(class_=re.compile(r'Favicon_outer'))
    print(f"\n🔍 Найдено Favicon_outer элементов: {len(outer_favicons)}")
    
    # Анализируем каждый
    for idx, fav in enumerate(outer_favicons[:15], 1):
        print(f"\n{'='*60}")
        print(f"📦 Favicon_outer #{idx}")
        print(f"{'='*60}")
        
        # Классы
        classes = ' '.join(fav.get('class', []))
        print(f"Классы: {classes[:80]}...")
        
        # Стили
        style = fav.get('style', '')
        print(f"Style: {style[:100]}..." if style else "Style: (пусто)")
        
        # Проверяем background-image в style
        if 'background-image' in style:
            # Извлекаем URL
            bg_match = re.search(r'background-image:\s*url\(["\']?([^"\')\s]+)["\']?\)', style)
            if bg_match:
                print(f"✅ background-image URL: {bg_match.group(1)[:80]}...")
        
        # Проверяем mask-image в style (для иконок)
        if 'mask-image' in style:
            mask_match = re.search(r'mask-image:\s*url\(["\']?([^"\')\s]+)["\']?\)', style)
            if mask_match:
                print(f"🎭 mask-image URL: {mask_match.group(1)[:80]}...")
        
        # Проверяем -webkit-mask-image
        if '-webkit-mask-image' in style:
            mask_match = re.search(r'-webkit-mask-image:\s*url\(["\']?([^"\')\s]+)["\']?\)', style)
            if mask_match:
                print(f"🎭 -webkit-mask-image URL: {mask_match.group(1)[:80]}...")
        
        # Ищем родительский контейнер
        parent = fav.parent
        if parent:
            parent_cls = ' '.join(parent.get('class', []))[:50]
            print(f"Родитель: {parent_cls}")
        
        # Ищем сниппет-контейнер
        snippet = fav.find_parent(class_=re.compile(r'Organic_withOfferInfo|EShopItem|EProductSnippet2'))
        if snippet:
            snippet_class = ' '.join(snippet.get('class', []))[:60]
            print(f"Сниппет: {snippet_class}...")
            
            # Извлекаем ShopName для контекста
            shop_el = snippet.find(class_=re.compile(r'Path'))
            if shop_el:
                path_text = shop_el.get_text(strip=True)[:40]
                print(f"ShopName: {path_text}")
    
    # Ищем CSS правила для Favicon_outer
    print("\n" + "="*60)
    print("🎨 CSS АНАЛИЗ: Favicon_outer")
    print("="*60)
    
    # Ищем inline стили в <style> тегах
    style_tags = soup.find_all('style')
    print(f"Найдено <style> тегов: {len(style_tags)}")
    
    for idx, style_tag in enumerate(style_tags[:5], 1):
        css_content = style_tag.string or ''
        if 'Favicon_outer' in css_content or 'favicon_outer' in css_content.lower():
            print(f"\n--- Style tag #{idx} содержит Favicon_outer ---")
            
            # Извлекаем правило
            rule_match = re.search(r'\.Favicon_outer[^{]*\{([^}]+)\}', css_content, re.IGNORECASE)
            if rule_match:
                print(f"Правило: {rule_match.group(0)[:200]}...")
    
    # Проверяем, есть ли background-image в самом HTML (не только в style атрибуте)
    print("\n" + "="*60)
    print("🔍 ПОИСК background-image В HTML")
    print("="*60)
    
    # Ищем элементы с inline background-image
    elements_with_bg = soup.find_all(style=re.compile(r'background-image'))
    print(f"Элементов с inline background-image: {len(elements_with_bg)}")
    
    for idx, el in enumerate(elements_with_bg[:10], 1):
        classes = ' '.join(el.get('class', []))[:40]
        style = el.get('style', '')[:80]
        print(f"  {idx}. class='{classes}' style='{style}...'")


if __name__ == "__main__":
    html_path = "/Users/shchuchkin/Documents/GitHub/fluffy-chainsaw/examples/iphone17.html"
    
    if not Path(html_path).exists():
        print(f"❌ Файл не найден: {html_path}")
        exit(1)
    
    analyze_favicon_outer(html_path)

