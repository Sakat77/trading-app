import asyncio
import websockets
import json
import multiprocessing
import pandas as pd
import os
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from screener import run_screener, get_latest_signals as _get_latest_sigs
from fno_symbols import FNO_SYMBOLS
from config import DATA_FOLDER
from xma_indicator import calculate_xma
from supply_demand import calculate_supply_demand
from indicators import get_all_indicators
from custom_indicator import (
    calculate_eata_pollan_cci_rsi,
    calculate_eata_pollan_cci_rvi
)
from sector_map import SECTOR_INDICES
from stock_sector_map import SECTOR_STOCKS, STOCK_SECTOR
from signal_log import init_db, log_signals, build_events
from sector_signals import (
    build_sectors_payload, build_stocks_payload,
    get_sector_tags, classify_symbol as classify_sym,
)
from options_trades import build_options_trades
from options_confluence import build_options_confluence_trades
from options_analytics import build_options_analytics
from bamsbung import calculate_bamsbung

try:
    import polars as pl
    _HAS_POLARS = True
except ImportError:
    _HAS_POLARS = False

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
TAIL_BARS        = 200   # bars fed to indicators in the hot path
REFRESH_INTERVAL = 60    # seconds between background cache refreshes
CACHE            = {"overview": None, "sectors": None, "options_trades": None, "options_confluence": None, "options_analytics": None}
_COMPUTE_WORKERS = min(8, multiprocessing.cpu_count())

# Reverse map: clean symbol -> sector name (built once at import)
_STOCK_SECTOR_CLEAN = {
    s.replace(':', '_').replace('-', '_'): sec
    for s, sec in STOCK_SECTOR.items()
}

connected_clients = set()


# ---------------------------------------------------------------------------
# Fast parquet tail reader
# ---------------------------------------------------------------------------
def _read_tail_parquet(filepath, n=TAIL_BARS):
    """Read only the last n rows of a parquet. Uses polars when available."""
    if _HAS_POLARS:
        try:
            df_pl = pl.read_parquet(filepath)
            if len(df_pl) > n:
                df_pl = df_pl.tail(n)
            df = df_pl.to_pandas()
            for col in ("datetime", "index", "__index_level_0__"):
                if col in df.columns:
                    df = df.rename(columns={col: "datetime"}).set_index("datetime")
                    break
            return df
        except Exception:
            pass
    df = pd.read_parquet(filepath)
    df = df.reset_index().set_index("datetime")
    if len(df) > n:
        df = df.iloc[-n:]
    return df


def load_sector_summary(timeframe):
    sectors_folder = os.path.join(DATA_FOLDER, "sectors")
    results = []

    for sector_name, fyers_symbol in SECTOR_INDICES.items():
        clean_symbol = fyers_symbol.replace(":", "_").replace("-", "_")
        filepath = os.path.join(sectors_folder, timeframe, f"{clean_symbol}.parquet")
        if not os.path.exists(filepath):
            continue
        try:
            df = pd.read_parquet(filepath)
            df = df.sort_index()
            if len(df) < 2:
                continue

            df["_d"] = df.index.date
            days = sorted(df["_d"].unique())

            if len(days) >= 2:
                cur_rows  = df[df["_d"] == days[-1]]
                prev_rows = df[df["_d"] == days[-2]]
                latest_close = float(cur_rows["close"].iloc[-1])
                prev_close   = float(prev_rows["close"].iloc[-1])
            else:
                latest_close = float(df["close"].iloc[-1])
                prev_close   = float(df["close"].iloc[-2])

            change     = round(latest_close - prev_close, 2)
            change_pct = round((change / prev_close) * 100, 2)

            sparkline = [
                {"t": int(r["timestamp"]), "v": round(float(r["close"]), 2)}
                for _, r in df.tail(50).iterrows()
            ]

            stocks = [s.replace("NSE:", "").replace("-EQ", "")
                      for s in SECTOR_STOCKS.get(sector_name, [])]

            results.append({
                "name":        sector_name,
                "symbol":      clean_symbol,
                "current":     round(latest_close, 2),
                "prev_close":  round(prev_close, 2),
                "change":      change,
                "change_pct":  change_pct,
                "sparkline":   sparkline,
                "stock_count": len(stocks),
                "stocks":      stocks,
            })
        except Exception as e:
            print(f"Sector data error [{sector_name}]: {e}")

    return results

