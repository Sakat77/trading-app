import asyncio
import websockets
import json
import pandas as pd
import os
from screener import run_screener
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
from stock_sector_map import SECTOR_STOCKS

connected_clients = set()


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

            df["_d"] = pd.to_datetime(df["timestamp"], unit="s").dt.date
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
        df["_d"] = pd.to_datetime(df["timestamp"], unit="s").dt.date
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
        return None, None, None, None, None, None, None, None

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

    return candles, indicators, custom1, signals1, custom2, signals2, xma, sd_zones

async def handle_client(websocket):
    connected_clients.add(websocket)
    print(f"Frontend connected. Total: {len(connected_clients)}")

    symbol    = "NSE_RELIANCE_EQ"
    timeframe = "15min"
    settings  = {"cci_period": 20, "rsi_period": 14, "rvi_period": 10}
    cs1       = {"cci_per": 14, "rsi_per": 14, "ma_period": 2, "koef": 8}
    cs2       = {"cci_per": 14, "rvi_per": 10, "ma_period": 2, "koef": 8}

    async def send_data():
        candles, indicators, c1, s1, c2, s2, xma, sd_zones = load_symbol_data(
            symbol, timeframe, settings, cs1, cs2
        )
        if candles:
            await websocket.send(json.dumps({
                "type":       "history",
                "symbol":     symbol,
                "candles":    candles,
                "indicators": indicators,
                "custom1":    c1,
                "signals1":   s1,
                "custom2":    c2,
                "signals2":   s2,
                "xma":        xma,
                "sd_zones":   sd_zones,
            }))
            print(f"Sent {len(candles)} candles | signals1={len(s1)} signals2={len(s2)} | zones={len(sd_zones)}")

    try:
        await send_data()

        async for message in websocket:
            data = json.loads(message)
            t = data.get("type")

            if t == "change_symbol":
                symbol    = data.get("symbol",    symbol)
                timeframe = data.get("timeframe", timeframe)
                await send_data()

            elif t == "change_settings":
                settings = data.get("settings",  settings)
                cs1      = data.get("cs1",        cs1)
                cs2      = data.get("cs2",        cs2)
                await send_data()

            elif t == "get_triple_chart":
                req_sym = data.get("symbol", "NSE:RELIANCE-EQ")
                req_tf  = data.get("timeframe", "15min")

                clean = req_sym.replace(":", "_").replace("-", "_")
                eq = load_symbol_data(clean, req_tf, settings, cs1, cs2)

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
                sector_data = load_sector_summary(req_tf)
                await websocket.send(json.dumps({
                    "type":      "sector_data",
                    "timeframe": req_tf,
                    "sectors":   sector_data,
                }))
                print(f"Sector data sent: {len(sector_data)} sectors @ {req_tf}")

            elif t == "run_screener":
                scr_cs1 = data.get("cs1", {"cci_per":14,"rsi_per":14,"ma_period":2,"koef":8})
                scr_cs2 = data.get("cs2", {"cci_per":14,"rvi_per":10,"ma_period":2,"koef":8})
                print("Running screener for all F&O stocks...")
                try:
                    screener_results = run_screener(FNO_SYMBOLS, scr_cs1, scr_cs2)
                    await websocket.send(json.dumps({
                        "type": "screener_results",
                        "data": screener_results
                    }))
                    print(f"Screener done. {len(screener_results)} stocks processed")
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
    print("Starting trading app backend...")
    print("WebSocket server running on ws://localhost:8765")
    async with websockets.serve(handle_client, "localhost", 8765, max_size=20*1024*1024):
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())