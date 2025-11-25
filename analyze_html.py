
import sys

file_path = '/Users/shchuchkin/Downloads/телевизор xiaomi — Яндекс.html'
domains = [
    'techline24.ru',
    'video-shoper.ru', 
    'mi-shop.com',
    'televizor-4k.ru',
    'market777.ru',
    'zvonmarket.ru',
    'onlinetrade.ru'
]

try:
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
        print(f"File read successfully, length: {len(content)}")
        
        for domain in domains:
            index = content.find(domain)
            if index != -1:
                print(f"Found {domain} at index {index}")
                start = max(0, index - 200)
                end = min(len(content), index + 200)
                print(f"Context: ...{content[start:end]}...")
            else:
                print(f"NOT FOUND: {domain}")

except Exception as e:
    print(f"Error: {e}")
