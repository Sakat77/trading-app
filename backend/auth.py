import webbrowser
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler
import threading
from fyers_apiv3 import fyersModel
from config import CLIENT_ID, SECRET_KEY, REDIRECT_URI, RESPONSE_TYPE, GRANT_TYPE

auth_code_received = None

class CallbackHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        global auth_code_received
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        if "auth_code" in params:
            auth_code_received = params["auth_code"][0]
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"Login successful! You can close this tab.")
            print(f"\nAuth code received successfully")
        else:
            self.send_response(400)
            self.end_headers()

    def log_message(self, format, *args):
        pass

def get_access_token():
    global auth_code_received
    auth_code_received = None

    session = fyersModel.SessionModel(
        client_id=CLIENT_ID,
        secret_key=SECRET_KEY,
        redirect_uri=REDIRECT_URI,
        response_type=RESPONSE_TYPE,
        grant_type=GRANT_TYPE
    )

    auth_url = session.generate_authcode()
    print(f"\nOpening Fyers login in your browser...")
    print(f"Please log in with your Fyers account\n")
    webbrowser.open(auth_url)

    server = HTTPServer(("127.0.0.1", 8080), CallbackHandler)
    server.timeout = 120

    print("Waiting for you to log in...")
    while auth_code_received is None:
        server.handle_request()

    session.set_token(auth_code_received)
    response = session.generate_token()

    if "access_token" in response:
        access_token = response["access_token"]
        with open("access_token.txt", "w") as f:
            f.write(access_token)
        print("Access token saved successfully")
        return access_token
    else:
        print(f"Error getting token: {response}")
        return None

def load_access_token():
    try:
        with open("access_token.txt", "r") as f:
            return f.read().strip()
    except FileNotFoundError:
        return None

if __name__ == "__main__":
    token = get_access_token()
    if token:
        print("Login successful! Ready to fetch data.")