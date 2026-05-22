import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
import sqlite3
import os

# Load Data Asli
file_path = 'training_data/access_data_STA2064_FEB 2020.xlsx'
df = pd.read_excel(file_path, engine='openpyxl')

# Mapping Kolom ke Fitur Model
mapping = {
    'rr': 'rain',
    'tt_air_avg': 'temp',
    'rh_avg': 'rh',
    'pp_air': 'press',
    'ws_avg': 'ws',
    'wd_avg': 'wd',
    'sr_avg': 'sr'
}

# Bersihkan data (Pandas 3.0 compatibility)
data = df[list(mapping.keys())].ffill().fillna(0)
X = data.drop('rr', axis=1)
y = data['rr']

# Split & Train
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
model = RandomForestRegressor(n_estimators=100, random_state=42)
model.fit(X_train, y_train)

# Prediksi & Evaluasi
y_pred = model.predict(X_test)
rmse = np.sqrt(mean_squared_error(y_test, y_pred))
mae = mean_absolute_error(y_test, y_pred)
r2 = r2_score(y_test, y_pred)

print(f"REAL ANALYSIS RESULT (STA2064):")
print(f"RMSE: {rmse:.4f}")
print(f"MAE: {mae:.4f}")
print(f"R2: {r2:.4f}")

# Update Database
db_path = 'data/monitoring.db'
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute('''
        UPDATE model_performance 
        SET rmse = ?, mae = ?, r_squared = ?, accuracy = ?, notes = ?
        WHERE id = (SELECT id FROM model_performance ORDER BY id DESC LIMIT 1)
    ''', (rmse, mae, r2, r2*100, f"Analysis based on real STA2064 Excel data (Feb 2020)"))
    conn.commit()
    conn.close()
    print("\n✓ Database updated with REAL metrics from your file.")
