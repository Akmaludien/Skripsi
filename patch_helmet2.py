import re

with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the previous imgSrc line with the new one including cartocdn
old_img = 'imgSrc: ["\'self\'", "data:", "https://*.tile.openstreetmap.org", "https://unpkg.com"],'
new_img = 'imgSrc: ["\'self\'", "data:", "https://*.tile.openstreetmap.org", "https://*.basemaps.cartocdn.com", "https://unpkg.com"],'

if old_img in content:
    content = content.replace(old_img, new_img)
    with open('server.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Helmet CSP updated for CartoCDN.")
else:
    print("Could not find the target string to replace.")

