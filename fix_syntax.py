import re

with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the syntax error in server.js
target = "db.prepare(UPDATE model_performance SET rmse=6.063, mae=4.129, r_squared=0.813, accuracy=81.3, model_version='BiLSTM-v3.0 (Trend)', notes='Bi-LSTM 4 Fitur (Tren Hujan 3 Harian). Verified on actual BMKG data.').run();"

# We add the missing backticks
replacement = "db.prepare(UPDATE model_performance SET rmse=6.063, mae=4.129, r_squared=0.813, accuracy=81.3, model_version='BiLSTM-v3.0 (Trend)', notes='Bi-LSTM 4 Fitur (Tren Hujan 3 Harian). Verified on actual BMKG data.').run();"

if target in content:
    content = content.replace(target, replacement)
    with open('server.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Fixed syntax error in server.js")
else:
    print("Could not find the target string with missing backticks.")
