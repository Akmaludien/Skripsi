import sys

def patch_file():
    with open('predict.py', 'r') as f:
        content = f.read()
    
    # Patch 1: Paths
    content = content.replace(
        "MODEL_PATH = os.path.join(os.path.dirname(__file__), 'models', 'aws', 'model_aws_cibeureum_FINAL.h5')",
        "MODEL_PATH = os.path.join(os.path.dirname(__file__), 'models', 'aws', 'model_aws.h5')"
    )
    content = content.replace(
        "SCALER_PATH = os.path.join(os.path.dirname(__file__), 'models', 'aws', 'scaler_aws_cibeureum.gz')",
        "SCALER_PATH = os.path.join(os.path.dirname(__file__), 'models', 'aws', 'scaler_aws.json')"
    )

    # Patch 2: Scaler loading
    old_scaler = '''        if os.path.exists(SCALER_PATH):
            scaler = joblib.load(SCALER_PATH)'''
    
    new_scaler = '''        if os.path.exists(SCALER_PATH):
            import json
            from sklearn.preprocessing import MinMaxScaler
            import numpy as np
            with open(SCALER_PATH, 'r') as f:
                scaler_data = json.load(f)
            scaler = MinMaxScaler()
            scaler.min_ = np.array(scaler_data['min'])
            scaler.scale_ = 1.0 / (np.array(scaler_data['max']) - np.array(scaler_data['min']))
            scaler.data_min_ = np.array(scaler_data['min'])
            scaler.data_max_ = np.array(scaler_data['max'])'''
    
    content = content.replace(old_scaler, new_scaler)

    # Patch 3: Prediction logic
    old_logic = '''                if not df.empty:
                    # Resample rain to daily (max = total akumulasi harian)
                    df_rain = df['rain'].resample('1D').max() if 'rain' in df.columns else pd.Series(dtype=float)
                    
                    if len(df_rain) < 60:
                        print(f"  -> Not enough daily data ({len(df_rain)}/60). Skipping.")
                        continue
                    
                    # Build multi-feature daily dataframe
                    df_daily_multi = pd.DataFrame({'rain': df_rain.tail(60)})
                    
                    # Add other features (use mean for AWS/AAWS, defaults for ARG)
                    for col in ['temp', 'rh', 'press', 'ws']:
                        if col in df.columns and df[col].notna().any():
                            df_daily_multi[col] = df[col].resample('1D').mean().tail(60).values
                        else:
                            # ARG doesn't have these - use climatological defaults
                            defaults = {'temp': 26.0, 'rh': 80.0, 'press': 1010.0, 'ws': 2.0}
                            df_daily_multi[col] = defaults[col]
                    
                    df_daily_multi = df_daily_multi.ffill().bfill().fillna(0)
                    
                    # Log-transform rain
                    df_daily_multi['rain'] = np.log1p(df_daily_multi['rain'])
                    
                    # Reorder to match scaler: [rain_log, temp, rh, press, ws]
                    df_daily_multi.columns = ['rain_log', 'temp', 'rh', 'press', 'ws']
                    
                    # Scale
                    input_scaled = scaler.transform(df_daily_multi.values)
                    input_seq = input_scaled.reshape(1, 60, 5)
                    
                    # Predict
                    pred_log = model.predict(input_seq, verbose=0)[0]
                    predicted_rain_7days = list(np.clip(np.expm1(pred_log), 0, 200))
                else:'''

    new_logic = '''                if not df.empty:
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
                else:'''
    
    content = content.replace(old_logic, new_logic)
    
    with open('predict.py', 'w') as f:
        f.write(content)
    
    print("predict.py updated successfully.")

patch_file()
