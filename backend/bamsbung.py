import numpy as np
import os
from bamsbung_bridge import call_ssa_dll


def lwma(arr, period):
    n = len(arr)
    out = np.full(n, np.nan)
    weights = np.arange(1, period + 1, dtype=float)
    wsum = weights.sum()
    for i in range(period - 1, n):
        window_data = arr[i - period + 1:i + 1]
        if not np.any(np.isnan(window_data)):
            out[i] = np.dot(window_data, weights) / wsum
    return out


def probit(p):
    a = [2.515517, 0.802853, 0.010328]
    b = [1.432788, 0.189269, 0.001308]
    if p <= 0.0 or p >= 1.0:
        return 0.0
    if p < 0.5:
        t = np.sqrt(-2.0 * np.log(p))
    else:
        t = np.sqrt(-2.0 * np.log(1.0 - p))
    num = ((a[2]*t + a[1])*t + a[0])
    den = (((b[2]*t + b[1])*t + b[0])*t + 1.0)
    val = t - num/den
    return -val if p < 0.5 else val


def calculate_bamsbung(df,
                        sma_period=20,
                        ssa_window=10,
                        ssa_groups=2,
                        fast_period=2,
                        slow_period=7,
                        trend_period=20,
                        confidence=98.0,
                        max_bars=500):

    close = df['close'].values.astype(float)
    high  = df['high'].values.astype(float)
    low   = df['low'].values.astype(float)
    n     = len(df)

    if n < 30:
        return [], []

    # Step 1: Normalize price exactly as MQL4 code
    raw = np.full(n, np.nan)
    for i in range(sma_period - 1, n):
        w   = close[i - sma_period + 1:i + 1]
        sma = np.mean(w)
        std = np.std(w, ddof=0)
        raw[i] = (close[i] - sma) / max(3.0 * std, 0.000001)

    # Step 2: Call real DLL fastSingular on last max_bars of raw
    use_bars    = min(max_bars, n)
    raw_segment = raw[n - use_bars:].copy()
    raw_clean   = np.nan_to_num(raw_segment, nan=0.0)

    try:
        ssa_result = call_ssa_dll(raw_clean, use_bars, ssa_window, ssa_groups)
        ssa_full   = np.full(n, np.nan)
        ssa_full[n - use_bars:] = ssa_result
    except Exception as e:
        print(f"DLL call failed: {e}")
        ssa_full = raw.copy()

    # Step 3: Three LWMA lines exactly as MQL4
    fast_line  = lwma(np.nan_to_num(ssa_full, nan=0.0), fast_period)
    slow_line  = lwma(np.nan_to_num(ssa_full, nan=0.0), slow_period)
    trend_line = lwma(np.nan_to_num(ssa_full, nan=0.0), trend_period)

    start_valid = sma_period + max(fast_period, slow_period, trend_period)
    fast_line[:start_valid]  = np.nan
    slow_line[:start_valid]  = np.nan
    trend_line[:start_valid] = np.nan

    # Step 4: Confidence bands (probit method from MQL4)
    conf_p  = max(min(confidence, 99.9999999999), 0.0000000001)
    z_score = probit((conf_p + (100 - conf_p) / 2.0) / 100.0)

    upper = np.full(n, np.nan)
    lower = np.full(n, np.nan)

    for i in range(trend_period, n):
        if np.isnan(trend_line[i]):
            continue
        w = ssa_full[i:i + trend_period]
        v = w[~np.isnan(w)]
        if len(v) < 2:
            continue
        std_w    = np.std(v, ddof=1)
        band     = z_score * std_w / np.sqrt(trend_period)
        upper[i] = trend_line[i] + band
        lower[i] = trend_line[i] - band

    # Step 5: ATR for arrow placement
    atr = np.full(n, np.nan)
    tr  = np.full(n, np.nan)
    for i in range(1, n):
        tr[i] = max(high[i]-low[i], abs(high[i]-close[i-1]), abs(low[i]-close[i-1]))
    for i in range(20, n):
        atr[i] = np.mean(tr[i-19:i+1])

    # Step 6: Trend direction and crossover signals
    trend   = np.zeros(n)
    signals = []

    for i in range(1, n):
        if np.isnan(fast_line[i]) or np.isnan(slow_line[i]):
            trend[i] = trend[i-1]
            continue
        if fast_line[i] > slow_line[i]:
            trend[i] = 1
        elif fast_line[i] < slow_line[i]:
            trend[i] = -1
        else:
            trend[i] = trend[i-1]

        if trend[i] != trend[i-1] and trend[i-1] != 0:
            gap = (3.0 * atr[i] / 4.0) if not np.isnan(atr[i]) else 0
            if trend[i] == 1:
                signals.append({
                    'type':  'buy',
                    'time':  int(df.index[i].timestamp()),
                    'price': round(float(low[i]) - gap, 4),
                })
            else:
                signals.append({
                    'type':  'sell',
                    'time':  int(df.index[i].timestamp()),
                    'price': round(float(high[i]) + gap, 4),
                })

    # Step 7: Build output
    def v(x): return None if np.isnan(x) else round(float(x), 6)

    results = []
    for i in range(n):
        results.append({
            'time':       int(df.index[i].timestamp()),
            'fast':       v(fast_line[i]),
            'slow':       v(slow_line[i]),
            'trend_line': v(trend_line[i]),
            'upper':      v(upper[i]),
            'lower':      v(lower[i]),
            'trend':      int(trend[i]),
        })

    return results, signals
