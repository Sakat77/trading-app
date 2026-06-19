import pandas as pd
import numpy as np
import requests
import json
import os
from datetime import datetime, date

from config import DATA_FOLDER

FYERS_FO_URL = "https://public.fyers.in/sym_details/NSE_FO.csv"
STRIKE_CACHE = os.path.join(DATA_FOLDER, 'strike_map.json')

def download_fo_symbols():
    print("Downloading NSE F&O symbol master from Fyers...")
    try:
        df = pd.read_csv(FYERS_FO_URL, header=None)
        print(f"Downloaded {len(df)} F&O symbols")
        return df
    except Exception as e:
        print(f"Error downloading: {e}")
        return None

def build_strike_map(df):
    today = date.today()
    strike_map = {}

    try:
        # Filter only CE rows using column 16 = option type
        ce_df = df[df[16] == 'CE'].copy()
        print(f"Found {len(ce_df)} CE option rows")

        # Convert expiry from unix timestamp (column 8)
        ce_df['expiry_date'] = pd.to_datetime(ce_df[8], unit='s').dt.date

        # Only keep future expiries
        ce_df = ce_df[ce_df['expiry_date'] >= today]
        print(f"Future CE rows: {len(ce_df)}")

        # Group by underlying (column 13)
        for underlying, group in ce_df.groupby(13):
            try:
                # Get nearest expiry
                nearest_expiry = sorted(group['expiry_date'].unique())[0]
                sub = group[group['expiry_date'] == nearest_expiry]

                # Get strikes from column 15
                strikes = sorted(sub[15].dropna().astype(int).unique().tolist())
                if len(strikes) < 2:
                    continue

                # Calculate interval — most common difference
                diffs = [strikes[i+1] - strikes[i] for i in range(len(strikes)-1)]
                interval = int(pd.Series(diffs).mode()[0])

                # Get sample Fyers symbol from column 9
                sample_symbol = sub[9].iloc[0]

                strike_map[str(underlying)] = {
                    'strikes':        strikes,
                    'interval':       interval,
                    'nearest_expiry': nearest_expiry.strftime('%Y-%m-%d'),
                    'expiry_str':     nearest_expiry.strftime('%y%b').upper(),
                    'total_strikes':  len(strikes),
                    'sample_symbol':  str(sample_symbol),
                }

            except Exception as e:
                continue

        print(f"Built strike map for {len(strike_map)} underlyings")
        return strike_map

    except Exception as e:
        print(f"Error building strike map: {e}")
        return {}

# Standard NSE strike intervals (smallest first). We snap to these so we never
# pick a non-standard / corporate-action-adjusted strike that Fyers rejects.
STD_INTERVALS = [1, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]

def snap_to_grid(strikes, price):
    """Smallest standard interval whose round strikes straddle the price
    AND actually exist in this chain. Falls back to nearest strike."""
    strike_set = set(int(round(s)) for s in strikes)
    for interval in STD_INTERVALS:
        ce = int(price // interval) * interval
        pe = ce + interval
        if ce in strike_set and pe in strike_set:
            return interval, ce, pe
    # Fallback: nearest strike at/below price, plus the next one up
    srt = sorted(strike_set)
    ce  = max([s for s in srt if s <= price], default=srt[0])
    idx = srt.index(ce)
    pe  = srt[idx + 1] if idx + 1 < len(srt) else ce
    return (pe - ce or 1), ce, pe

def get_exact_atm(underlying_name, last_price, strike_map):
    name_map = {
        'NIFTY50': 'NIFTY',
    }
    lookup = name_map.get(underlying_name, underlying_name)
    if lookup not in strike_map:
        return None

    info    = strike_map[lookup]
    strikes = info.get('strikes', [])
    if not strikes:
        return None

    interval, ce_strike, pe_strike = snap_to_grid(strikes, last_price)

    return {
        'ce_strike':      int(ce_strike),
        'pe_strike':      int(pe_strike),
        'interval':       int(interval),
        'nearest_expiry': info['nearest_expiry'],
        'expiry_str':     info['expiry_str'],
        'total_strikes':  info.get('total_strikes', len(strikes)),
    }

def build_fyers_option_symbol(exchange, underlying, expiry_str, strike, option_type):
    return f"{exchange}:{underlying}{expiry_str}{int(strike)}{option_type}"

def refresh_strike_map():
    df = download_fo_symbols()
    if df is None:
        return {}
    smap = build_strike_map(df)
    os.makedirs(os.path.dirname(STRIKE_CACHE), exist_ok=True)
    with open(STRIKE_CACHE, 'w') as f:
        json.dump(smap, f, indent=2)
    print(f"Strike map saved to {STRIKE_CACHE}")
    return smap

def load_strike_map():
    if os.path.exists(STRIKE_CACHE):
        with open(STRIKE_CACHE, 'r') as f:
            return json.load(f)
    return refresh_strike_map()

if __name__ == '__main__':
    smap = refresh_strike_map()

    tests = [
        ('RELIANCE',   1323.5),
        ('HDFCBANK',    799.0),
        ('BAJFINANCE',  958.85),
        ('NIFTY50',   24500.0),
        ('BANKNIFTY',  57963.8),
        ('TCS',        3421.5),
        ('SBIN',        812.3),
        ('MARUTI',    12500.0),
        ('NIFTY',     24500.0),
    ]

    print(f"\nToday: {date.today()}\n")
    for name, price in tests:
        result = get_exact_atm(name, price, smap)
        if result:
            print(f"{name} @ {price}")
            print(f"  CE Strike     : {result['ce_strike']}")
            print(f"  PE Strike     : {result['pe_strike']}")
            print(f"  Interval      : {result['interval']}")
            print(f"  Expiry        : {result['nearest_expiry']}")
            print(f"  Total strikes : {result['total_strikes']}")
            print()
        else:
            print(f"{name} — not in Fyers options (no options available)")
            print()
