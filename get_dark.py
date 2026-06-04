import re
with open('public/css/style.css', 'r', encoding='utf-8') as f:
    content = f.read()
dark_match = re.search(r'\[data-theme="dark"\]\s*\{([^}]+)\}', content)
if dark_match:
    with open('dark_vars.txt', 'w', encoding='utf-8') as f:
        f.write(dark_match.group(1))
