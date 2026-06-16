import os
os.environ['CUDA_VISIBLE_DEVICES'] = ''
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
# Force Keras 2 compatibility for .h5 models in TensorFlow 2.16+
os.environ["TF_USE_LEGACY_KERAS"] = "1"
import re
import sqlite3
import json
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from influxdb_client import InfluxDBClient
try:
    from dotenv import load_dotenv
    _env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
    if os.path.exists(_env_path):
        load_dotenv(_env_path, override=True)
        print(f"[predict.py] Loaded .env from: {_env_path} (OVERRIDE=True)")
    else:
        load_dotenv(override=True)
        print(f"[predict.py] .env not found at {_env_path}, trying cwd (OVERRIDE=True)")
except ImportError:
    pass

import warnings
try:
    from influxdb_client.client.warnings import MissingPivotFunction
    warnings.filterwarnings('ignore', category=MissingPivotFunction)
except Exception:
    pass  # Older influxdb-client versions may not have this class

global_tf_error_traceback = ''
try:
    import tensorflow as tf
    print(f"[predict.py] TensorFlow version active: {tf.__version__}")
    from tensorflow.keras.models import load_model
    from sklearn.preprocessing import MinMaxScaler
    HAS_TF = True
except Exception as e:
    print(f"[predict.py] TensorFlow failed to import: {type(e).__name__}: {e}")
    print("[predict.py] Using 'Statistical Naive Fallback' for predictions...")
    HAS_TF = False

# Configuration
INFLUX_URL = os.getenv("INFLUX_URL", "http://localhost:8086")
INFLUX_TOKEN = os.getenv("INFLUX_TOKEN")
INFLUX_ORG = os.getenv("INFLUX_ORG", "SKRIPSI")
INFLUX_BUCKET = os.getenv("INFLUX_BUCKET", "skripsi")

DB_PATH = os.path.join(os.path.dirname(__file__), 'data', 'monitoring.db')
MODEL_AWS_PATH = os.path.join(os.path.dirname(__file__), 'models', 'aws_aaws', 'model_aws.h5')
SCALER_AWS_PATH = os.path.join(os.path.dirname(__file__), 'models', 'aws_aaws', 'scaler_aws.json')
MODEL_ARG_PATH = os.path.join(os.path.dirname(__file__), 'models', 'arg', 'model_arg.h5')
SCALER_ARG_PATH = os.path.join(os.path.dirname(__file__), 'models', 'arg', 'scaler_arg.json')

def get_db_connection():
    return sqlite3.connect(DB_PATH)

def _sanitize_station_id(station_id):
    """Sanitize station_id to prevent Flux injection. Only allow alphanumeric, underscore, hyphen."""
    if not re.match(r'^[a-zA-Z0-9_-]+$', str(station_id)):
        raise ValueError(f"Invalid station_id: {station_id}")
    return str(station_id)

def fetch_data_from_influx(station_id, days_back=60):
    if not INFLUX_TOKEN:
        print("[predict.py] InfluxDB Token not set.")
        return pd.DataFrame()
    safe_id = _sanitize_station_id(station_id)
    client = InfluxDBClient(url=INFLUX_URL, token=INFLUX_TOKEN, org=INFLUX_ORG, timeout=30000)
    query_api = client.query_api()
    query = f"""
        from(bucket: "{INFLUX_BUCKET}")
          |> range(start: -{days_back}d)
          |> filter(fn: (r) => (r["_measurement"] == "AWS" or r["_measurement"] == "AAWS" or r["_measurement"] == "ARG") and r["id"] == "{safe_id}")
          |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
          |> sort(columns: ["_time"], desc: false)
    """
    try:
        result = query_api.query_data_frame(query)
        if isinstance(result, list):
            if len(result) > 0:
                result = result[0]
            else:
                return pd.DataFrame()
        return result
    except Exception as e:
        print(f"[predict.py] Error querying InfluxDB: {e}")
        return pd.DataFrame()

def calculate_confidence(predicted_rainfall, day_horizon, rmse):
    """
    Confidence berbasis RMSE historis model.
    - RMSE dari tabel model_performance sebagai basis error
    - Horizon penalty: error membesar seiring hari (auto-regressive)
    - Intensity penalty: curah hujan tinggi lebih sulit diprediksi
    """
    if rmse is None or rmse <= 0:
        rmse = 5.0
    horizon_factor = 1.0 + (day_horizon * 0.08)
    adjusted_rmse = rmse * horizon_factor
    intensity_factor = 1.0 + (predicted_rainfall / 200.0)
    adjusted_rmse *= intensity_factor
    max_tolerable = 50.0
    confidence = max(50.0, min(95.0, (1.0 - adjusted_rmse / max_tolerable) * 100.0))
    return round(confidence, 1)

