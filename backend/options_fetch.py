import os
import time
import json
import pandas as pd
from datetime import datetime, timedelta
from tz import epoch_series_to_ist
from fyers_apiv3 import fyersModel
from config import CLIENT_ID, DATA_FOLDER, TIMEFRAMES
from auth import load_access_token
from strike_finder import load_strike_map, get_exact_atm, build_fyers_option_symbol

OPTIONS_FOLDER = os.path.join(DATA_FOLDER, 'options')
ATM_MAP_FILE   = os.path.join(OPTIONS_FOLDER, 'atm_map.json')

# Names that differ between your equity symbols and Fyers option symbols
NAME_FIX = {
    'NIFTY50': 'NIFTY',
}

def fyers_underlying(name):
    return NAME_FIX.get(name, name)

def extract_underlying(symbol):
    # 'NSE:RELIANCE-EQ' -> 'RELIANCE' , 'NSE:NIFTY50-INDEX' -> 'NIFTY50'
    s = symbol.split(':')[-1]
    for suffix in ('-EQ', '-INDEX'):
        if s.endswith(suffix):
            s = s[:-len(suffix)]
    return s

def get_fyers_client():
    token = load_access_token()
    if not token:
        print("No access token. Run auth.py first.")
        return None
    return fyersModel.FyersModel(client_id=CLIENT_ID, token=token, log_path="")

def get_last_price(symbol):
    clean = symbol.replace('NSE:', 'NSE_').replace('BSE:', 'BSE_').replace(':', '_').replace('-', '_')
    path  = os.path.join(DATA_FOLDER, '15min', f"{clean}.parquet")
    if not os.path.exists(path):
        return None
    df = pd.read_parquet(path)
    return float(df['close'].iloc[-1])

def fetch_option_ohlcv(fyers, symbol, timeframe_value, days=30):
    end_date   = datetime.now()
    start_date = end_date - timedelta(days=days)
    data = {
        "symbol":      symbol,
        "resolution":  timeframe_value,
        "date_format": "1",
        "range_from":  start_date.strftime("%Y-%m-%d"),
        "range_to":    end_date.strftime("%Y-%m-%d"),
        "cont_flag":   "1"
    }
    try:
        response = fyers.history(data=data)
        if response.get("s") != "ok":
            print(f"    API error: {response.get('message','unknown')}")
            return None
        candles = response.get("candles", [])
        if not candles:
            return None
        df = pd.DataFrame(candles, columns=["timestamp","open","high","low","close","volume"])
        df["datetime"] = epoch_series_to_ist(df["timestamp"])
        df = df.set_index("datetime")
        return df
    except Exception as e:
        print(f"    Exception: {e}")
        return None

def save_option_data(fyers, ce_symbol, pe_symbol, underlying_clean, atm_info):
    results = {'ce': {}, 'pe': {}}
    for tf_name, tf_value in TIMEFRAMES.items():
        folder = os.path.join(OPTIONS_FOLDER, tf_name)
        os.makedirs(folder, exist_ok=True)
        for opt_type, opt_symbol in [('ce', ce_symbol), ('pe', pe_symbol)]:
            strike   = atm_info['ce_strike'] if opt_type == 'ce' else atm_info['pe_strike']
            filename = f"{underlying_clean}_{opt_type.upper()}_{strike}_{atm_info['expiry_str']}.parquet"
            filepath = os.path.join(folder, filename)
            df = fetch_option_ohlcv(fyers, opt_symbol, tf_value, days=30)
            if df is not None and len(df) > 0:
                df.to_parquet(filepath)
                results[opt_type][tf_name] = filepath
                print(f"    {opt_type.upper()} {tf_name}: {len(df)} candles saved")
            else:
                print(f"    {opt_type.upper()} {tf_name}: no data")
            time.sleep(0.3)
    return results

def fetch_all_options(symbols_list):
    print("Starting ATM options download (real strikes from strike_map)...")
    os.makedirs(OPTIONS_FOLDER, exist_ok=True)

    fyers = get_fyers_client()
    if not fyers:
        return

    strike_map = load_strike_map()
    if not strike_map:
        print("Strike map empty. Run strike_finder.py first.")
        return

    atm_map = {}
    success = 0
    failed  = 0
    skipped = 0
    total   = len(symbols_list)

    for idx, symbol in enumerate(symbols_list, 1):
        print(f"\n[{idx}/{total}] {symbol}")

        last_price = get_last_price(symbol)
        if last_price is None:
            print(f"  No equity data — skipping")
            skipped += 1
            continue

        underlying = fyers_underlying(extract_underlying(symbol))
        atm_info   = get_exact_atm(underlying, last_price, strike_map)
        if atm_info is None:
            print(f"  {underlying} not in Fyers options — skipping")
            skipped += 1
            continue

        ce_symbol = build_fyers_option_symbol('NSE', underlying, atm_info['expiry_str'], atm_info['ce_strike'], 'CE')
        pe_symbol = build_fyers_option_symbol('NSE', underlying, atm_info['expiry_str'], atm_info['pe_strike'], 'PE')

        print(f"  Price: {last_price} | CE: {atm_info['ce_strike']} | PE: {atm_info['pe_strike']} | Expiry: {atm_info['nearest_expiry']}")
        print(f"  CE: {ce_symbol}")
        print(f"  PE: {pe_symbol}")

        clean = symbol.replace('NSE:','NSE_').replace(':','_').replace('-','_')
        saved = save_option_data(fyers, ce_symbol, pe_symbol, clean, atm_info)

        atm_map[symbol] = {
            'last_price':     last_price,
            'underlying':     underlying,
            'ce_strike':      atm_info['ce_strike'],
            'pe_strike':      atm_info['pe_strike'],
            'interval':       atm_info['interval'],
            'nearest_expiry': atm_info['nearest_expiry'],
            'expiry_str':     atm_info['expiry_str'],
            'ce_symbol':      ce_symbol,
            'pe_symbol':      pe_symbol,
            'ce_files':       saved['ce'],
            'pe_files':       saved['pe'],
            'updated_at':     datetime.now().isoformat(),
        }

        if saved['ce'] or saved['pe']:
            success += 1
        else:
            failed += 1

        print(f"  Progress: {round((idx/total)*100)}%")

    with open(ATM_MAP_FILE, 'w') as f:
        json.dump(atm_map, f, indent=2)

    print(f"\n{'='*50}")
    print(f"Options download complete!")
    print(f"Success : {success}")
    print(f"Failed  : {failed}")
    print(f"Skipped : {skipped}")
    print(f"ATM map : {ATM_MAP_FILE}")

if __name__ == '__main__':
    import sys
    from fno_symbols import FNO_SYMBOLS
    if len(sys.argv) > 1 and sys.argv[1] == 'test':
        fetch_all_options(['NSE:KOTAKBANK-EQ', 'NSE:BHEL-EQ', 'NSE:TATASTEEL-EQ'])
    else:
        fetch_all_options(FNO_SYMBOLS)