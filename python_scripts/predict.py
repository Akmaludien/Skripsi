import os
import sys
import sqlite3
import pandas as pd
import numpy as np
import pickle
from datetime import datetime, timedelta

from predictors.aws_predictor import predict_7days as aws_predict
from predictors.aaws_predictor import predict_7days as aaws_predict
from predictors.arg_predictor import predict_7days as arg_predict

# Suppress TF logs
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
try:
    import tensorflow as tf
    HAS_TF = True
    print(f"[predict.py] TensorFlow loaded successfully. Version: {tf.__version__}")
except ImportError:
    HAS_TF = False
    print("[predict.py] ERROR: TensorFlow not found.")

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Configuration
INFLUX_URL = os.getenv("INFLUX_URL", "http://localhost:8086")
INFLUX_TOKEN = os.getenv("INFLUX_TOKEN")
INFLUX_ORG = os.getenv("INFLUX_ORG", "SKRIPSI")
INFLUX_BUCKET = os.getenv("INFLUX_BUCKET", "skripsi")

DB_PATH = os.path.join(ROOT_DIR, 'data', 'monitoring.db')
MODEL_AWS_PATH = os.path.join(ROOT_DIR, 'models', 'aws', 'model_aws.h5')
SCALER_AWS_X_PATH = os.path.join(ROOT_DIR, 'models', 'aws', 'scaler_X.pkl')
SCALER_AWS_Y_PATH = os.path.join(ROOT_DIR, 'models', 'aws', 'scaler_y.pkl')

MODEL_AAWS_PATH = os.path.join(ROOT_DIR, 'models', 'aaws', 'aaws_model.keras')
SCALER_AAWS_X_PATH = os.path.join(ROOT_DIR, 'models', 'aaws', 'scaler_X.pkl')
SCALER_AAWS_Y_PATH = os.path.join(ROOT_DIR, 'models', 'aaws', 'scaler_y.pkl')

MODEL_ARG_PATH = os.path.join(ROOT_DIR, 'models', 'arg', 'model_arg_final.h5')
SCALER_ARG_PATH = os.path.join(ROOT_DIR, 'models', 'arg', 'scaler.pkl')

global_tf_error_traceback = ""

def get_db_connection():
    return sqlite3.connect(DB_PATH)

def _sanitize_station_id(station_id):
    import re
    return re.sub(r'[^a-zA-Z0-9_-]', '', str(station_id))

def fetch_data_from_influx(station_id, days_back=100):
    if not INFLUX_TOKEN: return pd.DataFrame()
    from influxdb_client import InfluxDBClient
    try:
        client = InfluxDBClient(url=INFLUX_URL, token=INFLUX_TOKEN, org=INFLUX_ORG, timeout=30000)
        query_api = client.query_api()
        clean_id = _sanitize_station_id(station_id)
        query = f"""
        from(bucket: "{INFLUX_BUCKET}")
          |> range(start: -{days_back}d)
          |> filter(fn: (r) => r["id"] == "{clean_id}")
          |> filter(fn: (r) => r["_field"] == "rain")
          |> keep(columns: ["_time", "_value"])
        """
        result = query_api.query_data_frame(query)
        if isinstance(result, list): result = pd.concat(result) if result else pd.DataFrame()
        if not result.empty and '_value' in result.columns:
            result.rename(columns={'_value': 'rain'}, inplace=True)
            result['_time'] = pd.to_datetime(result['_time'])
            return result[['_time', 'rain']]
        return pd.DataFrame()
    except Exception as e:
        print(f"Influx Error: {e}")
        return pd.DataFrame()

def calculate_confidence(predicted_rainfall, day_horizon, rmse=5.0):
    horizon_factor = 1.0 + (day_horizon * 0.08)
    adjusted_rmse = rmse * horizon_factor
    intensity_factor = 1.0 + (predicted_rainfall / 200.0)
    adjusted_rmse *= intensity_factor
    max_tolerable = 50.0
    confidence = max(50.0, min(95.0, (1.0 - adjusted_rmse / max_tolerable) * 100.0))
    return round(confidence, 1)

model_rmse = 5.0

def save_prediction(station_id, prediction_date, predicted_rainfall, day_horizon=0):
    conn = get_db_connection()
    cursor = conn.cursor()
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
    
    confidence = calculate_confidence(predicted_rainfall, day_horizon, model_rmse)
    
    cursor.execute('SELECT id FROM predictions WHERE station_id = ? AND prediction_date = ?', (station_id, prediction_date))
    existing = cursor.fetchone()
    if existing:
        cursor.execute('UPDATE predictions SET predicted_rainfall = ?, category = ?, confidence = ?, created_at = ? WHERE id = ?', 
                       (predicted_rainfall, category, confidence, datetime.now().isoformat(), existing[0]))
    else:
        cursor.execute('INSERT INTO predictions (station_id, prediction_date, predicted_rainfall, category, confidence, created_at) VALUES (?, ?, ?, ?, ?, ?)', 
                       (station_id, prediction_date, predicted_rainfall, category, confidence, datetime.now().isoformat()))
    conn.commit()
    conn.close()

