path = r"c:\Users\NET\.gemini\antigravity\playground\infrared-whirlpool\public\css\style.css"
with open(path, 'r', encoding='utf-8') as f:
    css = f.read()

# Fix 1: Force leaflet popup text to be dark always, because popup bg is always white
if '.leaflet-popup-content' not in css:
    css += "\n\n/* Fix Leaflet Popup Text Color */\n.leaflet-popup-content, .leaflet-popup-content-wrapper, .leaflet-popup-content * {\n    color: #1e293b !important;\n}\n"
else:
    # Append it anyway to override
    css += "\n\n.leaflet-popup-content, .leaflet-popup-content-wrapper, .leaflet-popup-content * {\n    color: #1e293b !important;\n}\n"

# Fix 2: Force hamburger menu color to be white always, because top-header is always dark blue
css = css.replace('color: var(--text-primary) !important;', 'color: #ffffff !important;')

with open(path, 'w', encoding='utf-8') as f:
    f.write(css)

print('CSS bugs fixed')