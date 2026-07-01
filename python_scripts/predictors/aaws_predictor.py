import numpy as np
import pandas as pd
from datetime import datetime

def predict_7days(df, model, scaler_X, scaler_y=None):
    """
    AAWS Predictor: 10 features, Direct 7-step prediction.
    """
    if df.empty or 'rain' not in df.columns:
        return []
        
    df_daily = df['rain'].resample('1D').max()
    df_daily = df_daily.fillna(0)
    
    if len(df_daily) < 100:
        pad_len = 100 - len(df_daily)
        pad_dates = pd.date_range(end=df_daily.index[0] - pd.Timedelta(days=1), periods=pad_len)
        df_pad = pd.Series(0.0, index=pad_dates)
        df_daily = pd.concat([df_pad, df_daily])
        
    df_feat = pd.DataFrame({'RR': df_daily})
    
    df_feat['RR_lag1'] = df_feat['RR'].shift(1)
    df_feat['RR_lag3'] = df_feat['RR'].shift(3)
    df_feat['RR_lag7'] = df_feat['RR'].shift(7)
    
    df_feat['RR_MA3']  = df_feat['RR'].rolling(3, min_periods=1).mean()
    df_feat['RR_MA7']  = df_feat['RR'].rolling(7, min_periods=1).mean()
    df_feat['RR_MA14'] = df_feat['RR'].rolling(14, min_periods=1).mean()
    
    df_feat['RR_std7'] = df_feat['RR'].rolling(7, min_periods=1).std().fillna(0)
    
    df_feat['is_dry']     = (df_feat['RR'] < 1.0).astype(int)
    df_feat['dry_streak'] = df_feat['is_dry'].groupby(
        (df_feat['is_dry'] != df_feat['is_dry'].shift()).cumsum()
    ).cumsum()
    
    df_feat['month_sin'] = np.sin(2 * np.pi * df_feat.index.month / 12)
    df_feat['month_cos'] = np.cos(2 * np.pi * df_feat.index.month / 12)
    
    feature_cols = [
        'RR_lag1', 'RR_lag3', 'RR_lag7',
        'RR_MA3',  'RR_MA7',  'RR_MA14',
        'RR_std7',
        'dry_streak',
        'month_sin', 'month_cos',
    ]
    
    df_feat = df_feat.dropna(subset=feature_cols)
    if len(df_feat) < 60:
        return []
        
    X_raw = df_feat[feature_cols].values[-60:]
    
    X_scaled = scaler_X.transform(X_raw)
    
    inp = X_scaled.reshape(1, 60, len(feature_cols))
    
    preds_scaled = model.predict(inp, verbose=0)
    
    preds_inv = scaler_y.inverse_transform(preds_scaled).flatten()
    
    preds_final = []
    current_month = datetime.now().month
    is_dry_season = 5 <= current_month <= 10
    
    for p in preds_inv:
        val = np.clip(p, 0, 200)
        if is_dry_season:
            val *= 0.7
        if val < 1.0:
            val = 0.0
        preds_final.append(float(val))
        
    # AAWS outputs 7 days. We need 8 days for the app. 
    # Let's pad the 8th day with the average of day 6 and 7.
    if len(preds_final) >= 2:
        day_8 = (preds_final[-1] + preds_final[-2]) / 2.0
    else:
        day_8 = 0.0
    preds_final.append(day_8)
        
    return preds_final
