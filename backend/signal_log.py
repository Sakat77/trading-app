import sqlite3
import os
from datetime import datetime
from config import DATA_FOLDER

DB_PATH = os.path.join(DATA_FOLDER, 'signals.db')


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS signals (
            symbol      TEXT NOT NULL,
            market_type TEXT NOT NULL,
            strike      REAL,
            timeframe   TEXT NOT NULL,
            indicator   TEXT NOT NULL,
            side        TEXT NOT NULL,
            bar_time    TEXT NOT NULL,
            price       REAL NOT NULL,
            logged_at   TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS ux_signal
            ON signals(symbol, timeframe, indicator, side, bar_time)
    """)
    conn.commit()
    conn.close()
    print(f"Signal DB ready: {DB_PATH}")


def log_signals(events):
    if not events:
        return
    conn = sqlite3.connect(DB_PATH)
    conn.executemany("""
        INSERT OR IGNORE INTO signals
            (symbol, market_type, strike, timeframe, indicator, side, bar_time, price, logged_at)
        VALUES
            (:symbol, :market_type, :strike, :timeframe, :indicator, :side, :bar_time, :price, :logged_at)
    """, events)
    conn.commit()
    conn.close()


def build_events(signals, symbol, market_type, timeframe, indicator, strike=None):
    """Convert a list of {type, time, price} signal dicts to loggable events."""
    now = datetime.utcnow().isoformat()
    events = []
    for sig in (signals or []):
        try:
            bar_time = datetime.utcfromtimestamp(sig['time']).isoformat()
        except Exception:
            bar_time = str(sig['time'])
        events.append({
            'symbol': symbol,
            'market_type': market_type,
            'strike': strike,
            'timeframe': timeframe,
            'indicator': indicator,
            'side': sig['type'],
            'bar_time': bar_time,
            'price': sig['price'],
            'logged_at': now,
        })
    return events
