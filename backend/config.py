CLIENT_ID = "OTTRFQE4HS-100"
SECRET_KEY = "KN71DRPUI5"
REDIRECT_URI = "http://127.0.0.1:8080/"
GRANT_TYPE = "authorization_code"
RESPONSE_TYPE = "code"

# Timeframes to fetch
TIMEFRAMES = {
    "15min": "15",
    "30min": "30",
    "1hour": "60",
    "3hour": "180"
}

# How many days of history
HISTORY_DAYS = 60

# Where to save data on your PC
import os
DATA_FOLDER = os.path.join(os.path.expanduser("~"), "Desktop", "trading-data")