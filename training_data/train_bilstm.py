"""
Training Script: Bidirectional LSTM untuk Prediksi Curah Hujan
Sesuai Proposal Skripsi - Akmaludien Ramadhan (41220014)

Arsitektur: 3-layer Bi-LSTM (128-64-32) + Dense(7)
Input: 60 hari × 5 features (rain, temp, rh, press, ws)
Output: 7 hari prediksi curah hujan
Transform: log1p pada target (rain) untuk compress range

Data source: InfluxDB (60 hari data dari 50 stasiun)
"""

import os
import sys
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
import joblib
from dotenv import load_dotenv

# Load .env from project root
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

# ─── Configuration ───────────────────────────────────
INFLUX_URL = os.getenv("INFLUX_URL", "http://localhost:8086")
INFLUX_TOKEN = os.getenv("INFLUX_TOKEN")
INFLUX_ORG = os.getenv("INFLUX_ORG", "SKRIPSI")
INFLUX_BUCKET = os.getenv("INFLUX_BUCKET", "skripsi")

MODEL_DIR = os.path.join(os.path.dirname(__file__), '..', 'models', 'aws')
MODEL_PATH = os.path.join(MODEL_DIR, 'model_aws_cibeureum_FINAL.h5')
SCALER_PATH = os.path.join(MODEL_DIR, 'scaler_aws_cibeureum.gz')

# Model parameters (sesuai proposal Tabel 3.2 & 3.4)
WINDOW_SIZE = 60      # 60 hari input
FORECAST_DAYS = 7     # 7 hari output
N_FEATURES = 5        # rain, temp, rh, press, ws
BATCH_SIZE = 32
EPOCHS = 100
LEARNING_RATE = 0.001

print("=" * 60)
print("  TRAINING Bi-LSTM MODEL - Prediksi Curah Hujan")
print("  STMKG Jawa Barat - Skripsi Akmaludien Ramadhan")
print("=" * 60)

# ─── Step 1: Fetch Data from InfluxDB ────────────────
print("\n[1/6] Fetching data from InfluxDB...")

from influxdb_client import InfluxDBClient

if not INFLUX_TOKEN:
    print("ERROR: INFLUX_TOKEN not set in .env")
    sys.exit(1)

client = InfluxDBClient(url=INFLUX_URL, token=INFLUX_TOKEN, org=INFLUX_ORG, timeout=60000)
query_api = client.query_api()

# Query all AWS/AAWS stations (yang punya temp, rh, press, ws)
query = f"""
    from(bucket: "{INFLUX_BUCKET}")
      |> range(start: -60d)
      |> filter(fn: (r) => r["_measurement"] == "AWS" or r["_measurement"] == "AAWS")
      |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
      |> sort(columns: ["_time"], desc: false)
"""

try:
    df = query_api.query_data_frame(query)
    if isinstance(df, list):
        df = pd.concat(df, ignore_index=True)
    print(f"   Raw data: {len(df)} rows")
except Exception as e:
    print(f"ERROR fetching data: {e}")
    sys.exit(1)

if df.empty:
    print("ERROR: No data found in InfluxDB. Run seed_influx_60d.js first.")
    sys.exit(1)

# ─── Step 2: Preprocessing ───────────────────────────
print("\n[2/6] Preprocessing data...")

# Select relevant columns
df['_time'] = pd.to_datetime(df['_time'])
df = df[['_time', 'id', 'rain', 'temp', 'rh', 'press', 'ws']].copy()
df = df.dropna(subset=['rain'])

# Resample to daily per station (max rain = total akumulasi harian)
daily_data = []
for station_id, group in df.groupby('id'):
    group = group.set_index('_time').sort_index()
    daily = group.resample('1D').agg({
        'rain': 'max',      # Akumulatif → max = total harian
        'temp': 'mean',
        'rh': 'mean',
        'press': 'mean',
        'ws': 'mean'
    }).dropna()
    daily['station_id'] = station_id
    daily_data.append(daily)

if not daily_data:
    print("ERROR: No daily data after resampling")
    sys.exit(1)

all_daily = pd.concat(daily_data)
print(f"   Daily data: {len(all_daily)} rows from {all_daily['station_id'].nunique()} stations")
print(f"   Rain range: {all_daily['rain'].min():.1f} - {all_daily['rain'].max():.1f} mm")

# ─── Step 3: Feature Engineering & Normalization ─────
print("\n[3/6] Feature engineering & normalization...")

from sklearn.preprocessing import MinMaxScaler

# Log-transform rain (compress range, handle 0)
all_daily['rain_log'] = np.log1p(all_daily['rain'])

# Features to use for model input
feature_cols = ['rain_log', 'temp', 'rh', 'press', 'ws']

# Fit scaler on all data
scaler = MinMaxScaler(feature_range=(0, 1))
all_daily[feature_cols] = scaler.fit_transform(all_daily[feature_cols])

print(f"   Features: {feature_cols}")
print(f"   Scaler fitted on {len(all_daily)} samples")

# ─── Step 4: Create Sequences (Sliding Window) ──────
print("\n[4/6] Creating training sequences (window={}, forecast={})...".format(WINDOW_SIZE, FORECAST_DAYS))

X_all, y_all = [], []

for station_id, group in all_daily.groupby('station_id'):
    group = group.sort_index()
    data = group[feature_cols].values
    rain_log = group['rain_log'].values  # Target is rain_log (first column)
    
    if len(data) < WINDOW_SIZE + FORECAST_DAYS:
        continue
    
    for i in range(len(data) - WINDOW_SIZE - FORECAST_DAYS + 1):
        X_all.append(data[i:i + WINDOW_SIZE])                    # (60, 5)
        y_all.append(rain_log[i + WINDOW_SIZE:i + WINDOW_SIZE + FORECAST_DAYS])  # (7,)

