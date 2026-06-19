import pandas as pd
import numpy as np

def _calc_cci(typical, n, period):
    cci = np.full(n, np.nan)
    for i in range(period - 1, n):
        window = typical[i - period + 1:i + 1]
        sma = np.mean(window)
        mad = np.mean(np.abs(window - sma))
        cci[i] = 0 if mad == 0 else (typical[i] - sma) / (0.015 * mad)
    return cci

def _calc_rsi(typical, n, period):
    rsi = np.full(n, np.nan)
    deltas = np.diff(typical)
    for i in range(period, n):
        window = deltas[i - period:i]
        gains = window[window > 0]
        losses = -window[window < 0]
        avg_gain = np.mean(gains) if len(gains) > 0 else 0
        avg_loss = np.mean(losses) if len(losses) > 0 else 0
        if avg_loss == 0:
            rsi[i] = 100
        else:
            rs = avg_gain / avg_loss
            rsi[i] = 100 - (100 / (1 + rs))
    return rsi

def _calc_rvi_line(df, n, period):
    high = df['high'].values
    low = df['low'].values
    close = df['close'].values
    open_ = df['open'].values
    close_open = close - open_
    high_low = high - low

    def weighted(arr):
        result = np.full(n, np.nan)
        for i in range(3, n):
            result[i] = (arr[i] + 2*arr[i-1] + 2*arr[i-2] + arr[i-3]) / 6
        return result

    w_co = weighted(close_open)
    w_hl = weighted(high_low)

    num = np.full(n, np.nan)
    den = np.full(n, np.nan)
    for i in range(period + 2, n):
        num[i] = np.nanmean(w_co[i - period + 1:i + 1])
        den[i] = np.nanmean(w_hl[i - period + 1:i + 1])

    rvi = np.full(n, np.nan)
    for i in range(n):
        if not np.isnan(num[i]) and not np.isnan(den[i]) and den[i] != 0:
            rvi[i] = num[i] / den[i]
    return rvi

def _calc_atr(df, n, period=20):
    high = df['high'].values
    low = df['low'].values
    close = df['close'].values
    tr = np.full(n, np.nan)
    for i in range(1, n):
        tr[i] = max(high[i]-low[i], abs(high[i]-close[i-1]), abs(low[i]-close[i-1]))
    atr = np.full(n, np.nan)
    for i in range(period, n):
        atr[i] = np.mean(tr[i - period + 1:i + 1])
    return atr

def _build_buffers(series_a, series_b, n, koef):
    buf3 = np.full(n, np.nan)
    buf4 = np.full(n, np.nan)
    for i in range(n):
        a_vals = []
        b_vals = []
        for k in range(koef + 1):
            back = i - k
            fwd  = i + k
            sa_back = series_a[back] if 0 <= back < n else np.nan
            sb_fwd  = series_b[fwd]  if 0 <= fwd  < n else np.nan
            sb_back = series_b[back] if 0 <= back < n else np.nan
            sa_fwd  = series_a[fwd]  if 0 <= fwd  < n else np.nan
            if not np.isnan(sa_back) and not np.isnan(sb_fwd):
                a_vals.append(sa_back - sb_fwd)
            if not np.isnan(sb_back) and not np.isnan(sa_fwd):
                b_vals.append(sb_back - sa_fwd)
        buf3[i] = sum(a_vals) if a_vals else np.nan
        buf4[i] = sum(b_vals) if b_vals else np.nan
    return buf3, buf4

def _sma_on_array(arr, n, period):
    result = np.full(n, np.nan)
    for i in range(period - 1, n):
        window = arr[i - period + 1:i + 1]
        valid = window[~np.isnan(window)]
        if len(valid) == period:
            result[i] = np.mean(valid)
    return result

def _detect_signals(line1, line2, df, atr, n):
    signals = []
    high = df['high'].values
    low  = df['low'].values
    for i in range(1, n):
        if any(np.isnan(x) for x in [line1[i], line2[i], line1[i-1], line2[i-1]]):
            continue
        gap = (3.0 * atr[i] / 4.0) if not np.isnan(atr[i]) else 0
        if line1[i] >= line2[i] and line1[i-1] < line2[i-1]:
            signals.append({
                "type": "buy",
                "time": int(df.index[i].timestamp()),
                "price": round(float(low[i]) - gap, 2)
            })
        elif line1[i] <= line2[i] and line1[i-1] > line2[i-1]:
            signals.append({
                "type": "sell",
                "time": int(df.index[i].timestamp()),
                "price": round(float(high[i]) + gap, 2)
            })
    return signals

def _build_output(line1, line2, df, n):
    results = []
    for i in range(n):
        results.append({
            "time": int(df.index[i].timestamp()),
            "line1": None if np.isnan(line1[i]) else round(float(line1[i]), 4),
            "line2": None if np.isnan(line2[i]) else round(float(line2[i]), 4),
        })
    return results

# ── Indicator 1: EATA Pollan CCI × RSI ──
def calculate_eata_pollan_cci_rsi(df, cci_per=14, rsi_per=14, ma_period=2, koef=8):
    high = df['high'].values
    low  = df['low'].values
    close= df['close'].values
    n    = len(df)
    typical = (high + low + close) / 3

    cci = _calc_cci(typical, n, cci_per)
    rsi = _calc_rsi(typical, n, rsi_per)
    atr = _calc_atr(df, n)

    buf3, buf4 = _build_buffers(cci, rsi, n, koef)
    line1 = _sma_on_array(buf3, n, ma_period)
    line2 = _sma_on_array(buf4, n, ma_period)

    signals = _detect_signals(line1, line2, df, atr, n)
    return _build_output(line1, line2, df, n), signals

# ── Indicator 2: EATA Pollan CCI × RVI ──
def calculate_eata_pollan_cci_rvi(df, cci_per=14, rvi_per=10, ma_period=2, koef=8):
    high = df['high'].values
    low  = df['low'].values
    close= df['close'].values
    n    = len(df)
    typical = (high + low + close) / 3

    cci = _calc_cci(typical, n, cci_per)
    rvi = _calc_rvi_line(df, n, rvi_per)
    atr = _calc_atr(df, n)

    buf3, buf4 = _build_buffers(cci, rvi, n, koef)
    line1 = _sma_on_array(buf3, n, ma_period)
    line2 = _sma_on_array(buf4, n, ma_period)

    signals = _detect_signals(line1, line2, df, atr, n)
    return _build_output(line1, line2, df, n), signals