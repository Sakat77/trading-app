import sqlite3
import os
from collections import defaultdict
from config import DATA_FOLDER
from tz import fmt_ist

DB_PATH   = os.path.join(DATA_FOLDER, 'signals.db')
TF_LABELS = {"15min": "15m", "30min": "30m", "1hour": "1h", "3hour": "3h"}


def _opt_key(sym, mkt, strike):
    """Key for option LTP lookup in live_ltp dict."""
    s = int(strike) if strike is not None else ""
    return f"{sym}_{mkt}_{s}"



def build_options_trades(live_ltp: dict) -> list:
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
            ORDER BY symbol, market_type, strike, timeframe, bar_time
        """).fetchall()
    finally:
        conn.close()

    groups = defaultdict(list)
    for r in rows:
        key = (r['symbol'], r['market_type'], r['strike'], r['timeframe'])
        groups[key].append(dict(r))

    trades = []
    for (sym, mkt, strike, tf), events in groups.items():
        cur_price = live_ltp.get(_opt_key(sym, mkt, strike))
        expiry    = live_ltp.get(f"{sym}_EXPIRY")

        position_open = False
        entry_time = entry_price = None

        for ev in events:
            ind  = ev['indicator']
            side = ev['side']
            bt   = ev['bar_time']
            px   = ev['price']

            if not position_open:
                # ENTRY: CCI-RVI buy opens a trade
                if ind == 'CCI-RVI' and side == 'buy':
                    position_open = True
                    entry_time  = bt
                    entry_price = px
            else:
                # EXIT: CCI-RSI sell closes the open trade
                if ind == 'CCI-RSI' and side == 'sell' and bt > entry_time:
                    pl     = round(px - entry_price, 2)
                    pl_pct = round(pl / entry_price * 100, 2) if entry_price else None
                    trades.append({
                        "symbol":     sym.replace("NSE_", "").replace("_EQ", ""),
                        "spot":       live_ltp.get(sym),
                        "timeframe":  TF_LABELS.get(tf, tf),
                        "leg":        mkt,
                        "strike":     strike,
                        "expiry":     expiry,
                        "buy_price":  round(entry_price, 2),
                        "buy_time":   fmt_ist(entry_time),
                        "buy_iso":    entry_time,
                        "cur_price":  cur_price,
                        "sell_price": round(px, 2),
                        "sell_time":  fmt_ist(bt),
                        "sell_iso":   bt,
                        "pl":         pl,
                        "pl_pct":     pl_pct,
                        "status":     "closed",
                    })
                    position_open = False
                    entry_time = entry_price = None
                # While LONG: ignore further CCI-RVI buys

        # Still open at end of group
        if position_open:
            pl = pl_pct = None
            if cur_price is not None and entry_price:
                pl     = round(cur_price - entry_price, 2)
                pl_pct = round(pl / entry_price * 100, 2)
            trades.append({
                "symbol":     sym.replace("NSE_", "").replace("_EQ", ""),
                "spot":       live_ltp.get(sym),
                "timeframe":  TF_LABELS.get(tf, tf),
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