def _read_option_summary(filepath):
    if not filepath or not os.path.exists(filepath):
        return None
    try:
        df = pd.read_parquet(filepath)
        df = df.sort_index()
        if len(df) < 2:
            return None
        df["_d"] = df.index.date
        days = sorted(df["_d"].unique())
        cur_rows = df[df["_d"] == days[-1]]
        if len(days) >= 2:
            prev_rows  = df[df["_d"] == days[-2]]
            prev_close = float(prev_rows["close"].iloc[-1]) if len(prev_rows) > 0 else float(df["close"].iloc[-2])
        else:
            prev_close = float(df["close"].iloc[-2])
        latest     = float(cur_rows["close"].iloc[-1])
        change     = round(latest - prev_close, 2)
        change_pct = round((change / prev_close) * 100, 2) if prev_close > 0 else 0
        sparkline  = [{"t": int(r["timestamp"]), "v": round(float(r["close"]), 2)}
                      for _, r in df.tail(30).iterrows()]
        return {
            "current":    round(latest, 2),
            "prev_close": round(prev_close, 2),
            "change":     change,
            "change_pct": change_pct,
            "sparkline":  sparkline,
        }
    except Exception:
        return None


def load_options_overview(timeframe):
    atm_map_path = os.path.join(DATA_FOLDER, "options", "atm_map.json")
    if not os.path.exists(atm_map_path):
        return []
    with open(atm_map_path) as f:
        atm_map = json.load(f)
    results = []
    for symbol, info in atm_map.items():
        ce_files = info.get("ce_files") or {}
        pe_files = info.get("pe_files") or {}
        results.append({
            "symbol":     symbol,
            "underlying": info.get("underlying", ""),
            "last_price": info.get("last_price", 0),
            "ce_strike":  info.get("ce_strike", 0),
            "pe_strike":  info.get("pe_strike", 0),
            "interval":   info.get("interval", 0),
            "expiry_str": info.get("expiry_str", ""),
            "ce":         _read_option_summary(ce_files.get(timeframe)),
            "pe":         _read_option_summary(pe_files.get(timeframe)),
        })
    results.sort(key=lambda x: x["underlying"])
    return results


def load_option_chart_data(filepath, settings, cs1, cs2):
    if not filepath or not os.path.exists(filepath):
        return None, None, None, None, None, None, None, None
    try:
        df = pd.read_parquet(filepath)
        df = df.reset_index().set_index("datetime")
        candles = [{
            "time":   int(row["timestamp"]),
            "open":   round(float(row["open"]),  2),
            "high":   round(float(row["high"]),  2),
            "low":    round(float(row["low"]),   2),
            "close":  round(float(row["close"]), 2),
            "volume": int(row["volume"])
        } for _, row in df.iterrows()]
        indicators = get_all_indicators(df,
            cci_period=settings.get("cci_period", 20),
            rsi_period=settings.get("rsi_period", 14),
            rvi_period=settings.get("rvi_period", 10))
        custom1, signals1 = calculate_eata_pollan_cci_rsi(df,
            cci_per=cs1.get("cci_per", 14), rsi_per=cs1.get("rsi_per", 14),
            ma_period=cs1.get("ma_period", 2), koef=cs1.get("koef", 8))
        custom2, signals2 = calculate_eata_pollan_cci_rvi(df,
            cci_per=cs2.get("cci_per", 14), rvi_per=cs2.get("rvi_per", 10),
            ma_period=cs2.get("ma_period", 2), koef=cs2.get("koef", 8))
        xma      = calculate_xma(df)
        sd_zones = calculate_supply_demand(df)
        return candles, indicators, custom1, signals1, custom2, signals2, xma, sd_zones
    except Exception as e:
        print(f"Option chart data error [{filepath}]: {e}")
        return None, None, None, None, None, None, None, None


