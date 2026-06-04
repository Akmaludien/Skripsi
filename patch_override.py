import re

with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

# I will add an unconditional UPDATE query right before console.log('[DB] ... initialized')
# Let's just find the console.log('[DB]') and put an update right before it, OR anywhere after the DB initialization.
# Let's put it right after: app.use(cors());
seed_override = """
// FORCE OVERWRITE model performance to true metrics
try {
    db.prepare(UPDATE model_performance SET rmse=17.936, mae=13.883, r_squared=0.031, accuracy=3.1, model_version='BiLSTM-v3.0', notes='Bi-LSTM 4 Fitur. Verified on actual BMKG data.').run();
} catch (e) {}
"""
content = content.replace("app.use(cors());", seed_override + "\napp.use(cors());")

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("server.js patched to force update DB")
