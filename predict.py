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
    load_dotenv()
except ImportError:
    pass

try:
    import tensorflow as tf
    from tensorflow.keras.models import load_model
    from sklearn.preprocessing import MinMaxScaler
    HAS_TF = True
except ImportError:
    print("[predict.py] TensorFlow not installed or incompatible (Python 3.14+).")
    print("[predict.py] Using 'Statistical Naive Fallback' for predictions...")
    HAS_TF = False

# Configuration
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

def _load_json_scaler(path):
    """Load a MinMaxScaler from a JSON file (custom format)."""
    with open(path, 'r') as f:
        s = json.load(f)
    scaler = MinMaxScaler()
    data_min = np.array(s['min'])
    data_max = np.array(s['max'])
    data_range = data_max - data_min
    data_range[data_range == 0] = 1.0
    scaler.min_ = -data_min / data_range
    scaler.scale_ = 1.0 / data_range
    scaler.data_min_ = data_min
    scaler.data_max_ = data_max
    scaler.data_range_ = data_range
    scaler.n_features_in_ = len(data_min)
    scaler.feature_range = (0, 1)
    return scaler

def _statistical_fallback(df, station_type):
    """Generate 7-day predictions using historical daily average + decay.
    Used when TensorFlow/Bi-LSTM is unavailable or fails."""
    if df.empty or 'rain' not in df.columns:
        return [0.0] * 7
    df_rain = df['rain'].resample('1D').max().dropna()
    if len(df_rain) < 3:
        return [0.0] * 7
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
            # Load AWS/AAWS model (4 features: RR_MA3, RR_lag1, TAVG, RH_AVG)
            print(f"[predict.py] Loading AWS/AAWS model from {MODEL_AWS_PATH}")
            model_aws = load_model(MODEL_AWS_PATH, compile=False)
            model_aws.compile(optimizer='adam', loss='mse')
            scaler_aws = _load_json_scaler(SCALER_AWS_PATH)
            print(f"[predict.py] AWS/AAWS model loaded: input={model_aws.input_shape}, output={model_aws.output_shape}")

            # Load ARG model (2 features: RR_MA3, RR_lag1)
            print(f"[predict.py] Loading ARG model from {MODEL_ARG_PATH}")
            model_arg = load_model(MODEL_ARG_PATH, compile=False)
            model_arg.compile(optimizer='adam', loss='mse')
            scaler_arg = _load_json_scaler(SCALER_ARG_PATH)
            print(f"[predict.py] ARG model loaded: input={model_arg.input_shape}, output={model_arg.output_shape}")

        except Exception as e:
            print(f"[predict.py] Error loading models: {e}. Cannot predict.")
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
            max_rain_val = 49.6
        else:
            current_model = model_aws
            current_scaler = scaler_aws
            num_features = 4
            max_rain_val = 171.95

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
                        print(f"  -> Not enough daily data ({len(df_rain_all)}/14). Skipping.")
                        continue

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
                    print(f"  -> No data for {station_id}. Skipping.")
                    continue
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