def load_symbol_data(symbol, timeframe, settings, cs1, cs2):
    filepath = os.path.join(DATA_FOLDER, timeframe, f"{symbol}.parquet")
    if not os.path.exists(filepath):
        print(f"File not found: {filepath}")
        return None, None, None, None, None, None, None, None, None, None

    df = pd.read_parquet(filepath)
    df = df.reset_index().set_index("datetime")

    candles = [{
        "time":   int(row["timestamp"]),
        "open":   round(float(row["open"]),  2),
        "high":   round(float(row["high"]),  2),
        "low":    round(float(row["low"]),   2),
        "close":  round(float(row["close"]), 2),
        "volume": int(row["volume"])
    } for _, row in df.iterrows()]

    indicators = get_all_indicators(
        df,
        cci_period=settings.get("cci_period", 20),
        rsi_period=settings.get("rsi_period", 14),
        rvi_period=settings.get("rvi_period", 10)
    )

    custom1, signals1 = calculate_eata_pollan_cci_rsi(
        df,
        cci_per=cs1.get("cci_per", 14),
        rsi_per=cs1.get("rsi_per", 14),
        ma_period=cs1.get("ma_period", 2),
        koef=cs1.get("koef", 8)
    )

    custom2, signals2 = calculate_eata_pollan_cci_rvi(
        df,
        cci_per=cs2.get("cci_per", 14),
        rvi_per=cs2.get("rvi_per", 10),
        ma_period=cs2.get("ma_period", 2),
        koef=cs2.get("koef", 8)
    )

    xma      = calculate_xma(df)
    sd_zones = calculate_supply_demand(df)
    bamsbung_data, bamsbung_signals = calculate_bamsbung(df)

    return candles, indicators, custom1, signals1, custom2, signals2, xma, sd_zones, bamsbung_data, bamsbung_signals

# ---------------------------------------------------------------------------
# Background compute functions (run in thread pool, never on the event loop)
# ---------------------------------------------------------------------------

def _process_one_option_for_overview(args):
    """Thread worker: one ATM symbol × all TFs → list of (tf, sym, tag, log_events)."""
    sym, info, cs1, cs2 = args
    ce_files  = info.get("ce_files") or {}
    pe_files  = info.get("pe_files") or {}
    ce_strike = info.get("ce_strike")
    pe_strike = info.get("pe_strike")
    clean_sym = sym.replace(":", "_").replace("-", "_")
    results   = []

    for tf in ("15min", "30min", "1hour", "3hour"):
        ce_fp = ce_files.get(tf)
        pe_fp = pe_files.get(tf)
        ce_rvi = ce_rsi = pe_rvi = pe_rsi = None
        log_events = []

        for fp, opt_type, strike in ((ce_fp, "CE", ce_strike), (pe_fp, "PE", pe_strike)):
            if not fp or not os.path.exists(fp):
                continue
            try:
                df = _read_tail_parquet(fp)
                if len(df) < 30:
                    continue
                c1, _ = calculate_eata_pollan_cci_rsi(df,
                    cci_per=cs1["cci_per"], rsi_per=cs1["rsi_per"],
                    ma_period=cs1["ma_period"], koef=cs1["koef"])
                c2, _ = calculate_eata_pollan_cci_rvi(df,
                    cci_per=cs2["cci_per"], rvi_per=cs2["rvi_per"],
                    ma_period=cs2["ma_period"], koef=cs2["koef"])
                rsi_sigs = _get_latest_sigs(df, c1, n=3)
                rvi_sigs = _get_latest_sigs(df, c2, n=3)
                rsi_last = rsi_sigs[-1]["type"] if rsi_sigs else None
                rvi_last = rvi_sigs[-1]["type"] if rvi_sigs else None
                if opt_type == "CE":
                    ce_rvi, ce_rsi = rvi_last, rsi_last
                else:
                    pe_rvi, pe_rsi = rvi_last, rsi_last
                # Log only recent signals — full history is for backfill_signals.py
                log_events.extend(build_events(rsi_sigs, clean_sym, opt_type, tf, "CCI-RSI", strike))
                log_events.extend(build_events(rvi_sigs, clean_sym, opt_type, tf, "CCI-RVI", strike))
            except Exception:
                pass

        bull_score = (1 if ce_rvi == "buy" else 0) + (1 if pe_rsi == "sell" else 0)
        bear_score = (1 if pe_rvi == "buy" else 0) + (1 if ce_rsi == "sell" else 0)
        tag = "bull" if bull_score > bear_score else "bear" if bear_score > bull_score else "neutral"
        results.append((tf, sym, tag, log_events))

    return results


