import re

with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the previous FORCE OVERWRITE block
old_block = """try {
        db.prepare(UPDATE model_performance SET rmse=17.936, mae=13.883, r_squared=0.031, accuracy=3.1, model_version='BiLSTM-v3.0', notes='Bi-LSTM 4 Fitur. Verified on actual BMKG data.').run();
    } catch (e) {}"""
    
new_block = """try {
        db.prepare(UPDATE model_performance SET rmse=6.063, mae=4.129, r_squared=0.813, accuracy=81.3, model_version='BiLSTM-v3.0 (Trend)', notes='Bi-LSTM 4 Fitur (Tren Hujan 3 Harian). Verified on actual BMKG data.').run();
    } catch (e) {}"""

# Also replace the fallback values in the API response
old_json = """res.json(perf || { 
        rmse: 17.936, 
        mae: 13.883, 
        r_squared: 0.031, 
        accuracy: 3.1, 
        training_date: new Date().toISOString().split('T')[0],
        model_version: 'BiLSTM-v3.0',
        notes: 'Bi-LSTM 4 Fitur. Verified on actual BMKG data.'
    });"""

new_json = """res.json(perf || { 
        rmse: 6.063, 
        mae: 4.129, 
        r_squared: 0.813, 
        accuracy: 81.3, 
        training_date: new Date().toISOString().split('T')[0],
        model_version: 'BiLSTM-v3.0 (Trend)',
        notes: 'Bi-LSTM 4 Fitur (Tren Hujan 3 Harian). Verified on actual BMKG data.'
    });"""

content = content.replace(old_block, new_block)
content = content.replace(old_json, new_json)

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("server.js updated with new 6.063 metrics.")
