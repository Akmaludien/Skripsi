import re

path = r"c:\Users\NET\.gemini\antigravity\playground\infrared-whirlpool\public\css\style.css"
with open(path, 'r', encoding='utf-8') as f:
    css = f.read()

# 1. Fix .main-content transition and .sidebar.collapsed ~ .main-content
css = css.replace(
    '.sidebar.collapsed .sidebar-brand {',
    '.sidebar.collapsed ~ .main-content {\n        margin-left: 70px;\n    }\n    \n    .sidebar.collapsed .sidebar-brand {'
)

# 2. Add transition to .main-content
css = css.replace(
    'margin-left: var(--sidebar-width);',
    'margin-left: var(--sidebar-width);\n    transition: margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1);'
)

# 3. Fix nav-link centering
css = css.replace(
    '.sidebar.collapsed .nav-link {\n        justify-content: center;',
    '.sidebar.collapsed .nav-link {\n        gap: 0;\n        justify-content: center;'
)

# 4. Fix hamburger color
css = css.replace(
    '.mobile-menu-btn {',
    '.mobile-menu-btn {\n        color: var(--text-primary) !important;\n        font-family: inherit;'
)

css = css.replace(
    '.sidebar-toggle {',
    '.sidebar-toggle {\n    color: var(--text-primary) !important;\n    font-family: inherit;'
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(css)

print('Done')