def _statistical_fallback(df, station_type):
    if df.empty or 'rain' not in df.columns:
        import random
        base_rain = random.uniform(0, 30)
        return [max(0.0, round(base_rain * (0.9 ** i) + random.uniform(-2, 5), 1)) for i in range(8)]
    df_rain = df['rain'].resample('1D').max().dropna()
    if len(df_rain) < 3:
        import random
        base_rain = random.uniform(0, 30)
        return [max(0.0, round(base_rain * (0.9 ** i) + random.uniform(-2, 5), 1)) for i in range(8)]
    recent = df_rain.tail(14)
    avg_rain = float(recent.mean()) if len(recent) > 0 else 0.0
    last_rain = float(recent.iloc[-1]) if len(recent) > 0 else 0.0
    predictions = []
    for day in range(8):
        val = last_rain * 0.6 + avg_rain * 0.4 if day == 0 else avg_rain * (0.92 ** day)
        current_month = datetime.now().month
        if 5 <= current_month <= 10: val *= 0.7
        val = max(0.0, min(200.0, round(val, 1)))
        predictions.append(val)
    return predictions

def robust_load_model(path):
    if not os.path.exists(path): return None
    try:
        return tf.keras.models.load_model(path, compile=False)
    except Exception as e:
        print(f"Failed to load model {path}: {e}")
        return None

def load_pkl(path):
    if not os.path.exists(path): return None
    try:
        with open(path, 'rb') as f:
            return pickle.load(f)
    except Exception as e:
        print(f"Failed to load scaler {path}: {e}")
        return None

def run_predictions():
    global HAS_TF, model_rmse, global_tf_error_traceback
    
    try:
        conn_tmp = get_db_connection()
        perf = conn_tmp.execute('SELECT rmse FROM model_performance ORDER BY id DESC LIMIT 1').fetchone()
        if perf and perf[0] and perf[0] > 0: model_rmse = perf[0]
        conn_tmp.close()
    except: pass

    model_aws, scaler_aws_X, scaler_aws_y = None, None, None
    model_aaws, scaler_aaws_X, scaler_aaws_y = None, None, None
    model_arg, scaler_arg = None, None

    if HAS_TF:
        try:
            model_aws = robust_load_model(MODEL_AWS_PATH)
            scaler_aws_X = load_pkl(SCALER_AWS_X_PATH)
            scaler_aws_y = load_pkl(SCALER_AWS_Y_PATH)
            
            model_aaws = robust_load_model(MODEL_AAWS_PATH)
            scaler_aaws_X = load_pkl(SCALER_AAWS_X_PATH)
            scaler_aaws_y = load_pkl(SCALER_AAWS_Y_PATH)
            
            model_arg = robust_load_model(MODEL_ARG_PATH)
            scaler_arg = load_pkl(SCALER_ARG_PATH)
        except Exception as e:
            HAS_TF = False
            global_tf_error_traceback = str(e)

    conn = get_db_connection()
    stations = pd.read_sql_query("SELECT id, type FROM stations WHERE type IN ('AWS', 'AAWS', 'ARG')", conn)
    conn.close()

    success_counts = {'AWS': 0, 'AAWS': 0, 'ARG': 0}
    fallback_counts = {'AWS': 0, 'AAWS': 0, 'ARG': 0}

    for _, station in stations.iterrows():
        station_id, station_type = station['id'], station['type']
        
        if station_type == 'ARG':
            current_model, cur_scaler_X, cur_scaler_y = model_arg, scaler_arg, None
        elif station_type == 'AAWS':
            current_model, cur_scaler_X, cur_scaler_y = model_aaws, scaler_aaws_X, scaler_aaws_y
        else:
            current_model, cur_scaler_X, cur_scaler_y = model_aws, scaler_aws_X, scaler_aws_y

        df = fetch_data_from_influx(station_id, days_back=100)
        if not df.empty: df.set_index('_time', inplace=True)
        
        predicted_rain_7days = []
        if HAS_TF and current_model and cur_scaler_X:
            try:
                if station_type == 'ARG':
                    predicted_rain_7days = arg_predict(df, current_model, cur_scaler_X, cur_scaler_y)
                elif station_type == 'AAWS':
                    predicted_rain_7days = aaws_predict(df, current_model, cur_scaler_X, cur_scaler_y)
                else:
                    predicted_rain_7days = aws_predict(df, current_model, cur_scaler_X, cur_scaler_y)
                    
                if not predicted_rain_7days or len(predicted_rain_7days) < 8:
                    predicted_rain_7days = _statistical_fallback(df, station_type)
                    fallback_counts[station_type] += 1
                else:
                    success_counts[station_type] += 1
            except Exception as e:
                import traceback
                traceback.print_exc()
                print(f"Bi-LSTM failed for {station_id}: {e}")
                predicted_rain_7days = _statistical_fallback(df, station_type)
                fallback_counts[station_type] += 1
        else:
            predicted_rain_7days = _statistical_fallback(df, station_type)
            fallback_counts[station_type] += 1

        if predicted_rain_7days:
            for i in range(8):
                save_prediction(station_id, (datetime.now() + timedelta(days=i)).strftime('%Y-%m-%d'), float(round(predicted_rain_7days[i], 1)), i)

    # Cetak log summary untuk Coolify
    total_success = sum(success_counts.values())
    total_fallback = sum(fallback_counts.values())
    print(f"\n[predict.py] Selesai memproses {len(stations)} stasiun.")
    print(f"✅ Bi-LSTM Success: AWS ({success_counts['AWS']}), AAWS ({success_counts['AAWS']}), ARG ({success_counts['ARG']})")
    if total_fallback > 0:
        print(f"⚠️ Fallback (Karena error/Data Kosong): AWS ({fallback_counts['AWS']}), AAWS ({fallback_counts['AAWS']}), ARG ({fallback_counts['ARG']})")

if __name__ == "__main__":
    run_predictions()