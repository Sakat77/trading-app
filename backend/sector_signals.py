import os
import multiprocessing
import pandas as pd
from concurrent.futures import ThreadPoolExecutor, as_completed
from config import DATA_FOLDER
from sector_map import SECTOR_INDICES
from stock_sector_map import SECTOR_STOCKS
from screener import load_df
from custom_indicator import calculate_eata_pollan_cci_rsi, calculate_eata_pollan_cci_rvi

TF_LABELS  = {'15min': '15m', '30min': '30m', '1hour': '1h', '3hour': '3h'}
TIMEFRAMES  = ['15min', '30min', '1hour', '3hour']
TAIL_BARS   = 200   # bars fed to indicators — well above max lookback (~14-20 bars)
_WORKERS    = min(8, multiprocessing.cpu_count())

_DEFAULT_CS1 = {'cci_per': 14, 'rsi_per': 14, 'ma_period': 2, 'koef': 8}
_DEFAULT_CS2 = {'cci_per': 14, 'rvi_per': 10, 'ma_period': 2, 'koef': 8}


def _load_sector_df(clean_symbol, timeframe):
    path = os.path.join(DATA_FOLDER, 'sectors', timeframe, f'{clean_symbol}.parquet')
    if not os.path.exists(path):
        return None
    try:
        df = pd.read_parquet(path)
        df = df.reset_index().set_index('datetime')
        if len(df) > TAIL_BARS:
            df = df.iloc[-TAIL_BARS:]
        return df
    except Exception:
        return None


def _last_sig_type(custom_data):
    """Return 'buy', 'sell', or None for the most recent crossover in custom_data."""
    for i in range(len(custom_data) - 1, 0, -1):
        c, p = custom_data[i], custom_data[i - 1]
        if None in (c['line1'], c['line2'], p['line1'], p['line2']):
            continue
        if c['line1'] >= c['line2'] and p['line1'] < p['line2']:
            return 'buy'
        if c['line1'] <= c['line2'] and p['line1'] > p['line2']:
            return 'sell'
    return None


def _tag_per_tf(rvi_sig, rsi_sig):
    """bull: CCI-RVI buy and not RSI sell; bear: CCI-RSI sell and not RVI buy; else neutral."""
    is_bull = rvi_sig == 'buy'
    is_bear = rsi_sig == 'sell'
    if is_bull and not is_bear:
        return 'bull'
    if is_bear and not is_bull:
        return 'bear'
    return 'neutral'


def _overall_tag(tf_tags):
    """bull if 1h and 3h both bull; bear if both bear; neutral otherwise."""
    if tf_tags.get('1hour') == 'bull' and tf_tags.get('3hour') == 'bull':
        return 'bull'
    if tf_tags.get('1hour') == 'bear' and tf_tags.get('3hour') == 'bear':
        return 'bear'
    return 'neutral'


def _classify_df(df, cs1, cs2):
    """Classify a single loaded DataFrame. Returns ('bull'|'bear'|'neutral', rsi_sig, rvi_sig)."""
    if df is None or len(df) < 30:
        return 'neutral', None, None
    try:
        custom1, _ = calculate_eata_pollan_cci_rsi(df,
            cci_per=cs1['cci_per'], rsi_per=cs1['rsi_per'],
            ma_period=cs1['ma_period'], koef=cs1['koef'])
        custom2, _ = calculate_eata_pollan_cci_rvi(df,
            cci_per=cs2['cci_per'], rvi_per=cs2['rvi_per'],
            ma_period=cs2['ma_period'], koef=cs2['koef'])
        rsi_sig = _last_sig_type(custom1)
        rvi_sig = _last_sig_type(custom2)
        return _tag_per_tf(rvi_sig, rsi_sig), rsi_sig, rvi_sig
    except Exception:
        return 'neutral', None, None


def classify_symbol(symbol, is_sector=False, cs1=None, cs2=None):
    """
    Classify a symbol across all 4 TFs using tail reads.
    symbol: clean format (NSE_RELIANCE_EQ or NSE_NIFTYBANK_INDEX)
    Returns {'tag': ..., 'tf': {'15m': ..., '30m': ..., '1h': ..., '3h': ...}}
    """
    if cs1 is None: cs1 = _DEFAULT_CS1
    if cs2 is None: cs2 = _DEFAULT_CS2

    tf_tags = {}
    for tf in TIMEFRAMES:
        if is_sector:
            df = _load_sector_df(symbol, tf)
        else:
            df = load_df(symbol, tf)
            if df is not None and len(df) > TAIL_BARS:
                df = df.iloc[-TAIL_BARS:]
        tag, _, _ = _classify_df(df, cs1, cs2)
        tf_tags[tf] = tag

    return {
        'tag': _overall_tag(tf_tags),
        'tf': {TF_LABELS[tf]: tf_tags[tf] for tf in TIMEFRAMES},
    }


