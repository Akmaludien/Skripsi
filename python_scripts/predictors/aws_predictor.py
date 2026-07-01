import numpy as np
import pandas as pd
from datetime import datetime

def predict_7days(df, model, scaler_X, scaler_y=None):
    """
    AWS Predictor: 17 features, Recursive 8-step prediction.
    """
    if df.empty or 'rain' not in df.columns:
        return []
        
    df_daily = df['rain'].resample('1D').max()
    df_daily = df_daily.fillna(0)
    
    if len(df_daily) < 100:
        # We need at least 100 days to calculate MA30 and lookback 60
        # If less, we pad with zeros
        pad_len = 100 - len(df_daily)
        pad_dates = pd.date_range(end=df_daily.index[0] - pd.Timedelta(days=1), periods=pad_len)
        df_pad = pd.Series(0.0, index=pad_dates)
        df_daily = pd.concat([df_pad, df_daily])
        
    # Feature Engineering (exactly as in Colab)
    df_feat = pd.DataFrame({'RR': df_daily})
    
    df_feat['RR_lag1']  = df_feat['RR'].shift(1)
    df_feat['RR_lag3']  = df_feat['RR'].shift(3)
    df_feat['RR_lag7']  = df_feat['RR'].shift(7)
    df_feat['RR_lag14'] = df_feat['RR'].shift(14)
    
    df_feat['RR_MA3']  = df_feat['RR'].rolling(3, min_periods=1).mean()
    df_feat['RR_MA7']  = df_feat['RR'].rolling(7, min_periods=1).mean()
    df_feat['RR_MA14'] = df_feat['RR'].rolling(14, min_periods=1).mean()
    df_feat['RR_MA30'] = df_feat['RR'].rolling(30, min_periods=1).mean()
    
    df_feat['RR_std7']  = df_feat['RR'].rolling(7, min_periods=1).std().fillna(0)
    df_feat['RR_std14'] = df_feat['RR'].rolling(14, min_periods=1).std().fillna(0)
    
    df_feat['is_dry']     = (df_feat['RR'] < 1.0).astype(int)
    df_feat['dry_streak'] = df_feat['is_dry'].groupby(
        (df_feat['is_dry'] != df_feat['is_dry'].shift()).cumsum()
    ).cumsum()
    
    df_feat['is_wet']     = (df_feat['RR'] >= 1.0).astype(int)
    df_feat['wet_streak'] = df_feat['is_wet'].groupby(
        (df_feat['is_wet'] != df_feat['is_wet'].shift()).cumsum()
    ).cumsum()
    
    df_feat['RR_anom14'] = df_feat['RR'] - df_feat['RR_MA14']
    
    df_feat['month_sin'] = np.sin(2 * np.pi * df_feat.index.month / 12)
    df_feat['month_cos'] = np.cos(2 * np.pi * df_feat.index.month / 12)
    df_feat['doy_sin']   = np.sin(2 * np.pi * df_feat.index.dayofyear / 365)
    df_feat['doy_cos']   = np.cos(2 * np.pi * df_feat.index.dayofyear / 365)
    
    feature_cols = [
        'RR_lag1', 'RR_lag3', 'RR_lag7', 'RR_lag14',
        'RR_MA3', 'RR_MA7', 'RR_MA14', 'RR_MA30',
        'RR_std7', 'RR_std14',
        'dry_streak', 'wet_streak',
        'RR_anom14',
        'month_sin', 'month_cos',
        'doy_sin',   'doy_cos',
    ]
    
    df_feat = df_feat.dropna(subset=feature_cols)
    if len(df_feat) < 60:
        return []
        
    X_raw = df_feat[feature_cols].values[-60:]
    
    X_scaled = scaler_X.transform(X_raw)
    
    win = X_scaled.copy()
    
    lag1_idx = 0  # RR_lag1
    ma3_idx  = 4  # RR_MA3
    
    preds_scaled = []
    
    for step in range(8):
        inp = win.reshape(1, 60, len(feature_cols))
        pred_scaled = float(model.predict(inp, verbose=0)[0, 0])
        preds_scaled.append(pred_scaled)
        
        new_row = win[-1].copy()
        new_row[lag1_idx] = pred_scaled
        
        if step == 0:
            new_row[ma3_idx] = (win[-1, ma3_idx] + pred_scaled) / 2
        elif step == 1:
            new_row[ma3_idx] = (win[-1, ma3_idx] + preds_scaled[-2] + pred_scaled) / 3
        else:
            new_row[ma3_idx] = np.mean(preds_scaled[-3:])
            
        win = np.vstack([win[1:], new_row])
        
    preds_inv = scaler_y.inverse_transform(np.array(preds_scaled).reshape(-1, 1)).flatten()
    
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
        
    return preds_final
