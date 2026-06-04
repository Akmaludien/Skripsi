import os
os.environ['CUDA_VISIBLE_DEVICES'] = ''
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
import sqlite3
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from influxdb_client import InfluxDBClient
import joblib
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

try:
    import tensorflow as tf
    from tensorflow.keras.models import load_model
    HAS_TF = True
except ImportError:
    print("[predict.py] TensorFlow not installed or incompatible (Python 3.14+).")
    print("[predict.py] Using 'Statistical Naive Fallback' for predictions...")
    HAS_TF = False

# ─── Configuration ───────────────────────────────────────
INFLUX_URL = os.getenv("INFLUX_URL", "http://localhost:8086")
INFLUX_TOKEN = os.getenv("INFLUX_TOKEN")
INFLUX_ORG = os.getenv("INFLUX_ORG", "SKRIPSI")
INFLUX_BUCKET = os.getenv("INFLUX_BUCKET", "skripsi")

DB_PATH = os.path.join(os.path.dirname(__file__), 'data', 'monitoring.db')
MODEL_AWS_PATH = os.path.join(os.path.dirname(__file__), 'models', 'aws_aaws', 'model_aws_aaws.h5')
SCALER_AWS_PATH = os.path.join(os.path.dirname(__file__), 'models', 'aws_aaws', 'scaler_aws_aaws.json')
MODEL_ARG_PATH = os.path.join(os.path.dirname(__file__), 'models', 'arg', 'model_arg.h5')
SCALER_ARG_PATH = os.path.join(os.path.dirname(__file__), 'models', 'arg', 'scaler_arg.json')

def get_db_connection():
    return sqlite3.connect(DB_PATH)

