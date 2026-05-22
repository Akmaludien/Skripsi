import os
import pandas as pd
import numpy as np
import joblib
from sklearn.preprocessing import RobustScaler
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
import matplotlib.pyplot as plt

# Check for TensorFlow
try:
    import tensorflow as tf
    from tensorflow.keras.models import Sequential
    from tensorflow.keras.layers import LSTM, Bidirectional, Dense, Dropout, BatchNormalization
    from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau
except ImportError:
    print("\n[!] Error: TensorFlow tidak ditemukan atau tidak kompatibel.")
    print("Saran: Gunakan Python 3.10 atau 3.11 untuk menjalankan training ini.")
    exit()

# ─── 1. LOAD & PREPROCESS DATA ──────────────────────────────────────────
DATA_DIR = 'training_data'
MODEL_SAVE_PATH = 'models/aws/model_aws_optimized.h5'
SCALER_SAVE_PATH = 'models/aws/scaler_aws_optimized.gz'

def load_and_combine_data():
    all_files = [os.path.join(DATA_DIR, f) for f in os.listdir(DATA_DIR) if f.endswith('.xlsx') or f.endswith('.csv')]
    if not all_files:
        print(f"[!] Tidak ada file data di folder {DATA_DIR}")
        return None
    
    print(f"[*] Menemukan {len(all_files)} file data. Menggabungkan...")
    dfs = []
    for f in all_files:
        try:
            if f.endswith('.xlsx'):
                dfs.append(pd.read_excel(f))
            else:
                dfs.append(pd.read_csv(f))
        except Exception as e:
            print(f"Error loading {f}: {e}")
            
    df = pd.concat(dfs, ignore_index=True)
    # Pastikan kolom sesuai: rain, temp, rh, press, ws, wd, sr
    # Anda mungkin perlu menyesuaikan nama kolom di sini jika berbeda di Excel Anda
    return df

def prepare_sequences(data, lookback=60, horizon=7):
    X, y = [], []
    for i in range(len(data) - lookback - horizon + 1):
        X.append(data[i:(i + lookback)])
        # Target adalah rain (kolom 0) untuk 7 hari ke depan
        y.append(data[(i + lookback):(i + lookback + horizon), 0])
    return np.array(X), np.array(y)

# ─── 2. TRAINING PROCESS ──────────────────────────────────────────────
def train():
    df = load_and_combine_data()
    if df is None: return

    # Pembersihan Data & Feature Selection
    # (Contoh: Mengambil 7 fitur utama)
    features = ['rain', 'temp', 'rh', 'press', 'ws', 'wd', 'sr']
    data_raw = df[features].fillna(method='ffill').fillna(0).values

    # OPTIMASI: Log Transformation untuk menekan RMSE
    print("[*] Melakukan Log-Transformation pada data hujan...")
    data_raw[:, 0] = np.log1p(data_raw[:, 0])

    # Scaling dengan RobustScaler (Tahan terhadap Outlier)
    scaler = RobustScaler()
    data_scaled = scaler.fit_transform(data_raw)

    # Sequence Creation (Lookback 60 hari -> Predict 7 hari)
    X, y = prepare_sequences(data_scaled)
    
    # Split Data (80% Train, 20% Test)
    split = int(len(X) * 0.8)
    X_train, X_test = X[:split], X[split:]
    y_train, y_test = y[:split], y[split:]

    print(f"[*] Shape Training: {X_train.shape}, Shape Target: {y_train.shape}")

    # Build Bi-LSTM Model
    model = Sequential([
        Bidirectional(LSTM(128, return_sequences=True), input_shape=(60, 7)),
        BatchNormalization(),
        Dropout(0.3),
        Bidirectional(LSTM(64)),
        BatchNormalization(),
        Dropout(0.2),
        Dense(32, activation='relu'),
        Dense(7) # Output 7 hari
    ])

    model.compile(optimizer='adam', loss='huber_loss', metrics=['mae'])

    # Callbacks
    early_stop = EarlyStopping(monitor='val_loss', patience=15, restore_best_weights=True)
    reduce_lr = ReduceLROnPlateau(monitor='val_loss', factor=0.5, patience=5)

    print("[*] Memulai Training...")
    history = model.fit(
        X_train, y_train,
        validation_data=(X_test, y_test),
        epochs=100,
        batch_size=32,
        callbacks=[early_stop, reduce_lr]
    )

    # ─── 3. EVALUATION ────────────────────────────────────────────────
    y_pred = model.predict(X_test)
    
    # Balikkan Log Transformation untuk evaluasi mm asli
    y_test_inv = np.expm1(y_test)
    y_pred_inv = np.expm1(y_pred)
    
    rmse = np.sqrt(mean_squared_error(y_test_inv, y_pred_inv))
    mae = mean_absolute_error(y_test_inv, y_pred_inv)
    r2 = r2_score(y_test_inv.flatten(), y_pred_inv.flatten())

    print("\n" + "="*30)
    print(" HASIL EVALUASI (TARGET)")
    print("="*30)
    print(f"RMSE: {rmse:.2f} mm (Target <= 5)")
    print(f"MAE:  {mae:.2f} mm (Target <= 3)")
    print(f"R2:   {r2:.2f} (Target >= 0.7)")
    print("="*30)

    # Save Model & Scaler
    os.makedirs(os.path.dirname(MODEL_SAVE_PATH), exist_ok=True)
    model.save(MODEL_SAVE_PATH)
    joblib.dump(scaler, SCALER_SAVE_PATH)
    print(f"\n[OK] Model & Scaler berhasil disimpan di folder models/")

if __name__ == "__main__":
    train()