def _compute_overview_sync():
    cs1 = {"cci_per": 14, "rsi_per": 14, "ma_period": 2, "koef": 8}
    cs2 = {"cci_per": 14, "rvi_per": 10, "ma_period": 2, "koef": 8}

    atm_path = os.path.join(DATA_FOLDER, "options", "atm_map.json")
    if not os.path.exists(atm_path):
        return []
    with open(atm_path) as f:
        atm_map = json.load(f)

    tf_acc     = {tf: {"bull": 0, "bear": 0, "neutral": 0, "symbols": []}
                  for tf in ("15min", "30min", "1hour", "3hour")}
    all_events = []
    tasks      = [(sym, info, cs1, cs2) for sym, info in atm_map.items()]

    with ThreadPoolExecutor(max_workers=_COMPUTE_WORKERS) as pool:
        futures = [pool.submit(_process_one_option_for_overview, t) for t in tasks]
        for future in as_completed(futures):
            try:
                for tf, sym, tag, evts in future.result():
                    tf_acc[tf][tag] += 1
                    tf_acc[tf]["symbols"].append({"symbol": sym, "tag": tag})
                    all_events.extend(evts)
            except Exception as e:
                print(f"[overview] worker error: {e}")

    log_signals(all_events)

    out = []
    for tf in ("15min", "30min", "1hour", "3hour"):
        r     = tf_acc[tf]
        total = r["bull"] + r["bear"] + r["neutral"] or 1
        out.append({
            "tf": tf, "bull": r["bull"], "bear": r["bear"], "neutral": r["neutral"],
            "bull_pct": round(r["bull"] / total * 100),
            "bear_pct": round(r["bear"] / total * 100),
            "symbols":  r["symbols"],
        })
    return out


def _compute_sectors_sync():
    return build_sectors_payload()


def _parse_expiry(token):
    """'26JUN' or 'NSE:RELIANCE26JUN1320CE' -> '26 Jun'. Returns None if unparseable."""
    m = re.search(r'(\d{1,2})([A-Z]{3})', str(token).upper())
    if not m:
        return None
    return f"{int(m.group(1)):02d} {m.group(2).capitalize()}"


def _build_live_ltp():
    """Return a flat dict:
      {clean_sym: spot_ltp}          — underlying last close
      {clean_sym_CE_strike: opt_ltp} — option last close for all known strikes
      {clean_sym_EXPIRY: '26 Jun'}   — front-month expiry per underlying
    """
    live = {}

    # --- Underlying spot from equity 15min parquets (fall back to atm_map last_price) ---
    atm_path = os.path.join(DATA_FOLDER, "options", "atm_map.json")
    if os.path.exists(atm_path):
        try:
            with open(atm_path) as f:
                atm_map = json.load(f)
            for sym, info in atm_map.items():
                clean   = sym.replace(":", "_").replace("-", "_")
                eq_path = os.path.join(DATA_FOLDER, "15min", f"{clean}.parquet")
                if os.path.exists(eq_path):
                    try:
                        df = pd.read_parquet(eq_path)
                        live[clean] = round(float(df["close"].iloc[-1]), 2)
                    except Exception:
                        live[clean] = info.get("last_price")
                else:
                    live[clean] = info.get("last_price")
        except Exception as e:
            print(f"[live_ltp] atm_map error: {e}")

    # --- Option LTP + expiry: scan every parquet in options/15min ---
    # Filename pattern: NSE_RELIANCE_EQ_CE_1320_26JUN.parquet
    opt_dir = os.path.join(DATA_FOLDER, "options", "15min")
    if os.path.exists(opt_dir):
        _pat = re.compile(r'^(.+)_(CE|PE)_(\d+)_([A-Z0-9]+)\.parquet$')
        try:
            for fname in os.listdir(opt_dir):
                m = _pat.match(fname)
                if not m:
                    continue
                sym_clean, mkt, strike_str, exp_tok = m.group(1), m.group(2), m.group(3), m.group(4)
                fp = os.path.join(opt_dir, fname)
                try:
                    df = pd.read_parquet(fp)
                    if len(df):
                        live[f"{sym_clean}_{mkt}_{strike_str}"] = round(float(df["close"].iloc[-1]), 2)
                    exp_fmt = _parse_expiry(exp_tok)
                    if exp_fmt and f"{sym_clean}_EXPIRY" not in live:
                        live[f"{sym_clean}_EXPIRY"] = exp_fmt
                except Exception:
                    pass
        except Exception as e:
            print(f"[live_ltp] options scan error: {e}")

    return live


