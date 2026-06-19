# Sector membership for our F&O universe.
# Source: archives.nseindia.com constituent CSVs + industry extension for mid-caps.
# Nifty Private Bank = Nifty Bank - PSU Bank (mathematically derived).
# Nifty Financial Services = known NBFCs / insurance / HFCs (CSV not on archives server).
# Unassigned: NSE:IDEA-EQ (telecom), NSE:CUTTAACKBANK-EQ (likely bad symbol).

SECTOR_STOCKS = {
    "Nifty PSU Bank": [
        "NSE:BANKBARODA-EQ", "NSE:BANKINDIA-EQ", "NSE:CANBK-EQ",
        "NSE:CENTRALBK-EQ", "NSE:INDIANB-EQ", "NSE:IOB-EQ",
        "NSE:MAHABANK-EQ", "NSE:PNB-EQ", "NSE:SBIN-EQ",
        "NSE:UCOBANK-EQ", "NSE:UNIONBANK-EQ",
    ],
    "Nifty Private Bank": [
        "NSE:AUBANK-EQ", "NSE:AXISBANK-EQ", "NSE:BANDHANBNK-EQ",
        "NSE:DCBBANK-EQ", "NSE:FEDERALBNK-EQ", "NSE:HDFCBANK-EQ",
        "NSE:ICICIBANK-EQ", "NSE:IDFCFIRSTB-EQ", "NSE:KOTAKBANK-EQ",
        "NSE:KTKBANK-EQ", "NSE:RBLBANK-EQ", "NSE:UJJIVANSFB-EQ",
    ],
    "Nifty IT": [
        "NSE:COFORGE-EQ", "NSE:HCLTECH-EQ", "NSE:INFY-EQ",
        "NSE:KPITTECH-EQ", "NSE:LTIM-EQ", "NSE:LTTS-EQ",
        "NSE:MPHASIS-EQ", "NSE:OFSS-EQ", "NSE:PERSISTENT-EQ",
        "NSE:TATACOMM-EQ", "NSE:TCS-EQ", "NSE:TECHM-EQ",
        "NSE:WIPRO-EQ",
    ],
    "Nifty Auto": [
        "NSE:AMARAJABAT-EQ", "NSE:APOLLOTYRE-EQ", "NSE:BAJAJ-AUTO-EQ",
        "NSE:BALKRISIND-EQ", "NSE:BHARATFORG-EQ", "NSE:BOSCHLTD-EQ",
        "NSE:CEATLTD-EQ", "NSE:EICHERMOT-EQ", "NSE:EXIDEIND-EQ",
        "NSE:FORCEMOT-EQ", "NSE:HEROMOTOCO-EQ", "NSE:M&M-EQ",
        "NSE:MARUTI-EQ", "NSE:MINDAIND-EQ", "NSE:MOTHERSON-EQ",
        "NSE:MRF-EQ", "NSE:SUNDRMFAST-EQ", "NSE:TATAMOTORS-EQ",
        "NSE:TVSMOTOR-EQ",
    ],
    "Nifty FMCG": [
        "NSE:BRITANNIA-EQ", "NSE:COLPAL-EQ", "NSE:DABUR-EQ",
        "NSE:GODREJCP-EQ", "NSE:HINDUNILVR-EQ", "NSE:ITC-EQ",
        "NSE:MARICO-EQ", "NSE:MCDOWELL-N-EQ", "NSE:NESTLEIND-EQ",
        "NSE:RADICO-EQ", "NSE:TATACONSUM-EQ", "NSE:UBL-EQ",
    ],
    "Nifty Pharma": [
        "NSE:ALKEM-EQ", "NSE:AUROPHARMA-EQ", "NSE:BIOCON-EQ",
        "NSE:CIPLA-EQ", "NSE:DIVISLAB-EQ", "NSE:DRREDDY-EQ",
        "NSE:GLAND-EQ", "NSE:GLENMARK-EQ", "NSE:IPCALAB-EQ",
        "NSE:LALPATHLAB-EQ", "NSE:LAURUSLABS-EQ", "NSE:LUPIN-EQ",
        "NSE:METROPOLIS-EQ", "NSE:NATCOPHARM-EQ", "NSE:SUNPHARMA-EQ",
        "NSE:TORNTPHARM-EQ",
    ],
    "Nifty Metal": [
        "NSE:ADANIENT-EQ", "NSE:APLAPOLLO-EQ", "NSE:HINDALCO-EQ",
        "NSE:HINDCOPPER-EQ", "NSE:JINDALSAW-EQ", "NSE:JSPL-EQ",
        "NSE:JSWSTEEL-EQ", "NSE:MOIL-EQ", "NSE:NATIONALUM-EQ",
        "NSE:NMDC-EQ", "NSE:RATNAMANI-EQ", "NSE:SAIL-EQ",
        "NSE:TATASTEEL-EQ", "NSE:VEDL-EQ", "NSE:WELCORP-EQ",
    ],
    "Nifty Energy": [
        "NSE:BHEL-EQ", "NSE:BPCL-EQ", "NSE:COALINDIA-EQ",
        "NSE:IOC-EQ", "NSE:NTPC-EQ", "NSE:ONGC-EQ",
        "NSE:POWERGRID-EQ", "NSE:RELIANCE-EQ",
    ],
    "Nifty Financial Services": [
        "NSE:BAJAJFINSV-EQ", "NSE:BAJAJHLDNG-EQ", "NSE:BAJFINANCE-EQ",
        "NSE:CANFINHOME-EQ", "NSE:CHOLAFIN-EQ", "NSE:GICRE-EQ",
        "NSE:HDFCLIFE-EQ", "NSE:HOMEFIRST-EQ", "NSE:HUDCO-EQ",
        "NSE:IBULHSGFIN-EQ", "NSE:ICICIGI-EQ", "NSE:ICICIPRULI-EQ",
        "NSE:IRFC-EQ", "NSE:LICHSGFIN-EQ", "NSE:M&MFIN-EQ",
        "NSE:MANAPPURAM-EQ", "NSE:MUTHOOTFIN-EQ", "NSE:NIACL-EQ",
        "NSE:PAYTM-EQ", "NSE:PEL-EQ", "NSE:PFC-EQ",
        "NSE:PNBHOUSING-EQ", "NSE:POLICYBZR-EQ", "NSE:RECLTD-EQ",
        "NSE:SBILIFE-EQ",
    ],
    "Nifty Infra": [
        "NSE:ADANIPORTS-EQ", "NSE:APOLLOHOSP-EQ", "NSE:ASHOKA-EQ",
        "NSE:BEL-EQ", "NSE:BHARTIARTL-EQ", "NSE:COCHINSHIP-EQ",
        "NSE:ENGINERSIN-EQ", "NSE:FORTIS-EQ", "NSE:GMRINFRA-EQ",
        "NSE:GRASIM-EQ", "NSE:GRSE-EQ", "NSE:HAL-EQ",
        "NSE:HCC-EQ", "NSE:INDIGO-EQ", "NSE:IRB-EQ",
        "NSE:IRCON-EQ", "NSE:KNRCON-EQ", "NSE:MAXHEALTH-EQ",
        "NSE:MAZAGON-EQ", "NSE:NBCC-EQ", "NSE:NCC-EQ",
        "NSE:PNCINFRA-EQ", "NSE:RITES-EQ", "NSE:RVNL-EQ",
        "NSE:SADBHAV-EQ", "NSE:ULTRACEMCO-EQ",
    ],
    "Nifty Consumption": [
        "NSE:ASIANPAINT-EQ", "NSE:BERGEPAINT-EQ", "NSE:DMART-EQ",
        "NSE:EASEMYTRIP-EQ", "NSE:HAVELLS-EQ", "NSE:IRCTC-EQ",
        "NSE:NAUKRI-EQ", "NSE:NYKAA-EQ", "NSE:SPICEJET-EQ",
        "NSE:TITAN-EQ", "NSE:TRENT-EQ", "NSE:VOLTAS-EQ",
        "NSE:ZOMATO-EQ",
    ],
    "Nifty Commodities": [
        "NSE:AARTIIND-EQ", "NSE:ALKYLAMINE-EQ", "NSE:ATUL-EQ",
        "NSE:CHAMBLFERT-EQ", "NSE:COROMANDEL-EQ", "NSE:DEEPAKNTR-EQ",
        "NSE:FINEORG-EQ", "NSE:GNFC-EQ", "NSE:NAVINFLUOR-EQ",
        "NSE:PIDILITIND-EQ", "NSE:PIIND-EQ", "NSE:RALLIS-EQ",
        "NSE:SRF-EQ", "NSE:UPL-EQ",
    ],
    "Nifty MNC": [
        "NSE:ESCORTS-EQ",
        "NSE:LINDEINDIA-EQ",
        "NSE:WHIRLPOOL-EQ",
    ],
}

# Reverse map: stock symbol -> primary sector name
STOCK_SECTOR = {
    stock: sector
    for sector, stocks in SECTOR_STOCKS.items()
    for stock in stocks
}
