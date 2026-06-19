from datetime import datetime, date, timedelta

STRIKE_OVERRIDE = {
    'NIFTY50':    50,
    'BANKNIFTY':  100,
    'FINNIFTY':   50,
    'MIDCPNIFTY': 25,
}

def get_strike_interval(symbol_clean, price):
    if symbol_clean in STRIKE_OVERRIDE:
        return STRIKE_OVERRIDE[symbol_clean]
    if price >= 10000: return 200
    if price >= 5000:  return 100
    if price >= 2000:  return 50
    if price >= 1000:  return 20
    if price >= 500:   return 10
    if price >= 100:   return 5
    if price >= 50:    return 2
    return 1

def get_atm_strike(price, interval):
    return int(round(price / interval) * interval)

def get_last_tuesday(year, month):
    if month == 12:
        last_day = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        last_day = date(year, month + 1, 1) - timedelta(days=1)
    days_back = (last_day.weekday() - 1) % 7
    return last_day - timedelta(days=days_back)

def get_nearest_expiry(symbol_clean):
    today = date.today()
    if symbol_clean == 'NIFTY50':
        days_to_tuesday = (1 - today.weekday()) % 7
        if days_to_tuesday == 0:
            days_to_tuesday = 7
        return today + timedelta(days=days_to_tuesday)
    expiry = get_last_tuesday(today.year, today.month)
    if expiry <= today:
        if today.month == 12:
            expiry = get_last_tuesday(today.year + 1, 1)
        else:
            expiry = get_last_tuesday(today.year, today.month + 1)
    return expiry

def format_expiry(expiry_date):
    return expiry_date.strftime('%y%b').upper()

def build_option_symbol(exchange, underlying, expiry_date, strike, option_type):
    expiry_str = format_expiry(expiry_date)
    return f"{exchange}:{underlying}{expiry_str}{int(strike)}{option_type}"

def get_atm_symbols(fyers_symbol, last_price):
    parts    = fyers_symbol.split(':')
    exchange = parts[0]
    raw      = parts[1]

    if '-EQ' in raw:
        underlying = raw.replace('-EQ', '')
    elif '-INDEX' in raw:
        underlying = raw.replace('-INDEX', '')
    else:
        underlying = raw

    symbol_clean = underlying
    interval     = get_strike_interval(symbol_clean, last_price)
    atm_strike   = get_atm_strike(last_price, interval)
    ce_strike    = atm_strike
    pe_strike    = atm_strike + interval
    expiry       = get_nearest_expiry(symbol_clean)

    ce_symbol = build_option_symbol(exchange, underlying, expiry, ce_strike, 'CE')
    pe_symbol = build_option_symbol(exchange, underlying, expiry, pe_strike, 'PE')

    return {
        'underlying':   fyers_symbol,
        'symbol_clean': symbol_clean,
        'last_price':   last_price,
        'interval':     interval,
        'atm_strike':   atm_strike,
        'ce_strike':    ce_strike,
        'pe_strike':    pe_strike,
        'expiry':       expiry.strftime('%Y-%m-%d'),
        'expiry_str':   format_expiry(expiry),
        'ce_symbol':    ce_symbol,
        'pe_symbol':    pe_symbol,
    }

if __name__ == '__main__':
    tests = [
        ('NSE:RELIANCE-EQ',      1323.5),
        ('NSE:HDFCBANK-EQ',      1756.2),
        ('NSE:TCS-EQ',           3421.5),
        ('NSE:NIFTY50-INDEX',   24500.0),
        ('NSE:BANKNIFTY-INDEX', 57963.8),
        ('NSE:SBIN-EQ',           812.3),
        ('NSE:BAJFINANCE-EQ',     958.85),
        ('NSE:MARUTI-EQ',       12500.0),
        ('NSE:MRF-EQ',          85000.0),
    ]
    print(f"Today: {date.today()}\n")
    for sym, price in tests:
        r = get_atm_symbols(sym, price)
        print(f"{sym} @ {price}")
        print(f"  CE Strike: {r['ce_strike']}  PE Strike: {r['pe_strike']}  Interval: {r['interval']}")
        print(f"  Expiry   : {r['expiry']}")
        print(f"  CE       : {r['ce_symbol']}")
        print(f"  PE       : {r['pe_symbol']}")
        print()