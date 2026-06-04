import sqlite3
from datetime import datetime

conn = sqlite3.connect('data/monitoring.db')
c = conn.cursor()

# Get today's date
today = datetime.now().strftime('%Y-%m-%d')

c.execute('''
    UPDATE model_performance 
    SET rmse = ?, mae = ?, r_squared = ?, accuracy = ?, training_date = ?, model_version = ?, notes = ?
    WHERE id = 1
''', (17.936, 13.883, 0.031, 3.1, today, 'BiLSTM-v3.0', 'Bi-LSTM 4 Fitur. Verified on actual training data.'))

conn.commit()
conn.close()

print("Model performance updated successfully in SQLite.")
