#!/usr/bin/env python3
"""
Visual comparison: SERP screenshot vs Figma result.

Downloads screenshots and result from relay, stitches screenshots into
one tall image, resizes to same width, computes pixel diff, and saves
side-by-side + diff images.

Usage:
  python3 scripts/visual-compare.py [relay_url]

Output:
  /tmp/contentify-compare/comparison.jpg  — side-by-side (screenshot | result | diff)
  /tmp/contentify-compare/diff.jpg        — diff only (red = different pixels)
  Prints summary stats to stdout.

Requires: pip install Pillow requests
"""

import sys
import os
import json
import urllib.request
from PIL import Image, ImageDraw, ImageFont, ImageChops
from io import BytesIO

RELAY = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3847'
OUT_DIR = '/tmp/contentify-compare'
os.makedirs(OUT_DIR, exist_ok=True)


def fetch_json(path):
    with urllib.request.urlopen(f'{RELAY}{path}', timeout=5) as r:
        return json.loads(r.read().decode())


def fetch_image(path):
    with urllib.request.urlopen(f'{RELAY}{path}', timeout=10) as r:
        return Image.open(BytesIO(r.read())).convert('RGB')


def main():
    # 1. Get comparison status
    status = fetch_json('/comparison')
    ss_meta = status['screenshot']
    res_meta = status['result']

    if not ss_meta['available']:
        print('No screenshot available')
        return 1
    if not res_meta['available']:
        print('No result available')
        return 1

    query = ss_meta['meta'].get('query', '?')
    ss_count = ss_meta['count']
    print(f'Query: "{query}"')
    print(f'Screenshots: {ss_count} segments')
    print(f'Result: {res_meta["meta"]["width"]}x{int(res_meta["meta"]["height"])}')

    # 2. Download and stitch screenshots
    segments = []
    for i in range(ss_count):
        try:
            img = fetch_image(f'/screenshot?index={i}')
            segments.append(img)
        except Exception as e:
            print(f'  Screenshot {i} failed: {e}')

    if not segments:
        print('No screenshot segments downloaded')
        return 1

    # Stitch vertically (all same width from viewport)
    ss_width = segments[0].width
    ss_height = sum(s.height for s in segments)
    screenshot = Image.new('RGB', (ss_width, ss_height))
    y = 0
    for seg in segments:
        screenshot.paste(seg, (0, y))
        y += seg.height

    print(f'Stitched screenshot: {ss_width}x{ss_height}')

    # 3. Download result
    result = fetch_image('/result?index=0')
    print(f'Result image: {result.width}x{result.height}')

    # 4. Normalize to same width
    target_width = min(ss_width, result.width, 800)

    ss_scale = target_width / ss_width
    screenshot_resized = screenshot.resize(
        (target_width, int(ss_height * ss_scale)),
        Image.LANCZOS
    )

    res_scale = target_width / result.width
    result_resized = result.resize(
        (target_width, int(result.height * res_scale)),
        Image.LANCZOS
    )

    # 5. Make same height (pad shorter one)
    max_h = max(screenshot_resized.height, result_resized.height)

    def pad_to_height(img, h):
        if img.height >= h:
            return img
        padded = Image.new('RGB', (img.width, h), (240, 240, 240))
        padded.paste(img, (0, 0))
        return padded

    ss_padded = pad_to_height(screenshot_resized, max_h)
    res_padded = pad_to_height(result_resized, max_h)

    # 6. Compute diff
    diff = ImageChops.difference(ss_padded, res_padded)
    # Amplify diff for visibility
    diff_amplified = diff.point(lambda x: min(x * 3, 255))

    # Count different pixels (threshold > 30)
    diff_pixels = sum(1 for r, g, b in diff.getdata() if r + g + b > 90)
    total_pixels = ss_padded.width * ss_padded.height
    diff_pct = (diff_pixels / total_pixels) * 100

    print(f'Diff: {diff_pixels}/{total_pixels} pixels ({diff_pct:.1f}%)')

    # 7. Save side-by-side
    margin = 4
    comparison = Image.new('RGB', (target_width * 3 + margin * 2, max_h + 30), (255, 255, 255))

    # Labels
    draw = ImageDraw.Draw(comparison)
    try:
        font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 14)
    except Exception:
        font = ImageFont.load_default()

    draw.text((10, 5), f'Screenshot ({query})', fill=(0, 0, 0), font=font)
    draw.text((target_width + margin + 10, 5), 'Figma Result', fill=(0, 0, 0), font=font)
    draw.text((target_width * 2 + margin * 2 + 10, 5), f'Diff ({diff_pct:.1f}%)', fill=(200, 0, 0), font=font)

    y_offset = 25
    comparison.paste(ss_padded, (0, y_offset))
    comparison.paste(res_padded, (target_width + margin, y_offset))
    comparison.paste(diff_amplified, (target_width * 2 + margin * 2, y_offset))

    comparison.save(f'{OUT_DIR}/comparison.jpg', quality=90)
    diff_amplified.save(f'{OUT_DIR}/diff.jpg', quality=90)

    # 8. Save individual crops for detailed comparison
    crop_height = 400
    for ci in range(min(5, max_h // crop_height)):
        top = ci * crop_height
        bottom = min(top + crop_height, max_h)
        ss_crop = ss_padded.crop((0, top, target_width, bottom))
        res_crop = res_padded.crop((0, top, target_width, bottom))
        diff_crop = diff_amplified.crop((0, top, target_width, bottom))

        strip = Image.new('RGB', (target_width * 3 + margin * 2, bottom - top), (255, 255, 255))
        strip.paste(ss_crop, (0, 0))
        strip.paste(res_crop, (target_width + margin, 0))
        strip.paste(diff_crop, (target_width * 2 + margin * 2, 0))
        strip.save(f'{OUT_DIR}/crop_{ci}.jpg', quality=90)

    print(f'\nSaved:')
    print(f'  {OUT_DIR}/comparison.jpg')
    print(f'  {OUT_DIR}/diff.jpg')
    print(f'  {OUT_DIR}/crop_0..{min(4, max_h // crop_height)}.jpg')
    return 0


if __name__ == '__main__':
    sys.exit(main())
