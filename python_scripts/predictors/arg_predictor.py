import numpy as np
import pandas as pd
from datetime import datetime

def predict_7days(df, model, scaler, scaler_y=None):
    """
    ARG Predictor: 1 feature, sqrt transform, Lookback 30, Direct 7-step prediction.
    """
    if df.empty or 'rain' not in df.columns:
        return []
        
    df_daily = df['rain'].resample('1D').max()
    df_daily = df_daily.fillna(0)
    
    if len(df_daily) < 30:
        pad_len = 30 - len(df_daily)
        pad_dates = pd.date_range(end=df_daily.index[0] - pd.Timedelta(days=1), periods=pad_len)
        df_pad = pd.Series(0.0, index=pad_dates)
        df_daily = pd.concat([df_pad, df_daily])
        
    # Preprocessing: sqrt transform
    df_sqrt = np.sqrt(np.clip(df_daily.values, a_min=0, a_max=None))
    
    if len(df_sqrt) < 30:
        return []
        
    X_raw = df_sqrt[-30:].reshape(-1, 1)
    
    X_scaled = scaler.transform(X_raw)
    
    inp = X_scaled.reshape(1, 30, 1)
    
    preds_scaled = model.predict(inp, verbose=0)
    
    preds_inv_sqrt = scaler.inverse_transform(preds_scaled.reshape(-1, 1)).flatten()
    
    preds_final = []
    current_month = datetime.now().month
    is_dry_season = 5 <= current_month <= 10
    
    for p in preds_inv_sqrt:
        val = p ** 2
        val = np.clip(val, 0, 200)
        
        if is_dry_season:
            val *= 0.7
            
        if val < 3.0:
            val = 0.0
            
        preds_final.append(float(val))
        
    # ARG outputs 7 days. We need 8 days for the app. 
    # Let's pad the 8th day with the average of day 6 and 7.
    if len(preds_final) >= 2:
        day_8 = (preds_final[-1] + preds_final[-2]) / 2.0
    else:
        day_8 = 0.0
    preds_final.append(day_8)
        
    return preds_final
