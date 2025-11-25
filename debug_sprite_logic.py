
import re

# The CSS content from the file (from previous python run)
css_snippet = """
.favicon_page_0.favicon_entry_1 .favicon__icon,.Favicon-Page0.Favicon-Entry1.Favicon{background-image:url(//favicon.yandex.net/favicon/v2/market.yandex.ru;wishmaster.me;yandex.ru;https://techline24.ru;https://video-shoper.ru;https://mi-shop.com;https://televizor-4k.ru;https://www.market777.ru;https://zvonmarket.ru;https://www.onlinetrade.ru;https://tvteam.ru;https://vsesmart.ru;https://armadatv.ru;alikson.ru;https://texnosklad.ru;https://telemarket24.ru;https://www.holodilnik.ru;https://zvk.ru;https://wishmaster.me;https://quke.ru;https://store77.net;https://istudio-msk.ru;https://iche-b.ru;https://www.mvideo.ru;https://www.citilink.ru;https://www.ozon.ru;https://biggeek.ru;https://www.pleer.ru;https://www.vseinstrumenti.ru;https://www.maxidom.ru;https://www.dns-shop.ru?size=32&stub=1&reqid=1732455660545791-17098097085326426964-balancer-l7leveler-kubr-yp-sas-112-BAL-8115);background-size:16px}
"""

# Extract URL
match = re.search(r'url\(([^)]+)\)', css_snippet)
bgUrl = match.group(1)
print(f"BgUrl: {bgUrl}")

# Extract v2 part
v2Match = re.search(r'favicon\.yandex\.net\/favicon\/v2\/(.+?)(\?|$)', bgUrl)
addressesString = v2Match.group(1)
print(f"AddressesString: {addressesString}")

# Clean parameters if any (logic from utils.ts)
if '?' in addressesString:
    addressesString = addressesString.split('?')[0]

# Split
addresses = [addr.strip() for addr in addressesString.split(';') if addr.strip()]

print(f"Total addresses: {len(addresses)}")
for i, addr in enumerate(addresses):
    print(f"Index {i}: {addr}")
    if i > 15: break

# Check logic for pos_3
pos = 3
print(f"\nCheck pos={pos}:")
if pos < len(addresses):
    print(f"Address at {pos}: {addresses[pos]}")
else:
    print("Out of bounds")

# Check logic for pos_4
pos = 4
print(f"\nCheck pos={pos}:")
if pos < len(addresses):
    print(f"Address at {pos}: {addresses[pos]}")

