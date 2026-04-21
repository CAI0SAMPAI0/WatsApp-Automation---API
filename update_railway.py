import subprocess
import re
import requests
import os

RAILWAY_TOKEN = "seu_token_railway"
SERVICE_ID    = "seu_service_id"  
VARIABLE_NAME = "BAILEYS_URL"

def get_tunnel_url():
    # lê a URL do output do cloudflared
    result = subprocess.run([
        r"C:\Users\Caio\AppData\Local\Microsoft\WinGet\Packages\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\cloudflared.exe",
        "tunnel", "--url", "http://localhost:3000"
    ], capture_output=True, text=True, timeout=15)
    
    match = re.search(r'https://[\w-]+\.trycloudflare\.com', result.stderr)
    return match.group(0) if match else None