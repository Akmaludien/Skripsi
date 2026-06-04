import re
with open('public/css/style.css', 'r', encoding='utf-8') as f:
    content = f.read()
root_match = re.search(r':root\s*\{([^}]+)\}', content)
if root_match:
    with open('vars.txt', 'w', encoding='utf-8') as f:
        f.write(root_match.group(1))