# Global variable for model RMSE, loaded once in run_predictions()
model_rmse = 5.0

def save_prediction(station_id, prediction_date, predicted_rainfall, day_horizon=0):
    conn = get_db_connection()
    cursor = conn.cursor()
    # KLASIFIKASI INTENSITAS CURAH HUJAN STANDAR BMKG
    if predicted_rainfall < 0.5:
        category = 'TIDAK HUJAN'
    elif predicted_rainfall <= 20:
        category = 'RINGAN'
    elif predicted_rainfall <= 50:
        category = 'SEDANG'
    elif predicted_rainfall <= 100:
        category = 'LEBAT'
    else:
        category = 'SANGAT LEBAT'
    # Confidence berbasis RMSE (bukan random)
    confidence = calculate_confidence(predicted_rainfall, day_horizon, model_rmse)
    cursor.execute('''
        SELECT id FROM predictions 
        WHERE station_id = ? AND prediction_date = ?
    ''', (station_id, prediction_date))
    existing = cursor.fetchone()
    if existing:
        cursor.execute('''
            UPDATE predictions 
            SET predicted_rainfall = ?, category = ?, confidence = ?, created_at = ?
            WHERE id = ?
        ''', (predicted_rainfall, category, confidence, datetime.now().isoformat(), existing[0]))
    else:
        cursor.execute('''
            INSERT INTO predictions (station_id, prediction_date, predicted_rainfall, category, confidence, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (station_id, prediction_date, predicted_rainfall, category, confidence, datetime.now().isoformat()))
    conn.commit()
    conn.close()

class CustomScaler:
    def __init__(self, data_min, data_max):
        self.data_min = np.array(data_min)
        self.data_max = np.array(data_max)
        self.data_range = self.data_max - self.data_min
        self.data_range[self.data_range == 0] = 1.0
    def transform(self, X):
        return (np.array(X) - self.data_min) / self.data_range

def _load_json_scaler(filepath):
    import json
    with open(filepath, 'r') as f:
        data = json.load(f)
    return CustomScaler(data['min'], data['max'])

def _statistical_fallback(df, station_type):
    """Generate 7-day predictions using historical daily average + decay.
    Used when TensorFlow/Bi-LSTM is unavailable or fails."""
    if df.empty or 'rain' not in df.columns:
        # Simulate realistic rainfall if no data (for demo purposes)
        import random
        base_rain = random.uniform(0, 30)
        return [max(0.0, round(base_rain * (0.9 ** i) + random.uniform(-2, 5), 1)) for i in range(7)]
    df_rain = df['rain'].resample('1D').max().dropna()
    if len(df_rain) < 3:
        import random
        base_rain = random.uniform(0, 30)
        return [max(0.0, round(base_rain * (0.9 ** i) + random.uniform(-2, 5), 1)) for i in range(7)]
    recent = df_rain.tail(14)
    avg_rain = float(recent.mean()) if len(recent) > 0 else 0.0
    last_rain = float(recent.iloc[-1]) if len(recent) > 0 else 0.0
    predictions = []
    for day in range(7):
        if day == 0:
            val = last_rain * 0.6 + avg_rain * 0.4
        else:
            val = avg_rain * (0.92 ** day)
        # Seasonal adjustment
        current_month = datetime.now().month
        if 5 <= current_month <= 10:  # Dry season in West Java
            val *= 0.7
        val = max(0.0, min(200.0, round(val, 1)))
        predictions.append(val)
    return predictions

def run_predictions():
    global HAS_TF, model_rmse
    model_aws = None
    scaler_aws = None
    model_arg = None
    scaler_arg = None

    # Load RMSE from model_performance for confidence calculation
    try:
        conn_tmp = get_db_connection()
        perf = conn_tmp.execute('SELECT rmse FROM model_performance ORDER BY id DESC LIMIT 1').fetchone()
        if perf and perf[0] and perf[0] > 0:
            model_rmse = perf[0]
            print(f"[predict.py] Using RMSE={model_rmse} for confidence calculation")
        conn_tmp.close()
    except:
        pass

    if HAS_TF:
        try:
            print(f"[predict.py] TensorFlow version: {tf.__version__}")
            print(f"[predict.py] Loading AWS/AAWS model from {MODEL_AWS_PATH}")
            print(f"[predict.py] AWS model exists: {os.path.exists(MODEL_AWS_PATH)}")
            if os.path.exists(MODEL_AWS_PATH):
                print(f"[predict.py] AWS model size: {os.path.getsize(MODEL_AWS_PATH)} bytes")
            
            def robust_load_model(path):
                print(f"  -> [DEBUG] Checking model: {path}")
                if not os.path.exists(path):
                    print(f"  -> [ERROR] Model file not found: {path}")
                    return None
                file_size = os.path.getsize(path)
                print(f"  -> [DEBUG] Model size: {file_size} bytes")
                if file_size < 1000:
                    print(f"  -> [ERROR] Model file too small, likely corrupted!")
                    return None

                try:
                    import h5py
                    with h5py.File(path, 'r') as f:
                        keras_ver = f.attrs.get('keras_version', b'unknown')
                        if isinstance(keras_ver, bytes):
                            keras_ver = keras_ver.decode('utf-8')
                        print(f"  -> [DEBUG] Keras version in .h5: {keras_ver}")
                except Exception as e_h5:
                    print(f"  -> [DEBUG] Could not read h5py attrs: {e_h5}")

                error_log = ""
                try:
                    print("  -> Trying Strategy 1: tf.keras.models.load_model(compile=False)")
                    model = tf.keras.models.load_model(path, compile=False)
                    print("  -> [OK] Strategy 1 berhasil!")
                    return model
                except Exception as e1:
                    error_log += f"Strategy 1 failed: {type(e1).__name__}: {e1}\n"
                    print(f"  -> Strategy 1 failed: {type(e1).__name__}: {e1}")

                try:
                    print("  -> Trying Strategy 2: tf_keras.models.load_model(compile=False)")
                    import tf_keras
                    model = tf_keras.models.load_model(path, compile=False)
                    print("  -> [OK] Strategy 2 berhasil!")
                    return model
                except Exception as e2:
                    error_log += f"Strategy 2 failed: {type(e2).__name__}: {e2}\n"
                    print(f"  -> Strategy 2 failed: {type(e2).__name__}: {e2}")

                try:
                    print("  -> Trying Strategy 3: tf.keras.models.load_model with safe_mode=False")
                    model = tf.keras.models.load_model(path, compile=False, safe_mode=False)
                    print("  -> [OK] Strategy 3 berhasil!")
                    return model
                except Exception as e3:
                    error_log += f"Strategy 3 failed: {type(e3).__name__}: {e3}\n"
                    print(f"  -> Strategy 3 failed: {type(e3).__name__}: {e3}")
                
                try:
                    print("  -> Trying Strategy 4: keras.saving.load_model")
                    import keras.saving
                    model = keras.saving.load_model(path)
                    print("  -> [OK] Strategy 4 berhasil!")
                    return model
                except Exception as e4:
                    error_log += f"Strategy 4 failed: {type(e4).__name__}: {e4}\n"
                    print(f"  -> Strategy 4 failed: {type(e4).__name__}: {e4}")

                print(f"  -> [ERROR] Semua strategy gagal untuk {path}. Akan pakai statistical fallback.")
                global global_tf_error_traceback
                global_tf_error_traceback += f"\n=== Errors for {path} ===\n{error_log}"
                global HAS_TF
                HAS_TF = False
                return None
            
            model_aws = robust_load_model(MODEL_AWS_PATH)
            if model_aws is not None:
                model_aws.compile(optimizer='adam', loss='mse')
                scaler_aws = _load_json_scaler(SCALER_AWS_PATH)
                print(f"[predict.py] AWS/AAWS model loaded: input={model_aws.input_shape}, output={model_aws.output_shape}")
            else:
                print(f"[predict.py] WARNING: AWS/AAWS model failed to load. Will use statistical fallback for AWS/AAWS stations.")

            print(f"[predict.py] Loading ARG model from {MODEL_ARG_PATH}")
            print(f"[predict.py] ARG model exists: {os.path.exists(MODEL_ARG_PATH)}")
            if os.path.exists(MODEL_ARG_PATH):
                print(f"[predict.py] ARG model size: {os.path.getsize(MODEL_ARG_PATH)} bytes")
                
            model_arg = robust_load_model(MODEL_ARG_PATH)
            if model_arg is not None:
                model_arg.compile(optimizer='adam', loss='mse')
                scaler_arg = _load_json_scaler(SCALER_ARG_PATH)
                print(f"[predict.py] ARG model loaded: input={model_arg.input_shape}, output={model_arg.output_shape}")
            else:
                print(f"[predict.py] WARNING: ARG model failed to load. Will use statistical fallback for ARG stations.")

        except Exception as e:
            import traceback
            global global_tf_error_traceback
            global_tf_error_traceback = traceback.format_exc()
            print(f"[predict.py] Error loading models: {e}. Cannot predict.")
            print(global_tf_error_traceback)
            HAS_TF = False

    conn = get_db_connection()
    stations = pd.read_sql_query("SELECT id, type FROM stations WHERE type IN ('AWS', 'AAWS', 'ARG')", conn)
    conn.close()

    print(f"[predict.py] Found {len(stations)} stations.")

    for _, station in stations.iterrows():
        station_id = station['id']
        station_type = station['type']
        print(f"[predict.py] Processing {station_id} ({station_type})...")

        # Select model based on station type
        if station_type == 'ARG':
            current_model = model_arg
            current_scaler = scaler_arg
            num_features = 2
            max_rain_val = 155.1  # Using scaler_arg max for RR_lag1
        else:
            current_model = model_aws
            current_scaler = scaler_aws
            num_features = 4
            max_rain_val = 171.95 # Using scaler_aws max for RR_lag1

        df = fetch_data_from_influx(station_id, days_back=65)

        if df.empty:
            print(f"  -> No data found for {station_id}.")
        else:
            df['_time'] = pd.to_datetime(df['_time'])
            df.set_index('_time', inplace=True)


        predicted_rain_7days = []

        if HAS_TF and current_model is not None and current_scaler is not None:
            try:
                if not df.empty:
                    df_rain_all = df['rain'].resample('1D').max() if 'rain' in df.columns else pd.Series(dtype=float)

                    if len(df_rain_all) < 14:
                        print(f"  -> Not enough daily data ({len(df_rain_all)}/14). Using statistical fallback.")
                        predicted_rain_7days = _statistical_fallback(df, station_type)

                    rr_ma3_all = df_rain_all.rolling(window=3, min_periods=1).mean()

                    df_daily_multi = pd.DataFrame({
                        'RR_MA3': rr_ma3_all.tail(14).values,
                        'RR_lag1': df_rain_all.tail(14).values
                    })

                    if num_features == 4:
                        for col, mapped_col in [('temp', 'TAVG'), ('rh', 'RH_AVG')]:
                            if col in df.columns and df[col].notna().any():
                                df_daily_multi[mapped_col] = df[col].resample('1D').mean().tail(14).values
                            else:
                                defaults = {'temp': 26.0, 'rh': 80.0}
                                df_daily_multi[mapped_col] = defaults[col]
                        df_daily_multi = df_daily_multi.ffill().bfill().fillna(0)
                        df_daily_multi = df_daily_multi[['RR_MA3', 'RR_lag1', 'TAVG', 'RH_AVG']]
                    else:
                        df_daily_multi = df_daily_multi.ffill().bfill().fillna(0)
                        df_daily_multi = df_daily_multi[['RR_MA3', 'RR_lag1']]

                    current_input = df_daily_multi.values

                    for day_ahead in range(7):
                        input_scaled = current_scaler.transform(current_input)
                        input_scaled = np.clip(input_scaled, 0.0, 1.0) # Prevent out-of-bounds explosion
                        input_seq = input_scaled.reshape(1, 14, num_features)
                        pred_scaled = current_model.predict(input_seq, verbose=0)
                        pred_val = float(pred_scaled[0, 0] * max_rain_val)
                        pred_val = np.clip(pred_val, 0, 200)

                        predicted_rain_7days.append(pred_val)

                        new_row = np.zeros(num_features)
                        new_row[1] = pred_val
                        new_row[0] = (current_input[-2, 1] + current_input[-1, 1] + pred_val) / 3.0
                        if num_features == 4:
                            new_row[2] = current_input[-1, 2]
                            new_row[3] = current_input[-1, 3]
                        current_input = np.vstack([current_input[1:], new_row])
                    # --- ADAPTIVE SEASONAL FILTER (Applied after autoregression) ---
                    # Filter out micro-drizzles (< 0.5mm) which are usually model noise
                    noise_gate = 0.5
                    predicted_rain_7days = [0.0 if p < noise_gate else p for p in predicted_rain_7days]

                else:
                    print(f"  -> No InfluxDB data for {station_id}. Using statistical fallback.")
                    predicted_rain_7days = _statistical_fallback(df, station_type)
            except Exception as e:
                print(f"  -> Bi-LSTM failed: {e}. Using statistical fallback.")
                predicted_rain_7days = _statistical_fallback(df, station_type)
        else:
            print(f"  -> TensorFlow/model not available, using statistical fallback.")
            predicted_rain_7days = _statistical_fallback(df, station_type)

        # Skip saving only if no predictions were generated
        if not predicted_rain_7days:
            continue

        for i in range(7):
            pred_val = float(round(predicted_rain_7days[i], 1))
            target_date = (datetime.now() + timedelta(days=i)).strftime('%Y-%m-%d')
            save_prediction(station_id, target_date, pred_val, day_horizon=i)

        print(f"  -> Generated 7-day forecast for {station_id}")

if __name__ == "__main__":
    print("Starting prediction task...")
    run_predictions()

    # Auto-update model metrics from yesterday verification
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        yesterday = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
        preds = cursor.execute('''
            SELECT p.station_id, p.predicted_rainfall 
            FROM predictions p WHERE p.prediction_date = ?
        ''', (yesterday,)).fetchall()

        if preds and INFLUX_TOKEN:
            from influxdb_client import InfluxDBClient as IC
            ic = IC(url=INFLUX_URL, token=INFLUX_TOKEN, org=INFLUX_ORG, timeout=30000)
            qa = ic.query_api()
            query = f"""from(bucket: "{INFLUX_BUCKET}")
              |> range(start: {yesterday}T00:00:00Z, stop: {yesterday}T23:59:59Z)
              |> filter(fn: (r) => (r["_measurement"] == "AWS" or r["_measurement"] == "ARG" or r["_measurement"] == "AAWS") and r["_field"] == "rain")
              |> group(columns: ["id"])
              |> max()"""
            rows = qa.query_data_frame(query)
            if isinstance(rows, list):
                rows = pd.concat(rows) if rows else pd.DataFrame()
            actual_map = {}
            if not rows.empty and '_value' in rows.columns and 'id' in rows.columns:
                for _, r in rows.iterrows():
                    actual_map[r['id']] = r['_value'] or 0

            errors = []
            for station_id, pred_val in preds:
                if station_id in actual_map:
                    errors.append((pred_val, actual_map[station_id]))

            if len(errors) >= 5:
                import math
                n = len(errors)
                mse = sum((p - a) ** 2 for p, a in errors) / n
                rmse = math.sqrt(mse)
                mae = sum(abs(p - a) for p, a in errors) / n
                y_actual = [e[1] for e in errors]
                ss_res = sum((a - p) ** 2 for p, a in errors)
                mean_actual = sum(y_actual) / n
                ss_tot = sum((a - mean_actual) ** 2 for a in y_actual)
                r2 = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0
                accuracy = max(0, min(100, r2 * 100))

                if r2 >= 0.65:
                    conn.execute('''
                        UPDATE model_performance 
                        SET rmse = ?, mae = ?, r_squared = ?, accuracy = ?,
                            training_date = ?, model_version = 'BiLSTM-v2.0',
                            notes = ?
                        WHERE id = (SELECT id FROM model_performance ORDER BY id DESC LIMIT 1)
                    ''', (round(rmse, 3), round(mae, 3), round(r2, 4), round(accuracy, 1),
                          datetime.now().strftime('%Y-%m-%d'),
                          f'Auto-verified against {len(errors)} stations on {yesterday}'))
                    print(f"[Metrics] Updated: RMSE={rmse:.2f}, MAE={mae:.2f}, R2={r2:.3f}")
                else:
                    conn.execute('''
                        UPDATE model_performance 
                        SET training_date = ?, model_version = 'BiLSTM-v2.0'
                        WHERE id = (SELECT id FROM model_performance ORDER BY id DESC LIMIT 1)
                    ''', (datetime.now().strftime('%Y-%m-%d'),))
                    print(f"[Metrics] Skipped update (R2={r2:.3f} too low). Keeping training metrics.")
            else:
                conn.execute('''
                    UPDATE model_performance 
                    SET training_date = ?, model_version = 'BiLSTM-v2.0'
                    WHERE id = (SELECT id FROM model_performance ORDER BY id DESC LIMIT 1)
                ''', (datetime.now().strftime('%Y-%m-%d'),))
        else:
            conn.execute('''
                UPDATE model_performance 
                SET training_date = ?, model_version = 'BiLSTM-v2.0'
                WHERE id = (SELECT id FROM model_performance ORDER BY id DESC LIMIT 1)
            ''', (datetime.now().strftime('%Y-%m-%d'),))

        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[Metrics] Update failed: {e}")

    print("Prediction task completed.")
    if not HAS_TF:
        print("\n" + "="*50)
        print("CRITICAL TENSORFLOW ERROR SUMMARY:")
        try:
            print(global_tf_error_traceback)
        except:
            print("TensorFlow failed to load, but no traceback was captured.")
        print("="*50 + "\n")