# ---------------------------------------------------------------------------
# Thread-pool helpers for bulk classification
# ---------------------------------------------------------------------------

def _classify_one_sector_job(args):
    """Thread worker: classify one sector index + all its stocks."""
    sector_name, fyers_sym, cs1, cs2 = args
    neutral_tf = {lbl: 'neutral' for lbl in TF_LABELS.values()}
    clean = fyers_sym.replace(':', '_').replace('-', '_')

    try:
        info = classify_symbol(clean, is_sector=True, cs1=cs1, cs2=cs2)
    except Exception:
        info = {'tag': 'neutral', 'tf': dict(neutral_tf)}

    stock_list  = SECTOR_STOCKS.get(sector_name, [])
    stocks_out  = []
    for stock_fyers in stock_list:
        stock_clean = stock_fyers.replace(':', '_').replace('-', '_')
        display     = stock_fyers.replace('NSE:', '').replace('-EQ', '')
        try:
            s_info = classify_symbol(stock_clean, is_sector=False, cs1=cs1, cs2=cs2)
        except Exception:
            s_info = {'tag': 'neutral', 'tf': dict(neutral_tf)}
        stocks_out.append({'name': display, 'tag': s_info['tag'], 'tf': s_info['tf']})

    return {'name': sector_name, 'tag': info['tag'], 'tf': info['tf'], 'stocks': stocks_out}


def get_sector_tags(cs1=None, cs2=None):
    """Quick: classify all 16 sector indices in parallel. Returns {sector_name: tag}."""
    if cs1 is None: cs1 = _DEFAULT_CS1
    if cs2 is None: cs2 = _DEFAULT_CS2

    def _one(name_sym):
        name, fyers_sym = name_sym
        clean = fyers_sym.replace(':', '_').replace('-', '_')
        try:
            return name, classify_symbol(clean, is_sector=True, cs1=cs1, cs2=cs2)['tag']
        except Exception:
            return name, 'neutral'

    tags = {}
    with ThreadPoolExecutor(max_workers=_WORKERS) as pool:
        for name, tag in pool.map(_one, list(SECTOR_INDICES.items())):
            tags[name] = tag
    return tags


def classify_many(symbols, is_sector=False, cs1=None, cs2=None):
    """Classify a list of clean symbols in parallel. Returns list of {name, tag, tf}."""
    if cs1 is None: cs1 = _DEFAULT_CS1
    if cs2 is None: cs2 = _DEFAULT_CS2
    neutral_tf = {lbl: 'neutral' for lbl in TF_LABELS.values()}

    def _one(sym):
        try:
            return {'name': sym, **classify_symbol(sym, is_sector=is_sector, cs1=cs1, cs2=cs2)}
        except Exception:
            return {'name': sym, 'tag': 'neutral', 'tf': dict(neutral_tf)}

    results = []
    with ThreadPoolExecutor(max_workers=_WORKERS) as pool:
        for r in pool.map(_one, symbols):
            results.append(r)
    return results


def build_sectors_payload(cs1=None, cs2=None):
    """Full sector payload: all 16 sectors + their stocks, signal-classified in parallel."""
    if cs1 is None: cs1 = _DEFAULT_CS1
    if cs2 is None: cs2 = _DEFAULT_CS2

    tasks   = [(name, sym, cs1, cs2) for name, sym in SECTOR_INDICES.items()]
    sectors = []

    with ThreadPoolExecutor(max_workers=_WORKERS) as pool:
        futures = [pool.submit(_classify_one_sector_job, t) for t in tasks]
        for f in as_completed(futures):
            try:
                sectors.append(f.result())
            except Exception as e:
                print(f"[sectors] classify error: {e}")

    sectors.sort(key=lambda s: s['name'])
    return {'type': 'sectors', 'sectors': sectors}


def build_stocks_payload(fno_symbols, cs1=None, cs2=None):
    """Classify all F&O stocks in parallel for the Stocks tab."""
    if cs1 is None: cs1 = _DEFAULT_CS1
    if cs2 is None: cs2 = _DEFAULT_CS2
    neutral_tf = {lbl: 'neutral' for lbl in TF_LABELS.values()}

    def _one(fyers_sym):
        clean   = fyers_sym.replace(':', '_').replace('-', '_')
        display = fyers_sym.replace('NSE:', '').replace('-EQ', '')
        try:
            info = classify_symbol(clean, is_sector=False, cs1=cs1, cs2=cs2)
        except Exception:
            info = {'tag': 'neutral', 'tf': dict(neutral_tf)}
        return {'name': display, 'tag': info['tag'], 'tf': info['tf']}

    stocks = []
    with ThreadPoolExecutor(max_workers=_WORKERS) as pool:
        for r in pool.map(_one, fno_symbols):
            stocks.append(r)
    return {'type': 'stocks', 'stocks': stocks}