def _compute_options_trades_sync():
    live_ltp = _build_live_ltp()
    trades   = build_options_trades(live_ltp)
    return {"type": "options_trades", "trades": trades}


def _compute_options_confluence_sync():
    live_ltp = _build_live_ltp()
    trades   = build_options_confluence_trades(live_ltp)
    return {"type": "options_confluence", "trades": trades}


def _compute_options_analytics_sync():
    live_ltp = _build_live_ltp()
    return build_options_analytics(live_ltp)


async def background_refresh():
    """Recomputes overview + sectors every REFRESH_INTERVAL s; broadcasts to connected clients."""
    loop = asyncio.get_event_loop()
    while True:
        # Overview
        try:
            result = await loop.run_in_executor(None, _compute_overview_sync)
            CACHE["overview"] = result
            if connected_clients and result:
                msg = json.dumps({"type": "overview", "timeframes": result})
                await asyncio.gather(*(c.send(msg) for c in set(connected_clients)),
                                     return_exceptions=True)
            total_syms = sum(r["bull"] + r["bear"] + r["neutral"] for r in result)
            print(f"[cache] overview refreshed — {total_syms} symbols across 4 TFs")
        except Exception as e:
            print(f"[cache] overview error: {e}")

        # Sectors (price merged per-request from load_sector_summary, not cached here)
        try:
            result = await loop.run_in_executor(None, _compute_sectors_sync)
            CACHE["sectors"] = result
            print(f"[cache] sectors refreshed — {len(result.get('sectors', []))} sectors")
        except Exception as e:
            print(f"[cache] sectors error: {e}")

        # Options trades blotter
        try:
            result = await loop.run_in_executor(None, _compute_options_trades_sync)
            CACHE["options_trades"] = result
            if connected_clients:
                msg = json.dumps(result)
                await asyncio.gather(*(c.send(msg) for c in set(connected_clients)),
                                     return_exceptions=True)
            print(f"[options_trades] {len(result.get('trades', []))} rows")
        except Exception as e:
            print(f"[cache] options_trades error: {e}")

        # Options confluence blotter
        try:
            result = await loop.run_in_executor(None, _compute_options_confluence_sync)
            CACHE["options_confluence"] = result
            if connected_clients:
                msg = json.dumps(result)
                await asyncio.gather(*(c.send(msg) for c in set(connected_clients)),
                                     return_exceptions=True)
            print(f"[options_confluence] {len(result.get('trades', []))} rows")
        except Exception as e:
            print(f"[cache] options_confluence error: {e}")

        # Options analytics
        try:
            result = await loop.run_in_executor(None, _compute_options_analytics_sync)
            CACHE["options_analytics"] = result
            if connected_clients:
                msg = json.dumps(result)
                await asyncio.gather(*(c.send(msg) for c in set(connected_clients)),
                                     return_exceptions=True)
            total_closed = result.get("buckets", {}).get("all", {}).get("total", 0)
            print(f"[options_analytics] built — {total_closed} closed trades")
        except Exception as e:
            print(f"[cache] options_analytics error: {e}")

        await asyncio.sleep(REFRESH_INTERVAL)


