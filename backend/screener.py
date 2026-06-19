import os
import pandas as pd
import numpy as np
from config import DATA_FOLDER
from custom_indicator import calculate_eata_pollan_cci_rsi, calculate_eata_pollan_cci_rvi

def get_latest_signals(df, custom_data, n=3):
    signals = []
    for i in range(1, len(custom_data)):
        curr = custom_data[i]
        prev = custom_data[i-1]
        if curr['line1'] is None or curr['line2'] is None:
            continue
        if prev['line1'] is None or prev['line2'] is None:
            continue
        if curr['line1'] >= curr['line2'] and prev['line1'] < prev['line2']:
            signals.append({
                'type': 'buy',
                'time': curr['time'],
                'price': round(float(df.iloc[i]['close']), 2)
            })
        elif curr['line1'] <= curr['line2'] and prev['line1'] > prev['line2']:
            signals.append({
                'type': 'sell',
                'time': curr['time'],
                'price': round(float(df.iloc[i]['close']), 2)
            })
    return signals[-n:] if len(signals) >= n else signals

def load_df(symbol, timeframe):
    clean = symbol.replace(":", "_").replace("-", "_")
    filepath = os.path.join(DATA_FOLDER, timeframe, f"{clean}.parquet")
    if not os.path.exists(filepath):
        return None
    df = pd.read_parquet(filepath)
    df = df.reset_index()
    df = df.set_index('datetime')
    return df

def get_last_signal(signals):
    if not signals:
        return None
    return signals[-1]

def run_screener(symbols, cs1=None, cs2=None, log_callback=None):
    if cs1 is None:
        cs1 = {'cci_per': 14, 'rsi_per': 14, 'ma_period': 2, 'koef': 8}
    if cs2 is None:
        cs2 = {'cci_per': 14, 'rvi_per': 10, 'ma_period': 2, 'koef': 8}

    timeframes = ['15min', '30min', '1hour', '3hour']
    results = []

    for symbol in symbols:
        try:
            tf_data = {}
            tf_signals_rsi = {}
            tf_signals_rvi = {}

            all_ok = True
            for tf in timeframes:
                df = load_df(symbol, tf)
                if df is None or len(df) < 50:
                    all_ok = False
                    break
                tf_data[tf] = df

                custom1, sig1 = calculate_eata_pollan_cci_rsi(
                    df,
                    cci_per=cs1['cci_per'],
                    rsi_per=cs1['rsi_per'],
                    ma_period=cs1['ma_period'],
                    koef=cs1['koef']
                )
                custom2, sig2 = calculate_eata_pollan_cci_rvi(
                    df,
                    cci_per=cs2['cci_per'],
                    rvi_per=cs2['rvi_per'],
                    ma_period=cs2['ma_period'],
                    koef=cs2['koef']
                )

                tf_signals_rsi[tf] = get_latest_signals(df, custom1, n=3)
                tf_signals_rvi[tf] = get_latest_signals(df, custom2, n=3)

                if log_callback:
                    log_callback(symbol, tf, sig1, sig2)

            if not all_ok:
                continue

            last_rsi = {tf: get_last_signal(tf_signals_rsi[tf]) for tf in timeframes}
            last_rvi = {tf: get_last_signal(tf_signals_rvi[tf]) for tf in timeframes}

            # Strategy logic
            strategy_signal = None
            close_signal    = None

            # Strong Buy: 3hour+1hour CCI×RVI buy AND 15min+30min CCI×RSI buy
            if (last_rvi.get('3hour') and last_rvi['3hour']['type'] == 'buy' and
                last_rvi.get('1hour') and last_rvi['1hour']['type'] == 'buy' and
                last_rsi.get('15min') and last_rsi['15min']['type'] == 'buy' and
                last_rsi.get('30min') and last_rsi['30min']['type'] == 'buy'):
                strategy_signal = {
                    'type': 'strong_buy',
                    'time': max(
                        last_rvi['3hour']['time'],
                        last_rvi['1hour']['time'],
                        last_rsi['15min']['time'],
                        last_rsi['30min']['time']
                    ),
                    'price': last_rsi['15min']['price']
                }

            # Sell: all 4 TF CCI×RSI sell
            elif (last_rsi.get('15min') and last_rsi['15min']['type'] == 'sell' and
                  last_rsi.get('30min') and last_rsi['30min']['type'] == 'sell' and
                  last_rsi.get('1hour') and last_rsi['1hour']['type'] == 'sell' and
                  last_rsi.get('3hour') and last_rsi['3hour']['type'] == 'sell'):
                strategy_signal = {
                    'type': 'sell',
                    'time': max(
                        last_rsi['15min']['time'],
                        last_rsi['30min']['time'],
                        last_rsi['1hour']['time'],
                        last_rsi['3hour']['time']
                    ),
                    'price': last_rsi['15min']['price']
                }

            # Close Buy: 15min+30min CCI×RSI sell
            if (strategy_signal and strategy_signal['type'] == 'strong_buy'):
                if (last_rsi.get('15min') and last_rsi['15min']['type'] == 'sell' and
                    last_rsi.get('30min') and last_rsi['30min']['type'] == 'sell'):
                    close_signal = {
                        'type': 'close_buy',
                        'time': max(last_rsi['15min']['time'], last_rsi['30min']['time']),
                        'price': last_rsi['15min']['price']
                    }

            # Close Sell: 15min+30min CCI×RVI buy
            if (strategy_signal and strategy_signal['type'] == 'sell'):
                if (last_rvi.get('15min') and last_rvi['15min']['type'] == 'buy' and
                    last_rvi.get('30min') and last_rvi['30min']['type'] == 'buy'):
                    close_signal = {
                        'type': 'close_sell',
                        'time': max(last_rvi['15min']['time'], last_rvi['30min']['time']),
                        'price': last_rvi['15min']['price']
                    }

            # P&L
            pnl = None
            if strategy_signal and close_signal:
                entry = strategy_signal['price']
                exit_ = close_signal['price']
                if strategy_signal['type'] == 'strong_buy':
                    pnl = round(exit_ - entry, 2)
                else:
                    pnl = round(entry - exit_, 2)

            # Get current price (last close)
            df_15 = tf_data['15min']
            current_price = round(float(df_15.iloc[-1]['close']), 2)

            results.append({
                'symbol':          symbol.replace('NSE:','').replace('-EQ','').replace('NSE_','').replace('_EQ',''),
                'raw_symbol':      symbol.replace('NSE:','NSE_').replace('-EQ','_EQ').replace('-','_'),
                'current_price':   current_price,
                'tf_signals_rsi':  {tf: tf_signals_rsi[tf] for tf in timeframes},
                'tf_signals_rvi':  {tf: tf_signals_rvi[tf] for tf in timeframes},
                'strategy_signal': strategy_signal,
                'close_signal':    close_signal,
                'pnl':             pnl,
            })

        except Exception as e:
            print(f"Screener error for {symbol}: {e}")
            continue

    # Sort: rows with strategy signal on top, then by signal time
    def sort_key(r):
        if r['strategy_signal']:
            return (0, -r['strategy_signal']['time'])
        return (1, 0)

    results.sort(key=sort_key)
    return results