X_all = np.array(X_all)
y_all = np.array(y_all)

print(f"   Total sequences: {len(X_all)}")
print(f"   X shape: {X_all.shape}")  # (samples, 60, 5)
print(f"   y shape: {y_all.shape}")  # (samples, 7)

# Train-test split (80:20)
split_idx = int(len(X_all) * 0.8)
X_train, X_test = X_all[:split_idx], X_all[split_idx:]
y_train, y_test = y_all[:split_idx], y_all[split_idx:]

print(f"   Train: {len(X_train)} | Test: {len(X_test)}")

# ─── Step 5: Build & Train Bi-LSTM Model ────────────
print("\n[5/6] Building and training Bi-LSTM model...")
print(f"   Architecture: Bi-LSTM(128) → Bi-LSTM(64) → Bi-LSTM(32) → Dense(7)")
print(f"   Optimizer: Adam (lr={LEARNING_RATE})")
print(f"   Epochs: {EPOCHS} | Batch: {BATCH_SIZE}")

import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Bidirectional, LSTM, Dense, Dropout
from tensorflow.keras.callbacks import EarlyStopping
from tensorflow.keras.optimizers import Adam

model = Sequential([
    Bidirectional(LSTM(128, return_sequences=True, input_shape=(WINDOW_SIZE, N_FEATURES))),
    Dropout(0.2),
    Bidirectional(LSTM(64, return_sequences=True)),
    Dropout(0.2),
    Bidirectional(LSTM(32, return_sequences=False)),
    Dense(FORECAST_DAYS, activation='linear')
])

model.compile(
    optimizer=Adam(learning_rate=LEARNING_RATE),
    loss='mse',
    metrics=['mae']
)

model.summary()

early_stop = EarlyStopping(
    monitor='val_loss',
    patience=10,
    restore_best_weights=True,
    verbose=1
)

history = model.fit(
    X_train, y_train,
    validation_split=0.2,
    epochs=EPOCHS,
    batch_size=BATCH_SIZE,
    callbacks=[early_stop],
    verbose=1
)

# ─── Step 6: Evaluate & Save ────────────────────────
print("\n[6/6] Evaluating model...")

from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score

y_pred = model.predict(X_test)

# Inverse log-transform for real-world metrics
y_test_real = np.expm1(y_test)   # Back to mm
y_pred_real = np.expm1(y_pred)   # Back to mm
y_pred_real = np.clip(y_pred_real, 0, None)  # No negative rainfall

# Flatten for overall metrics
y_test_flat = y_test_real.flatten()
y_pred_flat = y_pred_real.flatten()

rmse = np.sqrt(mean_squared_error(y_test_flat, y_pred_flat))
mae = mean_absolute_error(y_test_flat, y_pred_flat)
r2 = r2_score(y_test_flat, y_pred_flat)

print(f"\n{'='*50}")
print(f"  MODEL EVALUATION RESULTS")
print(f"{'='*50}")
print(f"  RMSE  : {rmse:.4f} mm/hari  (target: ≤ 5)")
print(f"  MAE   : {mae:.4f} mm/hari  (target: ≤ 3)")
print(f"  R²    : {r2:.4f}          (target: ≥ 0.7)")
print(f"{'='*50}")

if rmse <= 5 and mae <= 3 and r2 >= 0.7:
    print("  ✅ SEMUA TARGET TERCAPAI!")
elif rmse <= 5 or r2 >= 0.7:
    print("  ⚠️  Sebagian target tercapai")
else:
    print("  ❌ Target belum tercapai - perlu tuning")

# Save model
os.makedirs(MODEL_DIR, exist_ok=True)
model.save(MODEL_PATH)
print(f"\n  Model saved: {MODEL_PATH}")

# Save scaler
joblib.dump(scaler, SCALER_PATH)
print(f"  Scaler saved: {SCALER_PATH}")

# Save metrics to JSON for reference
import json
metrics = {
    'rmse': float(rmse),
    'mae': float(mae),
    'r2': float(r2),
    'training_date': datetime.now().isoformat(),
    'model_version': 'BiLSTM-v2.0',
    'window_size': WINDOW_SIZE,
    'forecast_days': FORECAST_DAYS,
    'n_features': N_FEATURES,
    'features': feature_cols,
    'transform': 'log1p',
    'train_samples': len(X_train),
    'test_samples': len(X_test),
    'epochs_trained': len(history.history['loss']),
    'final_train_loss': float(history.history['loss'][-1]),
    'final_val_loss': float(history.history['val_loss'][-1]),
}
metrics_path = os.path.join(MODEL_DIR, 'training_metrics.json')
with open(metrics_path, 'w') as f:
    json.dump(metrics, f, indent=2)
print(f"  Metrics saved: {metrics_path}")

# Update SQLite model_performance table
try:
    import sqlite3
    db_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'monitoring.db')
    conn = sqlite3.connect(db_path)
    conn.execute('''
        INSERT INTO model_performance (rmse, mae, r_squared, accuracy, training_date, model_version, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (rmse, mae, r2, r2 * 100, datetime.now().strftime('%Y-%m-%d'), 'BiLSTM-v2.0',
          f'Trained on {len(X_train)} samples from {all_daily["station_id"].nunique()} stations. Log-transform applied.'))
    conn.commit()
    conn.close()
    print("  Database updated with new metrics")
except Exception as e:
    print(f"  Warning: Could not update database: {e}")

print(f"\n{'='*60}")
print("  TRAINING COMPLETE!")
print(f"{'='*60}")