async def handle_client(websocket):
    connected_clients.add(websocket)
    print(f"Frontend connected. Total: {len(connected_clients)}")

    symbol    = "NSE_RELIANCE_EQ"
    timeframe = "15min"
    settings  = {"cci_period": 20, "rsi_period": 14, "rvi_period": 10}
    cs1       = {"cci_per": 14, "rsi_per": 14, "ma_period": 2, "koef": 8}
    cs2       = {"cci_per": 14, "rvi_per": 10, "ma_period": 2, "koef": 8}
    leg       = "EQ"

    async def send_data():
        opt_title = None
        if leg == "EQ":
            candles, indicators, c1, s1, c2, s2, xma, sd_zones, bams, bams_sig = load_symbol_data(
                symbol, timeframe, settings, cs1, cs2
            )
        else:
            candles = indicators = c1 = s1 = c2 = s2 = xma = sd_zones = bams = bams_sig = None
            atm_path = os.path.join(DATA_FOLDER, "options", "atm_map.json")
            if os.path.exists(atm_path):
                with open(atm_path) as f:
                    atm_map = json.load(f)
                fyers_key = next(
                    (k for k in atm_map if k.replace(":", "_").replace("-", "_") == symbol),
                    None
                )
                if fyers_key:
                    info    = atm_map[fyers_key]
                    files   = info.get("ce_files" if leg == "CE" else "pe_files") or {}
                    strike  = info.get("ce_strike" if leg == "CE" else "pe_strike")
                    expiry  = info.get("expiry_str", "")
                    fp      = files.get(timeframe)
                    candles, indicators, c1, s1, c2, s2, xma, sd_zones = load_option_chart_data(
                        fp, settings, cs1, cs2
                    )
                    if candles:
                        sym_label = symbol.replace("NSE_", "").replace("_EQ", "")
                        opt_title = f"{sym_label} {leg} {strike} {expiry}"

        await websocket.send(json.dumps({
            "type":       "history",
            "symbol":     symbol,
            "leg":        leg,
            "opt_title":  opt_title,
            "candles":    candles or [],
            "indicators": indicators,
            "custom1":    c1,
            "signals1":   s1 or [],
            "custom2":    c2,
            "signals2":   s2 or [],
            "xma":           xma,
            "sd_zones":      sd_zones or [],
            "bamsbung":      bams,
            "bamsbung_sigs": bams_sig,
        }))
        if candles:
            n1  = len(s1 or [])
            n2  = len(s2 or [])
            n_z = len(sd_zones or [])
            print(f"Sent {len(candles)} candles [{symbol} {leg} {timeframe}] | sig={n1},{n2} zones={n_z}")

    try:
        await send_data()

        # Push cached options data immediately on connect
        if CACHE.get("options_trades"):
            await websocket.send(json.dumps(CACHE["options_trades"]))
        if CACHE.get("options_confluence"):
            await websocket.send(json.dumps(CACHE["options_confluence"]))
        if CACHE.get("options_analytics"):
            await websocket.send(json.dumps(CACHE["options_analytics"]))

        async for message in websocket:
            data = json.loads(message)
            t = data.get("type")

            if t == "change_symbol":
                symbol    = data.get("symbol",    symbol)
                timeframe = data.get("timeframe", timeframe)
                leg       = data.get("leg",       leg)
                await send_data()

            elif t == "get_symbols":
                eq_dir = os.path.join(DATA_FOLDER, "15min")
                syms   = []
                if os.path.exists(eq_dir):
                    for fname in sorted(os.listdir(eq_dir)):
                        if fname.endswith("_EQ.parquet"):
                            syms.append(fname[:-len(".parquet")])
                await websocket.send(json.dumps({"type": "symbols", "symbols": syms}))
                print(f"[symbols] sent {len(syms)} equity symbols")

            elif t == "change_settings":
                settings = data.get("settings",  settings)
                cs1      = data.get("cs1",        cs1)
                cs2      = data.get("cs2",        cs2)
                await send_data()

            elif t == "get_triple_chart":
                req_sym = data.get("symbol", "NSE:RELIANCE-EQ")
                req_tf  = data.get("timeframe", "15min")

                clean = req_sym.replace(":", "_").replace("-", "_")
                candles, indicators, c1, s1, c2, s2, xma, sd_zones, bams, bams_sig = load_symbol_data(clean, req_tf, settings, cs1, cs2)
                eq = (candles, indicators, c1, s1, c2, s2, xma, sd_zones)

                atm_path = os.path.join(DATA_FOLDER, "options", "atm_map.json")
                opt_info = {}
                ce_result = (None,)*8
                pe_result = (None,)*8
                if os.path.exists(atm_path):
                    with open(atm_path) as f:
                        atm_map = json.load(f)
                    opt = atm_map.get(req_sym, {})
                    opt_info = {
                        "underlying": opt.get("underlying", ""),
                        "ce_strike":  opt.get("ce_strike"),
                        "pe_strike":  opt.get("pe_strike"),
                        "expiry":     opt.get("expiry_str", ""),
                    }
                    ce_fp = (opt.get("ce_files") or {}).get(req_tf)
                    pe_fp = (opt.get("pe_files") or {}).get(req_tf)
                    ce_result = load_option_chart_data(ce_fp, settings, cs1, cs2)
                    pe_result = load_option_chart_data(pe_fp, settings, cs1, cs2)

                def pack(t):
                    if not t[0]:
                        return None
                    return {"candles":t[0],"custom1":t[2],"signals1":t[3],"custom2":t[4],"signals2":t[5],"xma":t[6],"sd_zones":t[7]}

                await websocket.send(json.dumps({
                    "type":       "triple_chart",
                    "symbol":     req_sym,
                    "timeframe":  req_tf,
                    "underlying": opt_info.get("underlying"),
                    "ce_strike":  opt_info.get("ce_strike"),
                    "pe_strike":  opt_info.get("pe_strike"),
                    "expiry":     opt_info.get("expiry"),
                    "stock":      pack(eq),
                    "ce":         pack(ce_result),
                    "pe":         pack(pe_result),
                }))
                print(f"Triple chart: {req_sym} @ {req_tf} | stock={len(eq[0] or [])} CE={len(ce_result[0] or [])} PE={len(pe_result[0] or [])} candles")

            elif t == "get_options_overview":
                req_tf = data.get("timeframe", "15min")
                opts = load_options_overview(req_tf)
                await websocket.send(json.dumps({
                    "type":      "options_overview",
                    "timeframe": req_tf,
                    "data":      opts,
                }))
                print(f"Options overview sent: {len(opts)} symbols @ {req_tf}")

            elif t == "get_sector_data":
                req_tf = data.get("timeframe", "15min")
                cached = CACHE["sectors"]
                if cached is None:
                    await websocket.send(json.dumps({
                        "type": "sector_data", "timeframe": req_tf,
                        "sectors": [], "loading": True
                    }))
                    print("[sectors] cache not ready, sent loading flag")
                else:
                    # Merge cheap price data (no indicators) with cached signal tags
                    price_map = {s["name"]: s for s in load_sector_summary(req_tf)}
                    sectors = []
                    for sec in cached.get("sectors", []):
                        p = price_map.get(sec["name"], {})
                        sectors.append({**sec,
                            "current":    p.get("current"),
                            "change":     p.get("change"),
                            "change_pct": p.get("change_pct"),
                            "sparkline":  p.get("sparkline", []),
                            "stock_count": p.get("stock_count", len(sec.get("stocks", []))),
                        })
                    await websocket.send(json.dumps({
                        "type": "sector_data", "timeframe": req_tf, "sectors": sectors
                    }))
                    print(f"[sectors] cache served: {len(sectors)} sectors @ {req_tf}")

            elif t == "get_options_trades":
                cached = CACHE.get("options_trades")
                if cached is None:
                    await websocket.send(json.dumps({
                        "type": "options_trades", "trades": [], "loading": True
                    }))
                else:
                    await websocket.send(json.dumps(cached))
                    print(f"[options_trades] cache served: {len(cached.get('trades', []))} rows")

            elif t == "get_options_confluence":
                cached = CACHE.get("options_confluence")
                if cached is None:
                    await websocket.send(json.dumps({
                        "type": "options_confluence", "trades": [], "loading": True
                    }))
                else:
                    await websocket.send(json.dumps(cached))
                    print(f"[options_confluence] cache served: {len(cached.get('trades', []))} rows")

            elif t == "get_options_analytics":
                cached = CACHE.get("options_analytics")
                if cached is None:
                    await websocket.send(json.dumps({
                        "type": "options_analytics", "buckets": None, "open_count": 0, "loading": True
                    }))
                else:
                    await websocket.send(json.dumps(cached))
                    total_closed = cached.get("buckets", {}).get("all", {}).get("total", 0)
                    print(f"[options_analytics] cache served: {total_closed} closed trades")

            elif t == "get_overview":
                cached = CACHE["overview"]
                if cached is None:
                    await websocket.send(json.dumps({
                        "type": "overview", "timeframes": [], "loading": True
                    }))
                    print("[overview] cache not ready, sent loading flag")
                else:
                    await websocket.send(json.dumps({"type": "overview", "timeframes": cached}))
                    print(f"[overview] cache served: {len(cached)} TFs")

            elif t == "run_screener":
                scr_cs1 = data.get("cs1", {"cci_per":14,"rsi_per":14,"ma_period":2,"koef":8})
                scr_cs2 = data.get("cs2", {"cci_per":14,"rvi_per":10,"ma_period":2,"koef":8})
                print("Running screener for all F&O stocks...")
                loop = asyncio.get_event_loop()
                try:
                    # Use cached sector tags if available; otherwise compute (fast — 16 × 4 TFs)
                    _cached_sec = CACHE.get("sectors")
                    if _cached_sec:
                        sector_tags = {s["name"]: s["tag"] for s in _cached_sec.get("sectors", [])}
                    else:
                        sector_tags = await loop.run_in_executor(
                            None, lambda: get_sector_tags(scr_cs1, scr_cs2)
                        )

                    log_events = []
                    def _log_cb(symbol, tf, sig1, sig2):
                        clean = symbol.replace(":", "_").replace("-", "_")
                        log_events.extend(build_events(sig1, clean, "EQ", tf, "CCI-RSI"))
                        log_events.extend(build_events(sig2, clean, "EQ", tf, "CCI-RVI"))

                    screener_results = await loop.run_in_executor(
                        None, lambda: run_screener(FNO_SYMBOLS, scr_cs1, scr_cs2, log_callback=_log_cb)
                    )
                    log_signals(log_events)

                    # Attach sector tag to each result row
                    from stock_sector_map import STOCK_SECTOR
                    for row in screener_results:
                        raw = row.get("raw_symbol", "")
                        fyers = raw.replace("NSE_", "NSE:").replace("_EQ", "-EQ")
                        sec_name = STOCK_SECTOR.get(fyers)
                        row["sector_name"] = sec_name or ""
                        row["sector_tag"]  = sector_tags.get(sec_name, "neutral") if sec_name else "neutral"

                    await websocket.send(json.dumps({
                        "type": "screener_results",
                        "data": screener_results
                    }))
                    print(f"Screener done. {len(screener_results)} stocks | {len(log_events)} signals logged")
                except Exception as e:
                    print(f"Screener error: {e}")
                    await websocket.send(json.dumps({
                        "type": "screener_results",
                        "data": []
                    }))

    except websockets.exceptions.ConnectionClosed:
        print("Frontend disconnected")
    finally:
        connected_clients.discard(websocket)

async def main():
    init_db()
    print("Starting trading app backend...")
    print(f"WebSocket server on ws://localhost:8765 | workers={_COMPUTE_WORKERS} | tail={TAIL_BARS} bars | refresh={REFRESH_INTERVAL}s")
    async with websockets.serve(handle_client, "localhost", 8765, max_size=20*1024*1024):
        asyncio.create_task(background_refresh())   # starts immediately, non-blocking
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())