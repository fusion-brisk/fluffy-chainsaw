
import sys
import re

file_path = '/Users/shchuchkin/Downloads/телевизор xiaomi — Яндекс.html'

try:
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    # Search for elements with Favicon classes
    pattern = re.compile(r'class="[^"]*(?:Favicon-Entry1|favicon_entry_1)[^"]*"[^>]*>', re.IGNORECASE)
    
    matches = pattern.finditer(content)
    count = 0
    for match in matches:
        count += 1
        if count > 20: break 
        
        print(f"\n--- Match {count} ---")
        full_tag = match.group(0)
        print(full_tag)
        
        # Extract classes
        class_match = re.search(r'class="([^"]*)"', full_tag)
        if class_match:
            print(f"Classes: {class_match.group(1)}")

        # Extract style
        style_match = re.search(r'style="([^"]*)"', full_tag)
        if style_match:
            print(f"Style: {style_match.group(1)}")

except Exception as e:
    print(f"Error: {e}")
