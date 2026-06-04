import re

with open('public/css/style.css', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update Light Mode Text Colors for Better Contrast
content = re.sub(r'--text-primary:\s*#[0-9a-fA-F]+;', '--text-primary: #0f172a;', content, count=1)
content = re.sub(r'--text-secondary:\s*#[0-9a-fA-F]+;', '--text-secondary: #475569;', content, count=1)
content = re.sub(r'--text-muted:\s*#[0-9a-fA-F]+;', '--text-muted: #64748b;', content, count=1)
content = re.sub(r'--bg-header:\s*var\(--primary-\d+\);', '--bg-header: var(--primary-900);', content, count=1)

# 2. Fix the Sticky Header Enhancement block
old_sticky = """/* --- Sticky Header Enhancement --- */
.top-header {
    position: sticky !important;
    top: 0;
    z-index: 1050;
    background: var(--bg-main);
    backdrop-filter: blur(10px);
}"""

new_sticky = """/* --- Sticky Header Enhancement --- */
.top-header {
    position: sticky !important;
    top: 0;
    z-index: 1050;
    background: var(--bg-header) !important;
    backdrop-filter: blur(10px);
    border-bottom: 1px solid rgba(255,255,255,0.1);
}
.top-header h1, .top-header span, .top-header button, .top-header i {
    color: var(--text-on-dark) !important;
}"""

if old_sticky in content:
    content = content.replace(old_sticky, new_sticky)
    print("Sticky header patched.")
else:
    # Try regex if exact string fails
    pattern = r'/\* --- Sticky Header Enhancement --- \*/\s*\.top-header\s*\{[^}]+\}'
    if re.search(pattern, content):
        content = re.sub(pattern, new_sticky, content)
        print("Sticky header patched via regex.")
    else:
        print("Could not find Sticky Header block.")

with open('public/css/style.css', 'w', encoding='utf-8') as f:
    f.write(content)

print("CSS updated successfully.")
