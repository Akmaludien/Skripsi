import os
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
MODEL_PATH = os.path.join(os.path.dirname(__file__), 'models', 'aws', 'model_aws_cibeureum_FINAL.h5')
SCALER_PATH = os.path.join(os.path.dirname(__file__), 'models', 'aws', 'scaler_aws_cibeureum.gz')

def get_db_connection():
    return sqlite3.connect(DB_PATH)

def fetch_data_from_influx(station_id, days_back=60):
    if not INFLUX_TOKEN:
        print("[predict.py] InfluxDB Token not set.")
        return pd.DataFrame()
        
    client = InfluxDBClient(url=INFLUX_URL, token=INFLUX_TOKEN, org=INFLUX_ORG, timeout=2000)
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

def save_prediction(station_id, prediction_date, predicted_rainfall):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # ─── KOREKSI KLASIFIKASI INTENSITAS CURAH HUJAN STANDAR BMKG ───
    if predicted_rainfall <= 0.5:
        category = 'TANPA HUJAN'
    elif predicted_rainfall <= 20:
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
    global HAS_TF # Declare global at the start
    model = None
    scaler = None
    
    if HAS_TF:
        print(f"[predict.py] Loading model from {MODEL_PATH}")
        try:
            model = load_model(MODEL_PATH)
            scaler = joblib.load(SCALER_PATH)
        except Exception as e:
            print(f"[predict.py] Error loading model: {e}. Falling back to statistical method.")
            HAS_TF = False
    
    conn = get_db_connection()
    stations = pd.read_sql_query("SELECT id FROM stations WHERE type IN ('AWS', 'AAWS', 'ARG')", conn)
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
                # Prepare input: need 60 days × 5 features
                feature_cols = ['rain', 'temp', 'rh', 'press', 'ws']
                
                if not df.empty and len(df_daily) >= 60:
                    # Get multi-feature daily data
                    df_multi = df.resample('1D').agg({
                        'rain': 'max', 'temp': 'mean', 'rh': 'mean', 
                        'press': 'mean', 'ws': 'mean'
                    }).tail(60).fillna(method='ffill').fillna(0)
                    
                    # Log-transform rain
                    df_multi['rain'] = np.log1p(df_multi['rain'])
                    
                    # Rename to match scaler columns
                    df_multi.columns = ['rain_log', 'temp', 'rh', 'press', 'ws']
                    
                    # Scale
                    input_scaled = scaler.transform(df_multi.values)
                    input_seq = input_scaled.reshape(1, 60, 5)
                    
                    # Predict
                    pred_log = model.predict(input_seq, verbose=0)[0]
                    predicted_rain_7days = list(np.clip(np.expm1(pred_log), 0, 200))
                else:
                    print(f"  -> Not enough data for Bi-LSTM (need 60 days, got {len(df_daily) if not df.empty else 0}). Skipping.")
                    continue
                    
            except Exception as e:
                print(f"  -> Bi-LSTM prediction failed: {e}. Skipping station.")
                continue
        else:
            print(f"  -> TensorFlow not available. Skipping prediction.")
            continue

        # Save predictions
        for i in range(7):
            pred_val = predicted_rain_7days[i]
            target_date = (datetime.now() + timedelta(days=i)).strftime('%Y-%m-%d')
            save_prediction(station_id, target_date, pred_val)
            
        print(f"  -> Generated 7-day forecast for {station_id}")

if __name__ == "__main__":
    print("Starting prediction task...")
    run_predictions()
    print("Prediction task completed.")
