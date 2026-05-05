import os
import logging
from flask import Flask, request, jsonify, make_response, send_from_directory
from flask_cors import CORS
from supabase import create_client, Client
from dotenv import load_dotenv
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

load_dotenv()
logging.basicConfig(level=logging.INFO)

app = Flask(__name__, static_folder='ui/web')
CORS(app)

# Inicializa Supabase
supabase: Client = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY"))
APP_API_KEY = os.getenv("APP_API_KEY", "minha-chave-secreta")

BRAZIL_TZ = ZoneInfo("America/Sao_Paulo")


def _parse_or_now_brasilia(raw_dt: str | None) -> datetime:
    """Converte string ISO para datetime em America/Sao_Paulo."""
    if not raw_dt:
        return datetime.now(BRAZIL_TZ)

    dt = datetime.fromisoformat(raw_dt.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        return dt.replace(tzinfo=BRAZIL_TZ)
    return dt.astimezone(BRAZIL_TZ)


def _normalize_scheduled_time(raw_dt: str | None) -> str:
    """Garante janela mínima de +5s para evitar agendamento no passado."""
    now_sp = datetime.now(BRAZIL_TZ)
    min_dt = now_sp + timedelta(seconds=5)
    scheduled_at = _parse_or_now_brasilia(raw_dt)

    if scheduled_at < min_dt:
        scheduled_at = min_dt

    return scheduled_at.isoformat()

# ── ROTAS DE SISTEMA ────────────────────────────────────────────────────────

@app.route("/health")
def health(): return jsonify({"status": "online"})

@app.route("/api/config")
def get_config():
    return jsonify({
        "apiUrl": request.host_url.rstrip('/'),
        "apiKey": APP_API_KEY,
        "baileysUrl": os.getenv("BAILEYS_URL")
    })

# ── AUTH ROUTES (TABELA CUSTOMIZADA 'users') ────────────────────────────────

@app.route("/auth/signup", methods=["POST", "OPTIONS"])
def auth_signup():
    if request.method == "OPTIONS": return make_response("", 200)
    try:
        data = request.json
        res = supabase.table("users").insert({"email": data["email"].lower(), "password": data["password"]}).execute()
        return jsonify({"ok": True, "user_id": res.data[0]["id"]})
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/auth/login", methods=["POST", "OPTIONS"])
def auth_login():
    if request.method == "OPTIONS": return make_response("", 200)
    try:
        data = request.json
        res = supabase.table("users").select("id").eq("email", data["email"].lower()).eq("password", data["password"]).execute()
        if not res.data: return jsonify({"error": "Credenciais inválidas"}), 401
        return jsonify({"ok": True, "user_id": res.data[0]["id"]})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ── TASK ROUTES ──────────────────────────────────────────────────────────────

@app.route("/tasks", methods=["GET", "POST", "OPTIONS"])
def tasks():
    if request.method == "OPTIONS": return make_response("", 200)
    
    user_id = request.headers.get("x-user-id")
    if request.headers.get("x-api-key") != APP_API_KEY: return jsonify({"error": "Chave inválida"}), 401
    if not user_id: return jsonify({"error": "Login necessário"}), 401

    try:
        if request.method == "GET":
            # Filtra tarefas pelo ID do usuário
            res = supabase.table("tasks").select("*").eq("user_id", user_id).execute()
            return jsonify({"ok": True, "tasks": res.data})
        
        if request.method == "POST":
            data = request.json
            if not data or "target" not in data or "mode" not in data:
                return jsonify({"error": "Campos 'target' e 'mode' são obrigatórios"}), 400

            # Remove a restrição de FK no insert
            res = supabase.table("tasks").insert({
                "user_id": user_id,
                "task_name": f"Task_{int(datetime.now().timestamp())}",
                "target": data["target"],
                "mode": data["mode"],
                "message": data.get("message", ""),
                "scheduled_time": _normalize_scheduled_time(data.get("scheduled_time")),
                "status": "pending"
            }).execute()
            return jsonify({"ok": True}), 201
    except Exception as e:
        return jsonify({"error": f"Erro interno: {str(e)}"}), 500

@app.route("/", defaults={'path': ''})
@app.route("/<path:path>")
def serve(path):
    if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, 'index.html')

if __name__ == "__main__":
    app.run(port=5000, debug=True)
