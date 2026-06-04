import re

with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace basic app.use(helmet()) with configured helmet
old_helmet = "app.use(helmet());"
new_helmet = """app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com", "https://cdn.jsdelivr.net"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https://*.tile.openstreetmap.org", "https://unpkg.com"],
            connectSrc: ["'self'", "ws:", "wss:"],
        },
    },
}));"""

content = content.replace(old_helmet, new_helmet)

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Helmet CSP updated.")
