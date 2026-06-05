import re

css_path = r"c:\Users\NET\.gemini\antigravity\playground\infrared-whirlpool\public\css\style.css"
with open(css_path, 'r', encoding='utf-8') as f:
    css = f.read()

# 1. Update light mode background
css = css.replace('--bg-main: #f8f9fa;', '--bg-main: #f1f5f9;')

# 2. Fix hamburger button styling to not be transparent
css = css.replace(
    '.mobile-menu-btn {\n        color: #ffffff !important;\n        font-family: inherit;',
    '.mobile-menu-btn {\n        color: #ffffff !important;\n        font-family: inherit;\n        background: rgba(255, 255, 255, 0.1) !important;\n        border-radius: 6px;\n        padding: 4px 8px;\n        border: 1px solid rgba(255, 255, 255, 0.15);'
)
css = css.replace(
    '.sidebar-toggle {\n    color: #ffffff !important;\n    font-family: inherit;',
    '.sidebar-toggle {\n    color: #ffffff !important;\n    font-family: inherit;\n    background: rgba(255, 255, 255, 0.1) !important;\n    border-radius: 6px;\n    padding: 4px 8px;\n    border: 1px solid rgba(255, 255, 255, 0.15);'
)

with open(css_path, 'w', encoding='utf-8') as f:
    f.write(css)


html_path = r"c:\Users\NET\.gemini\antigravity\playground\infrared-whirlpool\public\tentang.html"
with open(html_path, 'r', encoding='utf-8') as f:
    html = f.read()

# 3. SVG dark mode fix
html = html.replace('<rect width="1200" height="1000" fill="#f8f9fa"/>', '')
html = html.replace('fill: #333;', 'fill: currentColor;')
html = html.replace('fill: #666;', 'fill: currentColor; opacity: 0.8;')
html = html.replace('fill="#E8E8E8"', 'fill="var(--bg-main)"')
html = html.replace('stroke="#999"', 'stroke="var(--border-color)"')

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(html)

print('Done applying fixes')