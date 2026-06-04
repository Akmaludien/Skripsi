import re

with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

target = """    if (!perf) {
        // No row exists, insert one
        db.prepare(INSERT INTO model_performance (rmse, mae, r_squared, accuracy, training_date, model_version, notes) VALUES (?, ?, ?, ?, ?, ?, ?))
            .run(1.909, 1.573, 0.921, 92.1, '2026-05-23', 'BiLSTM-v2.0', 'Bi-LSTM (128-64-32) log-transform. Verified on training data.');
        console.log('[DB] 📊 Model performance metrics initialized');
    }"""

replacement = """    if (!perf) {
        // No row exists, insert one
        db.prepare(INSERT INTO model_performance (rmse, mae, r_squared, accuracy, training_date, model_version, notes) VALUES (?, ?, ?, ?, ?, ?, ?))
            .run(17.936, 13.883, 0.031, 3.1, new Date().toISOString().split('T')[0], 'BiLSTM-v3.0', 'Bi-LSTM 4 Fitur. Verified on actual BMKG data.');
        console.log('[DB] 📊 Model performance metrics initialized');
    } else {
        // Overwrite dummy data with true actual data for deployment
        db.prepare(UPDATE model_performance SET rmse=?, mae=?, r_squared=?, accuracy=?, training_date=?, model_version=?, notes=?)
            .run(17.936, 13.883, 0.031, 3.1, new Date().toISOString().split('T')[0], 'BiLSTM-v3.0', 'Bi-LSTM 4 Fitur. Verified on actual BMKG data.');
    }"""

if target in content:
    content = content.replace(target, replacement)
    with open('server.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("server.js updated successfully (init metrics).")
else:
    print("Could not find target to replace in init metrics.")
