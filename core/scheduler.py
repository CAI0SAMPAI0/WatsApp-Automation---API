"""
core/scheduler.py
Agendamento de tarefas usando APScheduler (funciona no Railway/Linux e Windows).
Substitui completamente o windows_scheduler.py (schtasks).
"""

import json
import logging
import subprocess
import sys
from datetime import datetime
from pathlib import Path

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron        import CronTrigger
from apscheduler.triggers.date        import DateTrigger
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore

from core.paths import get_user_data_dir, get_app_base_dir

logger = logging.getLogger("scheduler")

BASE_DIR      = Path(get_app_base_dir())
USER_DATA_DIR = Path(get_user_data_dir())
DB_URL        = f"sqlite:///{USER_DATA_DIR / 'apscheduler.db'}"

# ── instância global do scheduler ────────────────────────────────────────
_scheduler: BackgroundScheduler | None = None


def get_scheduler() -> BackgroundScheduler:
    global _scheduler
    if _scheduler is None:
        jobstores   = {"default": SQLAlchemyJobStore(url=DB_URL)}
        _scheduler  = BackgroundScheduler(jobstores=jobstores, timezone="America/Sao_Paulo")
        _scheduler.start()
        logger.info("APScheduler iniciado.")
    return _scheduler


# ── helper: executa o executor.py em subprocess ───────────────────────────
def _run_executor(json_path: str):
    """Chamado pelo APScheduler no horário agendado."""
    executor_path = BASE_DIR / "executor.py"
    cmd = [sys.executable, str(executor_path), json_path]

    logger.info(f"[EXECUTOR] Disparando: {cmd}")

    flags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(BASE_DIR),
            creationflags=flags,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=600,
        )
        logger.info(f"[EXECUTOR] stdout: {proc.stdout[-500:] if proc.stdout else 'vazio'}")
        logger.info(f"[EXECUTOR] stderr: {proc.stderr[-500:] if proc.stderr else 'vazio'}")
        if proc.returncode != 0:
            logger.error(f"[EXECUTOR] Falhou (code {proc.returncode})")
        else:
            logger.info(f"[EXECUTOR] Sucesso: {json_path}")
    except Exception as e:
        logger.error(f"[EXECUTOR] Exceção: {e}")


# ── API pública ───────────────────────────────────────────────────────────
def create_task(
    task_id: int | str,
    task_name: str,
    json_config: dict,
    scheduled_time: datetime,
    daily: bool = False,
    include_weekends: bool = True,
) -> tuple[bool, str]:
    """
    Cria (ou substitui) uma tarefa agendada.

    Args:
        task_id:          ID do agendamento no banco
        task_name:        Nome único da tarefa
        json_config:      Dict com os dados do envio
        scheduled_time:   datetime do disparo
        daily:            Se True, repete todos os dias
        include_weekends: Se daily=True, inclui sáb/dom

    Returns:
        (True, "ok") ou (False, "mensagem de erro")
    """
    try:
        scheduled_tasks_dir = BASE_DIR / "scheduled_tasks"
        scheduled_tasks_dir.mkdir(exist_ok=True)

        json_path = scheduled_tasks_dir / f"task_{task_id}.json"
        if "task_id" not in json_config:
            json_config["task_id"] = task_id
        json_path.write_text(
            json.dumps(json_config, ensure_ascii=False, indent=2), encoding="utf-8"
        )

        sched = get_scheduler()
        job_id = f"task_{task_id}"

        # remove job anterior se existir
        if sched.get_job(job_id):
            sched.remove_job(job_id)

        if daily:
            days_of_week = "mon-sun" if include_weekends else "mon-fri"
            trigger = CronTrigger(
                day_of_week=days_of_week,
                hour=scheduled_time.hour,
                minute=scheduled_time.minute,
                timezone="America/Sao_Paulo",
            )
        else:
            trigger = DateTrigger(run_date=scheduled_time, timezone="America/Sao_Paulo")

        sched.add_job(
            _run_executor,
            trigger=trigger,
            args=[str(json_path)],
            id=job_id,
            name=task_name,
            replace_existing=True,
            misfire_grace_time=300,   # 5 min de tolerância
        )

        logger.info(f"Tarefa {job_id} agendada para {scheduled_time} | daily={daily}")
        return True, "Agendamento criado com sucesso"

    except Exception as e:
        logger.error(f"Erro ao criar tarefa {task_id}: {e}")
        return False, str(e)


def delete_task(task_id: int | str) -> None:
    """Remove uma tarefa agendada."""
    try:
        sched  = get_scheduler()
        job_id = f"task_{task_id}"
        if sched.get_job(job_id):
            sched.remove_job(job_id)
            logger.info(f"Tarefa {job_id} removida.")
    except Exception as e:
        logger.error(f"Erro ao remover tarefa {task_id}: {e}")


def shutdown():
    """Para o scheduler (chamar ao encerrar o app)."""
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        logger.info("APScheduler encerrado.")