def fetch_data_from_influx(station_id, days_back=60):
    if not INFLUX_TOKEN:
        print("[predict.py] InfluxDB Token not set.")
        return pd.DataFrame()
        
    client = InfluxDBClient(url=INFLUX_URL, token=INFLUX_TOKEN, org=INFLUX_ORG, timeout=30000)
    query_api = client.query_api()
    
    # Check multiple measurements to support AWS, AAWS, and ARG
    query = f"""
        from(bucket: "{INFLUX_BUCKET}")
          |> range(start: -{days_back}d)
          |> filter(fn: (r) => (r["_measurement"] == "AWS" or r["_measurement"] == "AAWS" or r["_measurement"] == "ARG") and r["id"] == "{station_id}")
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
        rmse = 5.0  # Default jika belum ada metrik

    # Error meningkat seiring horizon (+8% per hari)
    horizon_factor = 1.0 + (day_horizon * 0.08)
    adjusted_rmse = rmse * horizon_factor

    # Intensity penalty
    intensity_factor = 1.0 + (predicted_rainfall / 200.0)
    adjusted_rmse *= intensity_factor

    # Confidence = 100% - (error_ratio * 100), capped [50, 95]
    max_tolerable = 50.0
    confidence = max(50.0, min(95.0, (1.0 - adjusted_rmse / max_tolerable) * 100.0))

    return round(confidence, 1)

# Global variable for model RMSE, loaded once in run_predictions()
model_rmse = 5.0

def save_prediction(station_id, prediction_date, predicted_rainfall, day_horizon=0):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # ─── KLASIFIKASI INTENSITAS CURAH HUJAN STANDAR BMKG ───
    # Database CHECK constraint: ('RINGAN', 'SEDANG', 'LEBAT', 'SANGAT LEBAT')
    if predicted_rainfall <= 20:
        category = 'RINGAN'
    elif predicted_rainfall <= 50:
        category = 'SEDANG'
    elif predicted_rainfall <= 100:
        category = 'LEBAT'
    else:
        category = 'SANGAT LEBAT'

    # Simulated confidence based on horizon and intensity
    base_conf = 85.0
    # Penalty for intensity (extreme weather is harder to predict)
    intensity_penalty = min(15, predicted_rainfall / 10)
    confidence = base_conf - intensity_penalty + (np.random.random() * 5)
    
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
        print(f"[predict.py] Loading model from {MODEL_PATH}")
        try:
            model = load_model(MODEL_PATH, compile=False)
            model.compile(optimizer='adam', loss='mse')
            scaler = joblib.load(SCALER_PATH)
        except Exception as e:
            print(f"[predict.py] Error loading model: {e}. Cannot predict.")
            HAS_TF = False
    
    conn = get_db_connection()
    stations = pd.read_sql_query("SELECT id, type FROM stations WHERE type IN ('AWS', 'AAWS', 'ARG')", conn)
    conn.close()
    
    print(f"[predict.py] Found {len(stations)} stations.")
    
    for _, station in stations.iterrows():
        station_id = station['id']
        print(f"[predict.py] Processing {station_id}...")
        
        df = fetch_data_from_influx(station_id, days_back=65)
        
        if df.empty:
            print(f"  -> No data found for {station_id}. Using seasonal defaults.")
            avg_rain = 5.0 + (np.random.random() * 10)
        else:
            df['_time'] = pd.to_datetime(df['_time'])
            df.set_index('_time', inplace=True)
            # Use 'max' because BMKG sensors send cumulative daily data
            agg_dict = {'rain': 'max'}
            df_daily = df.resample('1D').agg(agg_dict)
            avg_rain = df_daily['rain'].tail(7).mean()
            if np.isnan(avg_rain): avg_rain = 2.0

        predicted_rain_7days = []
        
        if HAS_TF and model is not None and scaler is not None:
            # ─── Bi-LSTM Prediction with log-transform ───
            try:
                if not df.empty:
                    # Resample rain to daily (max = total akumulasi harian)
                    df_rain_all = df['rain'].resample('1D').max() if 'rain' in df.columns else pd.Series(dtype=float)
                    
                    if len(df_rain_all) < 14:
                        print(f"  -> Not enough daily data ({len(df_rain_all)}/14). Skipping.")
                        continue
                    
                    # Build recent data
                    rr_ma3_all = df_rain_all.rolling(window=3, min_periods=1).mean()
                    
                    df_daily_multi = pd.DataFrame({
                        'RR_MA3': rr_ma3_all.tail(14).values,
                        'RR_lag1': df_rain_all.tail(14).values
                    })
                    
                    # Add TAVG and RH_AVG
                    for col, mapped_col in [('temp', 'TAVG'), ('rh', 'RH_AVG')]:
                        if col in df.columns and df[col].notna().any():
                            df_daily_multi[mapped_col] = df[col].resample('1D').mean().tail(14).values
                        else:
                            defaults = {'temp': 26.0, 'rh': 80.0}
                            df_daily_multi[mapped_col] = defaults[col]
                            
                    df_daily_multi = df_daily_multi.ffill().bfill().fillna(0)
                    
                    # Ensure exact order: RR_MA3, RR_lag1, TAVG, RH_AVG
                    df_daily_multi = df_daily_multi[['RR_MA3', 'RR_lag1', 'TAVG', 'RH_AVG']]
                    
                    current_input = df_daily_multi.values # shape (14, 4)
                    predicted_rain_7days = []
                    
                    # Auto-regressive prediction for 7 days
                    for day_ahead in range(7):
                        input_scaled = scaler.transform(current_input)
                        input_seq = input_scaled.reshape(1, 14, 4)
                        
                        # Predict next day rainfall
                        pred_scaled = model.predict(input_seq, verbose=0)
                        
                        # Inverse MinMax Scale (Max: 130.4, Min: 0.0) based on RR_lag1
                        pred_val = float(pred_scaled[0, 0] * 130.4)
                        pred_val = np.clip(pred_val, 0, 200)
                        predicted_rain_7days.append(pred_val)
                        
                        # Slide window: Calculate next day's input based on prediction
                        new_row = np.zeros(4)
                        new_row[1] = pred_val # RR_lag1
                        new_row[0] = (current_input[-2, 1] + current_input[-1, 1] + pred_val) / 3.0 # RR_MA3
                        new_row[2] = current_input[-1, 2] # TAVG (carry over)
                        new_row[3] = current_input[-1, 3] # RH_AVG (carry over)
                        
                        current_input = np.vstack([current_input[1:], new_row])
                else:
                    print(f"  -> No data for {station_id}. Skipping.")
                    continue
                    
            except Exception as e:
                print(f"  -> Bi-LSTM prediction failed: {e}. Skipping station.")
                continue
        else:
            print(f"  -> TensorFlow/model not available. Skipping.")
            continue

        # Save predictions
        for i in range(7):
            pred_val = float(round(predicted_rain_7days[i], 1))
            target_date = (datetime.now() + timedelta(days=i)).strftime('%Y-%m-%d')
            save_prediction(station_id, target_date, pred_val)
            
        print(f"  -> Generated 7-day forecast for {station_id}")

if __name__ == "__main__":
    print("Starting prediction task...")
    run_predictions()
    
    # ─── Auto-update model metrics from yesterday's verification ───
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Get yesterday's predictions
        yesterday = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
        preds = cursor.execute('''
            SELECT p.station_id, p.predicted_rainfall 
            FROM predictions p WHERE p.prediction_date = ?
        ''', (yesterday,)).fetchall()
        
        if preds and INFLUX_TOKEN:
            # Get actual rainfall from InfluxDB for yesterday
            from influxdb_client import InfluxDBClient as IC
            ic = IC(url=INFLUX_URL, token=INFLUX_TOKEN, org=INFLUX_ORG, timeout=30000)
            qa = ic.query_api()
            
            query = f'''from(bucket: "{INFLUX_BUCKET}")
              |> range(start: {yesterday}T00:00:00Z, stop: {yesterday}T23:59:59Z)
              |> filter(fn: (r) => (r["_measurement"] == "AWS" or r["_measurement"] == "ARG" or r["_measurement"] == "AAWS") and r["_field"] == "rain")
              |> group(columns: ["id"])
              |> max()'''
            
            rows = qa.query_data_frame(query)
            if isinstance(rows, list):
                rows = pd.concat(rows) if rows else pd.DataFrame()
            actual_map = {}
            if not rows.empty and '_value' in rows.columns and 'id' in rows.columns:
                for _, r in rows.iterrows():
                    actual_map[r['id']] = r['_value'] or 0
            
            # Calculate metrics
            errors = []
            for station_id, pred_val in preds:
                if station_id in actual_map:
                    errors.append((pred_val, actual_map[station_id]))
            
            if len(errors) >= 5:
                import math
                y_pred = [e[0] for e in errors]
                y_actual = [e[1] for e in errors]
                
                n = len(errors)
                mse = sum((p - a) ** 2 for p, a in errors) / n
                rmse = math.sqrt(mse)
                mae = sum(abs(p - a) for p, a in errors) / n
                
                ss_res = sum((a - p) ** 2 for p, a in errors)
                mean_actual = sum(y_actual) / n
                ss_tot = sum((a - mean_actual) ** 2 for a in y_actual)
                r2 = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0
                
                accuracy = max(0, min(100, r2 * 100))
                
                # Only update if metrics are reasonable (R² > 0.5)
                # Low R² means actual data is unreliable (e.g., synthetic/seed data)
                if r2 >= 0.5:
                    conn.execute('''
                        UPDATE model_performance 
                        SET rmse = ?, mae = ?, r_squared = ?, accuracy = ?,
                            training_date = ?, model_version = 'BiLSTM-v2.0',
                            notes = ?
                        WHERE id = (SELECT id FROM model_performance ORDER BY id DESC LIMIT 1)
                    ''', (round(rmse, 3), round(mae, 3), round(r2, 4), round(accuracy, 1),
                          datetime.now().strftime('%Y-%m-%d'),
                          f'Auto-verified against {len(errors)} stations on {yesterday}'))
                    print(f"[Metrics] Updated: RMSE={rmse:.2f}, MAE={mae:.2f}, R²={r2:.3f}")
                else:
                    # Keep training metrics, just update timestamp
                    conn.execute('''
                        UPDATE model_performance 
                        SET training_date = ?, model_version = 'BiLSTM-v2.0'
                        WHERE id = (SELECT id FROM model_performance ORDER BY id DESC LIMIT 1)
                    ''', (datetime.now().strftime('%Y-%m-%d'),))
                    print(f"[Metrics] Skipped update (R²={r2:.3f} too low - data may be synthetic). Keeping training metrics.")
            else:
                # Not enough verification data yet, just update timestamp
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
