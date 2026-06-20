import os
import time
import pandas as pd
from datetime import datetime, timedelta
from tz import epoch_series_to_ist
from fyers_apiv3 import fyersModel
from config import CLIENT_ID, DATA_FOLDER, TIMEFRAMES, HISTORY_DAYS
from sector_map import SECTOR_INDICES
from auth import load_access_token

SECTORS_FOLDER = os.path.join(DATA_FOLDER, "sectors")


def get_fyers_client():
    token = load_access_token()
    if not token:
        print("No access token found. Run auth.py first.")
        return None
    fyers = fyersModel.FyersModel(
        client_id=CLIENT_ID,
        token=token,
        log_path=""
    )
    return fyers


def fetch_and_save(fyers, symbol, timeframe_name, timeframe_value):
    try:
        end_date = datetime.now()
        start_date = end_date - timedelta(days=HISTORY_DAYS)

        data = {
            "symbol": symbol,
            "resolution": timeframe_value,
            "date_format": "1",
            "range_from": start_date.strftime("%Y-%m-%d"),
            "range_to": end_date.strftime("%Y-%m-%d"),
            "cont_flag": "1"
        }

        response = fyers.history(data=data)

        if response.get("s") != "ok":
            print(f"  Error for {symbol}: {response.get('message', 'unknown error')}")
            return False

        candles = response.get("candles", [])
        if not candles:
            print(f"  No data for {symbol}")
            return False

        df = pd.DataFrame(candles, columns=["timestamp", "open", "high", "low", "close", "volume"])
        df["datetime"] = epoch_series_to_ist(df["timestamp"])
        df = df.set_index("datetime")

        clean_symbol = symbol.replace(":", "_").replace("-", "_")
        folder = os.path.join(SECTORS_FOLDER, timeframe_name)
        os.makedirs(folder, exist_ok=True)

        filepath = os.path.join(folder, f"{clean_symbol}.parquet")
        df.to_parquet(filepath)
        return True

    except Exception as e:
        print(f"  Exception for {symbol}: {e}")
        return False


def fetch_all_sectors():
    print("Starting data fetch for NSE Sector Indices...")
    print(f"Data will be saved to: {SECTORS_FOLDER}")
    print(f"Indices: {len(SECTOR_INDICES)}")
    print(f"Timeframes: {list(TIMEFRAMES.keys())}")
    print(f"History: {HISTORY_DAYS} days")
    print("-" * 50)

    fyers = get_fyers_client()
    if not fyers:
        return

    total = len(SECTOR_INDICES) * len(TIMEFRAMES)
    done = 0
    success = 0
    failed = 0
    skipped_indices = []

    for name, symbol in SECTOR_INDICES.items():
        print(f"\nFetching {name} ({symbol})...")
        index_success = 0
        for tf_name, tf_value in TIMEFRAMES.items():
            result = fetch_and_save(fyers, symbol, tf_name, tf_value)
            done += 1
            if result:
                success += 1
                index_success += 1
                print(f"  {tf_name} saved")
            else:
                failed += 1
            time.sleep(0.3)

        if index_success == 0:
            skipped_indices.append(name)
            print(f"  SKIPPED — no data returned for any timeframe")

        percent = round((done / total) * 100)
        print(f"Progress: {percent}% ({done}/{total})")

    print("\n" + "=" * 50)
    print(f"Download complete!")
    print(f"Successful fetches: {success}")
    print(f"Failed fetches:     {failed}")
    if skipped_indices:
        print(f"Skipped indices:    {', '.join(skipped_indices)}")
    print(f"Data saved at: {SECTORS_FOLDER}")


if __name__ == "__main__":
    fetch_all_sectors()
