import pandas as pd
import numpy as np

def calculate_cci(df, period=20):
    tp = (df['high'] + df['low'] + df['close']) / 3
    sma = tp.rolling(period).mean()
    mad = tp.rolling(period).apply(lambda x: np.mean(np.abs(x - np.mean(x))))
    cci = (tp - sma) / (0.015 * mad)
    return cci.round(2)

def calculate_rsi(df, period=14):
    delta = df['close'].diff()
    gain = delta.where(delta > 0, 0.0)
    loss = -delta.where(delta < 0, 0.0)
    avg_gain = gain.ewm(com=period - 1, min_periods=period).mean()
    avg_loss = loss.ewm(com=period - 1, min_periods=period).mean()
    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))
    return rsi.round(2)

def calculate_rvi(df, period=10):
    close_open = df['close'] - df['open']
    high_low = df['high'] - df['low']
    
    def weighted(series):
        return (series + 
                2 * series.shift(1) + 
                2 * series.shift(2) + 
                series.shift(3)) / 6
    
    num = weighted(close_open).rolling(period).mean()
    den = weighted(high_low).rolling(period).mean()
    
    rvi = num / den.replace(0, np.nan)
    signal = (rvi + 
              2 * rvi.shift(1) + 
              2 * rvi.shift(2) + 
              rvi.shift(3)) / 6
    
    return rvi.round(4), signal.round(4)

def get_all_indicators(df, cci_period=20, rsi_period=14, rvi_period=10):
    results = []
    
    cci = calculate_cci(df, cci_period)
    rsi = calculate_rsi(df, rsi_period)
    rvi, rvi_signal = calculate_rvi(df, rvi_period)
    
    for i in range(len(df)):
        row = {
            "time": int(df.index[i].timestamp()),
            "cci": None if pd.isna(cci.iloc[i]) else float(cci.iloc[i]),
            "rsi": None if pd.isna(rsi.iloc[i]) else float(rsi.iloc[i]),
            "rvi": None if pd.isna(rvi.iloc[i]) else float(rvi.iloc[i]),
            "rvi_signal": None if pd.isna(rvi_signal.iloc[i]) else float(rvi_signal.iloc[i]),
        }
        results.append(row)
    
    return results
