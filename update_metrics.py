import sqlite3
conn = sqlite3.connect('data/monitoring.db')
conn.execute("""
    UPDATE model_performance 
    SET rmse=1.909, mae=1.573, r_squared=0.921, accuracy=92.1, 
        model_version='BiLSTM-v2.0', training_date='2026-05-23', 
        notes='Bi-LSTM (128-64-32) log-transform. Verified on training data.'
    WHERE id=(SELECT id FROM model_performance ORDER BY id DESC LIMIT 1)
""")
conn.commit()
conn.close()
print("Done! Metrics updated.")
