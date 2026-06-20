"""
One-time script to populate signals.db with the full signal history.

Run manually ONCE after first deploy:
    .\\venv\\Scripts\\python.exe backfill_signals.py

Live runs only log the last 3 signals per chart (cheap). This script walks the
full history of every equity, sector, and option parquet so that signals.db has
the complete record. INSERT OR IGNORE deduplicates safely if run again.
"""
import os
import json
import pandas as pd
from datetime import datetime
from signal_log import init_db, log_signals, build_events
from tz import now_ist
from custom_indicator import calculate_eata_pollan_cci_rsi, calculate_eata_pollan_cci_rvi
from sector_map import SECTOR_INDICES
from fno_symbols import FNO_SYMBOLS
from config import DATA_FOLDER

TIMEFRAMES = ['15min', '30min', '1hour', '3hour']
CS1 = {'cci_per': 14, 'rsi_per': 14, 'ma_period': 2, 'koef': 8}
CS2 = {'cci_per': 14, 'rvi_per': 10, 'ma_period': 2, 'koef': 8}
BATCH = 500   # flush to DB every N events


def _run_and_log(df, symbol, market_type, timeframe, indicator_pair, strike=None):
    """Run both indicators on df and return all signal events."""
    if df is None or len(df) < 30:
        return []
    _, s1 = calculate_eata_pollan_cci_rsi(df, **CS1)
    _, s2 = calculate_eata_pollan_cci_rvi(df, **CS2)
    events  = build_events(s1, symbol, market_type, timeframe, 'CCI-RSI', strike)
    events += build_events(s2, symbol, market_type, timeframe, 'CCI-RVI', strike)
    return events


def _flush(buf):
    if buf:
        log_signals(buf)
        buf.clear()


def main():
    init_db()
    total = 0
    buf   = []

    # --- Equity stocks ---
    print(f"Backfilling {len(FNO_SYMBOLS)} F&O stocks × {len(TIMEFRAMES)} TFs ...")
    for sym in FNO_SYMBOLS:
        clean = sym.replace(':', '_').replace('-', '_')
        for tf in TIMEFRAMES:
            fp = os.path.join(DATA_FOLDER, tf, f'{clean}.parquet')
            if not os.path.exists(fp):
                continue
            try:
                df = pd.read_parquet(fp)
                df = df.reset_index().set_index('datetime')
                buf.extend(_run_and_log(df, clean, 'EQ', tf, None))
                if len(buf) >= BATCH:
                    total += len(buf); _flush(buf)
            except Exception as e:
                print(f"  EQ error {clean} {tf}: {e}")
    total += len(buf); _flush(buf)
    print(f"  Equity done — {total} events so far")

    # --- Sector indices ---
    print(f"Backfilling {len(SECTOR_INDICES)} sector indices × {len(TIMEFRAMES)} TFs ...")
    for name, fyers_sym in SECTOR_INDICES.items():
        clean = fyers_sym.replace(':', '_').replace('-', '_')
        for tf in TIMEFRAMES:
            fp = os.path.join(DATA_FOLDER, 'sectors', tf, f'{clean}.parquet')
            if not os.path.exists(fp):
                continue
            try:
                df = pd.read_parquet(fp)
                df = df.reset_index().set_index('datetime')
                buf.extend(_run_and_log(df, clean, 'SECTOR', tf, None))
                if len(buf) >= BATCH:
                    total += len(buf); _flush(buf)
            except Exception as e:
                print(f"  SECTOR error {clean} {tf}: {e}")
    total += len(buf); _flush(buf)
    print(f"  Sectors done — {total} events so far")

    # --- Options ---
    atm_path = os.path.join(DATA_FOLDER, 'options', 'atm_map.json')
    if os.path.exists(atm_path):
        with open(atm_path) as f:
            atm_map = json.load(f)
        print(f"Backfilling {len(atm_map)} option symbols × 2 legs × {len(TIMEFRAMES)} TFs ...")
        for sym, info in atm_map.items():
            clean     = sym.replace(':', '_').replace('-', '_')
            ce_files  = info.get('ce_files') or {}
            pe_files  = info.get('pe_files') or {}
            ce_strike = info.get('ce_strike')
            pe_strike = info.get('pe_strike')
            for tf in TIMEFRAMES:
                for opt_type, fp, strike in [
                    ('CE', ce_files.get(tf), ce_strike),
                    ('PE', pe_files.get(tf), pe_strike),
                ]:
                    if not fp or not os.path.exists(fp):
                        continue
                    try:
                        df = pd.read_parquet(fp)
                        df = df.reset_index().set_index('datetime')
                        buf.extend(_run_and_log(df, clean, opt_type, tf, None, strike))
                        if len(buf) >= BATCH:
                            total += len(buf); _flush(buf)
                    except Exception as e:
                        print(f"  OPT error {clean} {opt_type} {tf}: {e}")
        total += len(buf); _flush(buf)
        print(f"  Options done — {total} events so far")
    else:
        print("  No atm_map.json found, skipping options backfill")

    print(f"\nBackfill complete. Total events logged: {total}")


if __name__ == '__main__':
    t0 = now_ist()
    main()
    elapsed = (now_ist() - t0).total_seconds()
    print(f"Elapsed: {elapsed:.1f}s")
