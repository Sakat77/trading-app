from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import pandas as pd

IST = ZoneInfo("Asia/Kolkata")


def epoch_to_ist(epoch_s) -> datetime:
    """Fyers candle epoch (UTC seconds) -> tz-aware IST datetime."""
    return datetime.fromtimestamp(int(epoch_s), tz=timezone.utc).astimezone(IST)


def epoch_series_to_ist(s: pd.Series) -> pd.Series:
    """Vectorised: UTC epoch seconds -> tz-aware IST DatetimeIndex."""
    return pd.to_datetime(s, unit="s", utc=True).dt.tz_convert("Asia/Kolkata")


def now_ist() -> datetime:
    """Current wall-clock time in IST, tz-aware."""
    return datetime.now(IST)


def to_ist(dt: datetime) -> datetime:
    """Coerce any datetime to IST. Naive datetimes are assumed to be IST wall-clock."""
    return (dt.replace(tzinfo=IST) if dt.tzinfo is None else dt).astimezone(IST)


def parse_bar_time(s: str) -> datetime:
    """Parse a stored bar_time string to an IST-aware datetime.
    Handles both new '+05:30' format and legacy naive-UTC strings."""
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)   # legacy: naive was stored as UTC
    return dt.astimezone(IST)


def to_ist_iso(dt) -> str:
    """Return ISO 8601 WITH +05:30, e.g. '2026-06-26T14:15:00+05:30'."""
    if isinstance(dt, str):
        return parse_bar_time(dt).isoformat()
    return to_ist(dt).isoformat()


def fmt_ist(dt) -> str:
    """Display string for tables: '26 Jun, 14:15' (always IST)."""
    if isinstance(dt, str):
        return parse_bar_time(dt).strftime("%d %b, %H:%M")
    return to_ist(dt).strftime("%d %b, %H:%M")
