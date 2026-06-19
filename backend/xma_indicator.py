import numpy as np
import pandas as pd

def calculate_xma(df, ma_period=180, bars_count=1700, k_period=34, d_period=13, slowing=2):
    high  = df['high'].values
    low   = df['low'].values
    close = df['close'].values
    n     = len(df)

    def lwma(src, period):
        out = np.full(n, np.nan)
        for i in range(period - 1, n):
            w = 0.0
            s = 0.0
            for j in range(period):
                weight = period - j
                s += src[i - j] * weight
                w += weight
            out[i] = s / w
        return out

    def ema(src, period):
        out = np.full(n, np.nan)
        k   = 2.0 / (period + 1)
        start = 0
        while start < n and np.isnan(src[start]):
            start += 1
        if start >= n:
            return out
        out[start] = src[start]
        for i in range(start + 1, n):
            if np.isnan(src[i]):
                out[i] = np.nan
            else:
                out[i] = src[i] * k + out[i-1] * (1 - k)
        return out

    def stochastic(k_period, d_period, slowing):
        raw_k = np.full(n, np.nan)
        for i in range(k_period - 1, n):
            h = np.max(high[i - k_period + 1:i + 1])
            l = np.min(low[i  - k_period + 1:i + 1])
            if h == l:
                raw_k[i] = 50.0
            else:
                raw_k[i] = 100.0 * (close[i] - l) / (h - l)

        slowed_k = np.full(n, np.nan)
        for i in range(k_period + slowing - 2, n):
            window = raw_k[i - slowing + 1:i + 1]
            if not np.any(np.isnan(window)):
                slowed_k[i] = np.mean(window)

        stoc_d = np.full(n, np.nan)
        for i in range(k_period + slowing + d_period - 3, n):
            window = slowed_k[i - d_period + 1:i + 1]
            if not np.any(np.isnan(window)):
                stoc_d[i] = np.mean(window)

        return slowed_k, stoc_d

    priceline = lwma(close, 2)
    breakline = lwma(priceline, 18)
    cycleline = lwma(breakline, 34)
    trendline = ema(cycleline, ma_period)

    stoc_k, stoc_d = stochastic(k_period, d_period, slowing)

    use_bars = min(bars_count, n - ma_period - 1)
    max_ch = 0.0
    min_ch = 0.0
    for i in range(n - use_bars, n):
        if np.isnan(trendline[i]):
            continue
        top = high[i] - trendline[i]
        bot = low[i]  - trendline[i]
        if top > max_ch:
            max_ch = top
        if bot < min_ch:
            min_ch = bot

    if abs(max_ch) > abs(min_ch):
        inc3 = max_ch
    else:
        inc3 = min_ch

    inc1 = inc3 * 0.382
    inc2 = inc3 * 0.854

    res1 = trendline + inc1
    sup1 = trendline - inc1
    res2 = trendline + inc2
    sup2 = trendline - inc2

    results = []
    for i in range(n):
        ts = int(df.index[i].timestamp())

        pl = None if np.isnan(priceline[i]) else round(float(priceline[i]), 4)
        bl = None if np.isnan(breakline[i]) else round(float(breakline[i]), 4)
        cl = None if np.isnan(cycleline[i]) else round(float(cycleline[i]), 4)
        tl = None if np.isnan(trendline[i]) else round(float(trendline[i]), 4)
        sk = None if np.isnan(stoc_k[i])    else round(float(stoc_k[i]),    4)

        r1 = None if np.isnan(res1[i]) else round(float(res1[i]), 4)
        s1 = None if np.isnan(sup1[i]) else round(float(sup1[i]), 4)
        r2 = None if np.isnan(res2[i]) else round(float(res2[i]), 4)
        s2 = None if np.isnan(sup2[i]) else round(float(sup2[i]), 4)

        trend = 0
        if (pl is not None and cl is not None and bl is not None and sk is not None):
            if pl > cl and pl > bl and sk > 50:
                trend = 1
            elif pl < cl and pl < bl and sk < 50:
                trend = -1

        results.append({
            'time':      ts,
            'priceline': pl,
            'breakline': bl,
            'cycleline': cl,
            'trendline': tl,
            'res1':      r1,
            'sup1':      s1,
            'res2':      r2,
            'sup2':      s2,
            'trend':     trend,
        })

    return results