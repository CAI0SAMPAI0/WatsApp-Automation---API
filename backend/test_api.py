import requests

BASE = "http://127.0.0.1:8000"
ADMIN_KEY = "admin123"
EMAIL = "caio@teste.com"
SECRET = "2HJ2tg44SnVg04pODICXLc8vv2BRQx5s"  # o que acabou de receber

# 2. login → obter token
r = requests.post(f"{BASE}/auth/token", json={"email": EMAIL, "secret_key": SECRET})
print("TOKEN:", r.status_code, r.json())
token = r.json()["access_token"]

# headers autenticados
auth = {"Authorization": f"Bearer {token}"}

# 3. stats do painel
r = requests.get(f"{BASE}/panel/stats", headers=auth)
print("STATS:", r.status_code, r.json())

# 4. healthcheck
r = requests.get(f"{BASE}/health")
print("HEALTH:", r.status_code, r.json())