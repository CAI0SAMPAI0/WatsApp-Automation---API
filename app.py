"""
app.py — Entrypoint no Railway.
Flask + APScheduler. Expõe rotas HTTP para criar/listar/deletar agendamentos.
"""

import os
import sys
import signal
import logging
from datetime import datetime

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("app")

from flask import Flask, request, jsonify
from flask_cors import CORS

flask_app = Flask(__name__)
CORS(flask_app)

API_KEY = os.environ.get("APP_API_KEY", "minha-chave-secreta")

def _auth(req):
    key = req.headers.get("x-api-key") or req.args.get("apikey")
    return key == API_KEY


@flask_app.route("/health", methods=["GET"])
def health():
    return jsonify({"ok": True, "time": datetime.now().isoformat()})


@flask_app.route("/tasks", methods=["GET"])
def list_tasks():
    if not _auth(request):
        return jsonify({"error": "Unauthorized"}), 401
    from core.db import get_db
    rows  = get_db().listar_todos()
    tasks = [
        {"id": r[0], "task_name": r[1], "target": r[2],
         "mode": r[3], "scheduled_time": r[4], "status": r[5], "created_at": r[6]}
        for r in rows
    ]
    return jsonify({"tasks": tasks})


@flask_app.route("/tasks", methods=["POST"])
def create_task():
    if not _auth(request):
        return jsonify({"error": "Unauthorized"}), 401

    from core.db import get_db
    from core.scheduler import create_task as sched_create

    data = request.json or {}
    for f in ["target", "mode", "scheduled_time"]:
        if f not in data:
            return jsonify({"error": f"Campo obrigatório: {f}"}), 400

    try:
        dt = datetime.fromisoformat(data["scheduled_time"])
    except Exception:
        return jsonify({"error": "scheduled_time inválido. Use ISO: 2026-04-21T15:30:00"}), 400
    
    from zoneinfo import ZoneInfo
    from datetime import datetime

    BRASILIA = ZoneInfo("America/Sao_Paulo")

    # na rota POST /tasks, após o parse:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=BRASILIA)

    if dt < datetime.now(BRASILIA) and not data.get("daily"):
        return jsonify({"error": "Data/hora no passado"}), 400

    task_name = f"ZapTask_{int(datetime.now().timestamp())}"
    db        = get_db()

    task_id = db.adicionar(
        task_name=task_name,
        target=data["target"],
        mode=data["mode"],
        message=data.get("message", ""),
        file_path=data.get("file_path"),
        scheduled_time=dt,
    )

    if not task_id or task_id == -1:
        return jsonify({"error": "Falha ao salvar no banco"}), 500

    ok, msg = sched_create(
        task_id=task_id,
        task_name=task_name,
        json_config={
            "task_id":   task_id,
            "target":    data["target"],
            "mode":      data["mode"],
            "message":   data.get("message", ""),
            "file_path": data.get("file_path"),
        },
        scheduled_time=dt,
        daily=data.get("daily", False),
        include_weekends=data.get("include_weekends", True),
    )

    if not ok:
        db.deletar(task_id)
        return jsonify({"error": msg}), 500

    return jsonify({"ok": True, "task_id": task_id, "scheduled_time": dt.isoformat()}), 201


@flask_app.route("/tasks/<int:task_id>", methods=["DELETE"])
def delete_task(task_id):
    if not _auth(request):
        return jsonify({"error": "Unauthorized"}), 401
    from core.db import get_db
    from core.scheduler import delete_task as sched_delete
    sched_delete(task_id)
    get_db().deletar(task_id)
    return jsonify({"ok": True})


def main():
    from core.db        import get_db
    from core.scheduler import get_scheduler, shutdown

    logger.info("=" * 60)
    logger.info("Study Practices — iniciando no Railway")
    logger.info("=" * 60)

    get_db()
    logger.info("Banco de dados OK.")

    get_scheduler()
    logger.info("Scheduler iniciado.")

    def _shutdown(sig, frame):
        logger.info("Sinal recebido, encerrando...")
        shutdown()
        sys.exit(0)

    signal.signal(signal.SIGTERM, _shutdown)
    signal.signal(signal.SIGINT,  _shutdown)

    port = int(os.environ.get("PORT", 5000))
    logger.info(f"Flask rodando na porta {port}")
    flask_app.run(host="0.0.0.0", port=port)


if __name__ == "__main__":
    main()