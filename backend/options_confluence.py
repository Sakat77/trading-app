import sqlite3
import os
from datetime import datetime
from collections import defaultdict
from options_trades import _opt_key
from tz import fmt_ist, parse_bar_time
from config import DATA_FOLDER

DB_PATH = os.path.join(DATA_FOLDER, 'signals.db')
CONFLUENCE_WINDOW_MIN = 60


def build_options_confluence_trades(live_ltp: dict) -> list:
    if not os.path.exists(DB_PATH):
        return []

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute("""
            SELECT symbol, market_type, strike, timeframe, indicator, side, bar_time, price
            FROM signals
            WHERE market_type IN ('CE', 'PE')
              AND indicator IN ('CCI-RVI', 'CCI-RSI')
              AND timeframe IN ('15min', '30min')
            ORDER BY symbol, market_type, strike, bar_time
        """).fetchall()
    finally:
        conn.close()

    groups = defaultdict(list)
    for r in rows:
        key = (r['symbol'], r['market_type'], r['strike'])
        groups[key].append(dict(r))

    trades = []
    for (sym, mkt, strike), events in groups.items():
        cur_price = live_ltp.get(_opt_key(sym, mkt, strike))
        expiry    = live_ltp.get(f"{sym}_EXPIRY")

        pending_rvi   = {'15min': None, '30min': None}
        pending_rsi   = {'15min': None, '30min': None}
        position_open = False
        entry_time = entry_price = None

        for ev in events:
            tf       = ev['timeframe']
            other_tf = '30min' if tf == '15min' else '15min'
            bt       = ev['bar_time']
            px       = ev['price']

            if not position_open:
                if ev['indicator'] == 'CCI-RVI' and ev['side'] == 'buy':
                    pending_rvi[tf] = ev
                    other = pending_rvi[other_tf]
                    if other is not None:
                        t1 = parse_bar_time(bt)
                        t2 = parse_bar_time(other['bar_time'])
                        if abs((t1 - t2).total_seconds()) / 60 <= CONFLUENCE_WINDOW_MIN:
                            if bt >= other['bar_time']:
                                entry_time, entry_price = bt, px
                            else:
                                entry_time, entry_price = other['bar_time'], other['price']
                            position_open = True
                            pending_rvi = {'15min': None, '30min': None}
                            pending_rsi = {'15min': None, '30min': None}
            else:
                if ev['indicator'] == 'CCI-RSI' and ev['side'] == 'sell' and bt > entry_time:
                    pending_rsi[tf] = ev
                    other = pending_rsi[other_tf]
                    if other is not None and other['bar_time'] > entry_time:
                        t1 = parse_bar_time(bt)
                        t2 = parse_bar_time(other['bar_time'])
                        if abs((t1 - t2).total_seconds()) / 60 <= CONFLUENCE_WINDOW_MIN:
                            if bt >= other['bar_time']:
                                exit_time, exit_price = bt, px
                            else:
                                exit_time, exit_price = other['bar_time'], other['price']
                            pl     = round(exit_price - entry_price, 2)
                            pl_pct = round(pl / entry_price * 100, 2) if entry_price else None
                            trades.append({
                                "symbol":     sym.replace("NSE_", "").replace("_EQ", ""),
                                "spot":       live_ltp.get(sym),
                                "timeframe":  "15m+30m",
                                "leg":        mkt,
                                "strike":     strike,
                                "expiry":     expiry,
                                "buy_price":  round(entry_price, 2),
                                "buy_time":   fmt_ist(entry_time),
                                "buy_iso":    entry_time,
                                "cur_price":  cur_price,
                                "sell_price": round(exit_price, 2),
                                "sell_time":  fmt_ist(exit_time),
                                "sell_iso":   exit_time,
                                "pl":         pl,
                                "pl_pct":     pl_pct,
                                "status":     "closed",
                            })
                            position_open = False
                            entry_time = entry_price = None
                            pending_rvi = {'15min': None, '30min': None}
                            pending_rsi = {'15min': None, '30min': None}

        if position_open:
            pl = pl_pct = None
            if cur_price is not None and entry_price:
                pl     = round(cur_price - entry_price, 2)
                pl_pct = round(pl / entry_price * 100, 2)
            trades.append({
                "symbol":     sym.replace("NSE_", "").replace("_EQ", ""),
                "spot":       live_ltp.get(sym),
                "timeframe":  "15m+30m",
                "leg":        mkt,
                "strike":     strike,
                "expiry":     expiry,
                "buy_price":  round(entry_price, 2),
                "buy_time":   fmt_ist(entry_time),
                "buy_iso":    entry_time,
                "cur_price":  cur_price,
                "sell_price": None,
                "sell_time":  "",
                "sell_iso":   None,
                "pl":         pl,
                "pl_pct":     pl_pct,
                "status":     "open",
            })

    open_trades   = sorted([t for t in trades if t["status"] == "open"],
                           key=lambda t: t["buy_iso"] or "", reverse=True)
    closed_trades = sorted([t for t in trades if t["status"] == "closed"],
                           key=lambda t: t["buy_iso"] or "", reverse=True)
    return open_trades + closed_trades
