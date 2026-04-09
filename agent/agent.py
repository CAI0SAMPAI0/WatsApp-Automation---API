"""
agent.py — Agente local do WhatsApp Bot

Roda como serviço do Windows (invisível, inicia com o PC).
A cada ciclo (60s):
  1. Checa versão → se desatualizado, baixa novo exe e reinicia
  2. Busca tasks pendentes na API → executa com Playwright local
  3. Reporta resultado (sucesso ou erro + screenshot) para a API

Credenciais ficam no .env ao lado do exe:
  AGENT_EMAIL=caio@teste.com
  AGENT_SECRET=2HJ2tg44SnVg04pODICXLc8vv2BRQx5s
  API_URL=http://localhost:8000
"""

import os
import sys
import time
import json
import logging
import threading
import traceback
import base64
import tempfile
from pathlib import Path
from datetime import datetime

import requests
from dotenv import load_dotenv

# ── paths ─────────────────────────────────────────────────────────────────────
if getattr(sys, 'frozen', False):
    BASE_DIR = Path(sys.executable).parent
else:
    BASE_DIR = Path(__file__).parent

load_dotenv(BASE_DIR / ".env")

# ── logging ───────────────────────────────────────────────────────────────────
LOG_DIR = BASE_DIR / "logs"
LOG_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_DIR / "agent.log", encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ]
)
logger = logging.getLogger("agent")

# ── configuração ──────────────────────────────────────────────────────────────
AGENT_VERSION = "1.0.0"
API_URL       = os.environ.get("API_URL", "http://localhost:8000").rstrip("/")
AGENT_EMAIL   = os.environ.get("AGENT_EMAIL", "")
AGENT_SECRET  = os.environ.get("AGENT_SECRET", "")
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", 60))   # segundos entre ciclos

# ── estado global ─────────────────────────────────────────────────────────────
_token: str = ""
_token_lock = threading.Lock()
_running = True


# ══════════════════════════════════════════════════════════════════════════════
#  AUTH
# ══════════════════════════════════════════════════════════════════════════════

def get_token() -> str:
    """Obtém ou renova o JWT. Chama a API de login."""
    global _token
    try:
        r = requests.post(
            f"{API_URL}/auth/token",
            json={"email": AGENT_EMAIL, "secret_key": AGENT_SECRET},
            timeout=15,
        )
        r.raise_for_status()
        _token = r.json()["access_token"]
        logger.info("✅ Token JWT obtido/renovado")
        return _token
    except Exception as e:
        logger.error(f"❌ Falha ao obter token: {e}")
        return ""


def auth_headers() -> dict:
    """Retorna headers com o JWT atual."""
    with _token_lock:
        if not _token:
            get_token()
        return {
            "Authorization": f"Bearer {_token}",
            "X-Agent-Version": AGENT_VERSION,
        }


def api_get(path: str) -> dict:
    """GET autenticado. Renova token se receber 401."""
    for attempt in range(2):
        try:
            r = requests.get(f"{API_URL}{path}", headers=auth_headers(), timeout=15)
            if r.status_code == 401 and attempt == 0:
                get_token()
                continue
            r.raise_for_status()
            return r.json()
        except Exception as e:
            logger.error(f"GET {path} falhou: {e}")
            return {}


def api_patch(path: str, data: dict) -> dict:
    """PATCH autenticado."""
    for attempt in range(2):
        try:
            r = requests.patch(f"{API_URL}{path}", json=data, headers=auth_headers(), timeout=15)
            if r.status_code == 401 and attempt == 0:
                get_token()
                continue
            r.raise_for_status()
            return r.json()
        except Exception as e:
            logger.error(f"PATCH {path} falhou: {e}")
            return {}


def api_post(path: str, data: dict) -> dict:
    """POST autenticado."""
    for attempt in range(2):
        try:
            r = requests.post(f"{API_URL}{path}", json=data, headers=auth_headers(), timeout=30)
            if r.status_code == 401 and attempt == 0:
                get_token()
                continue
            r.raise_for_status()
            return r.json()
        except Exception as e:
            logger.error(f"POST {path} falhou: {e}")
            return {}


