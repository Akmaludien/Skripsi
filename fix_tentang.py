import re

path = r"c:\Users\NET\.gemini\antigravity\playground\infrared-whirlpool\public\tentang.html"
with open(path, 'r', encoding='utf-8') as f:
    html = f.read()

html = html.replace(
    '<svg width="1200" height="1000" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1000">',
    '<svg width="100%" height="auto" style="min-width: 800px; display: block; margin: 0 auto;" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1000">'
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(html)

print('Done tentang.html')