# ══════════════════════════════════════════════════════════════════════════════
#  AUTO-UPDATE
# ══════════════════════════════════════════════════════════════════════════════

def check_and_update() -> bool:
    """
    Checa se há nova versão disponível.
    Se sim, baixa o novo exe, substitui e reinicia o serviço.
    Retorna True se fez update (processo vai reiniciar).
    """
    try:
        data = api_get("/agent/version")
        if not data or not data.get("needs_update"):
            return False

        new_version  = data["version"]
        download_url = data["download_url"]
        changelog    = data.get("changelog", "")

        logger.info(f"🔄 Nova versão disponível: {new_version}")
        if changelog:
            logger.info(f"   Changelog: {changelog}")

        # baixa o novo exe
        logger.info(f"⬇️  Baixando de {download_url}...")
        r = requests.get(download_url, timeout=120, stream=True)
        r.raise_for_status()

        # salva em arquivo temporário ao lado do exe atual
        new_exe = BASE_DIR / f"agent_new_{new_version}.exe"
        with open(new_exe, "wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)

        logger.info(f"✅ Download concluído: {new_exe}")

        # cria script .bat que substitui o exe e reinicia o serviço
        current_exe = Path(sys.executable) if getattr(sys, 'frozen', False) else BASE_DIR / "agent.exe"
        bat = BASE_DIR / "_update.bat"
        bat.write_text(
            f"""@echo off
timeout /t 3 /nobreak >nul
copy /y "{new_exe}" "{current_exe}"
del "{new_exe}"
sc start WhatsAppAgent
del "%~f0"
""",
            encoding="utf-8"
        )

        # para o serviço e executa o bat (que reinicia depois de copiar)
        logger.info("🔁 Aplicando update e reiniciando...")
        os.system(f'sc stop WhatsAppAgent')
        os.system(f'start /b "" "{bat}"')
        return True

    except Exception as e:
        logger.error(f"❌ Falha no auto-update: {e}")
        return False


# ══════════════════════════════════════════════════════════════════════════════
#  EXECUÇÃO DE TASKS
# ══════════════════════════════════════════════════════════════════════════════

def take_screenshot(page) -> str:
    """Tira screenshot e retorna como base64."""
    try:
        tmp = tempfile.mktemp(suffix=".png")
        page.screenshot(path=tmp)
        with open(tmp, "rb") as f:
            data = base64.b64encode(f.read()).decode()
        os.unlink(tmp)
        return data
    except Exception:
        return ""


def execute_task(task: dict):
    """
    Executa uma task usando o Playwright local.
    Usa o mesmo core/automation.py do projeto original.
    """
    task_id   = task["id"]
    target    = task["target"]
    mode      = task["mode"]
    message   = task.get("message") or ""
    file_path = task.get("file_path") or None

    logger.info(f"▶️  Executando task {task_id} → {target} [{mode}]")

    # marca como running
    api_patch(f"/agent/tasks/{task_id}/status", {"status": "running"})

    # adiciona core/ ao path para importar automation.py
    core_path = BASE_DIR / "core"
    if str(core_path) not in sys.path:
        sys.path.insert(0, str(BASE_DIR))

    profile_dir = str(BASE_DIR / "perfil_bot_whatsapp")
    os.makedirs(profile_dir, exist_ok=True)

    page = None
    try:
        from core.automation import executar_envio
        executar_envio(
            userdir=profile_dir,
            target=target,
            mode=mode,
            message=message,
            file_path=file_path,
            logger=logger,
            modo_execucao="auto",
        )

        # sucesso
        api_patch(f"/agent/tasks/{task_id}/status", {"status": "completed"})
        logger.info(f"✅ Task {task_id} concluída com sucesso")

    except Exception as e:
        tb = traceback.format_exc()
        logger.error(f"❌ Task {task_id} falhou: {e}\n{tb}")

        # tenta screenshot da tela de erro
        screenshot_b64 = ""
        try:
            from core.automation import iniciar_driver
            pw, ctx, pg = iniciar_driver(profile_dir, modo_execucao="auto", logger=logger)
            screenshot_b64 = take_screenshot(pg)
            try:
                for p in ctx.pages: p.close()
            except: pass
            try: pw.stop()
            except: pass
        except Exception:
            pass

        # reporta erro para a API (você recebe email/webhook)
        api_post("/agent/errors", {
            "task_id":      task_id,
            "agent_version": AGENT_VERSION,
            "error_type":   type(e).__name__,
            "traceback":    tb,
            "screenshot":   screenshot_b64,
        })

        # marca como failed
        api_patch(f"/agent/tasks/{task_id}/status", {
            "status": "failed",
            "error_message": str(e),
        })


def poll_tasks():
    """Busca e executa tasks pendentes."""
    try:
        data = api_get("/agent/tasks/pending")
        tasks = data.get("tasks", [])

        if not tasks:
            return

        logger.info(f"📋 {len(tasks)} task(s) pendente(s)")
        for task in tasks:
            execute_task(task)

    except Exception as e:
        logger.error(f"❌ Erro ao buscar tasks: {e}")


# ══════════════════════════════════════════════════════════════════════════════
#  LOOP PRINCIPAL
# ══════════════════════════════════════════════════════════════════════════════

def run_agent():
    """Loop principal do agente."""
    global _running

    logger.info(f"🤖 Agente v{AGENT_VERSION} iniciado")
    logger.info(f"   API: {API_URL}")
    logger.info(f"   Intervalo: {POLL_INTERVAL}s")

    # login inicial
    if not get_token():
        logger.error("❌ Não foi possível autenticar. Verifique AGENT_EMAIL e AGENT_SECRET no .env")
        return

    cycle = 0
    while _running:
        try:
            cycle += 1
            logger.info(f"── Ciclo {cycle} ──────────────────────")

            # a cada 10 ciclos (~10min) checa update
            if cycle % 10 == 1:
                if check_and_update():
                    break  # processo vai reiniciar

            # busca e executa tasks
            poll_tasks()

        except Exception as e:
            logger.error(f"❌ Erro no ciclo: {e}")

        # aguarda próximo ciclo
        for _ in range(POLL_INTERVAL):
            if not _running:
                break
            time.sleep(1)

    logger.info("🛑 Agente encerrado")


def stop_agent():
    """Chamado pelo serviço do Windows ao parar."""
    global _running
    _running = False


# ══════════════════════════════════════════════════════════════════════════════
#  SERVIÇO WINDOWS (pywin32)
# ══════════════════════════════════════════════════════════════════════════════

try:
    import win32serviceutil
    import win32service
    import win32event
    import servicemanager

    class WhatsAppAgentService(win32serviceutil.ServiceFramework):
        _svc_name_        = "WhatsAppAgent"
        _svc_display_name_= "WhatsApp Bot Agent"
        _svc_description_ = "Agente local de automação WhatsApp — executa envios e se mantém atualizado"

        def __init__(self, args):
            win32serviceutil.ServiceFramework.__init__(self, args)
            self.stop_event = win32event.CreateEvent(None, 0, 0, None)
            self._thread = None

        def SvcStop(self):
            self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
            stop_agent()
            win32event.SetEvent(self.stop_event)

        def SvcDoRun(self):
            servicemanager.LogMsg(
                servicemanager.EVENTLOG_INFORMATION_TYPE,
                servicemanager.PYS_SERVICE_STARTED,
                (self._svc_name_, "")
            )
            self._thread = threading.Thread(target=run_agent, daemon=True)
            self._thread.start()
            win32event.WaitForSingleObject(self.stop_event, win32event.INFINITE)

    WIN32_AVAILABLE = True

except ImportError:
    WIN32_AVAILABLE = False


# ══════════════════════════════════════════════════════════════════════════════
#  ENTRY POINT
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    if len(sys.argv) == 1:
        # sem argumentos → roda direto no terminal (modo dev/teste)
        run_agent()
    elif WIN32_AVAILABLE:
        # com argumentos (install, start, stop, remove) → gerencia o serviço
        win32serviceutil.HandleCommandLine(WhatsAppAgentService)
    else:
        print("pywin32 não instalado. Instale com: pip install pywin32")
        run_agent()