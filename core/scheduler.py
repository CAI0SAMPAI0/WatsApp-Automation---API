"""
core/scheduler.py
APScheduler em memória (sem SQLAlchemy jobstore) — mais simples e confiável no Railway.
"""

import json
import logging
import subprocess
import sys
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from pathlib import Path

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron        import CronTrigger
from apscheduler.triggers.date        import DateTrigger

from core.paths import get_user_data_dir, get_app_base_dir

logger = logging.getLogger("scheduler")

BASE_DIR      = Path(get_app_base_dir())
USER_DATA_DIR = Path(get_user_data_dir())

# ── instância global ──────────────────────────────────────────────────────
_scheduler: BackgroundScheduler | None = None


def get_scheduler() -> BackgroundScheduler:
    global _scheduler
    if _scheduler is None:
        # sem jobstore persistente — jobs ficam em memória
        _scheduler = BackgroundScheduler(timezone="America/Sao_Paulo")
        _scheduler.start()
        logger.info("APScheduler iniciado (in-memory, UTC).")
    return _scheduler


# ── executa o executor.py em subprocess ──────────────────────────────────
def _run_executor(json_path: str):
    """Chamado pelo APScheduler no horário agendado."""
    executor_path = BASE_DIR / "executor.py"
    cmd = [sys.executable, str(executor_path), json_path]

    logger.info(f"[EXECUTOR] Disparando: {json_path}")

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
        stdout = proc.stdout[-1000:] if proc.stdout else "vazio"
        stderr = proc.stderr[-1000:] if proc.stderr else "vazio"
        logger.info(f"[EXECUTOR] stdout: {stdout}")
        if proc.returncode != 0:
            logger.error(f"[EXECUTOR] Falhou (code {proc.returncode}) stderr: {stderr}")
        else:
            logger.info(f"[EXECUTOR] Sucesso!")
    except Exception as e:
        logger.error(f"[EXECUTOR] Exceção ao lançar executor: {e}")


# ── API pública ───────────────────────────────────────────────────────────
def create_task(
    task_id,
    task_name: str,
    json_config: dict,
    scheduled_time: datetime,
    daily: bool = False,
    include_weekends: bool = True,
) -> tuple[bool, str]:
    try:
        scheduled_tasks_dir = BASE_DIR / "scheduled_tasks"
        scheduled_tasks_dir.mkdir(exist_ok=True)

        json_path = scheduled_tasks_dir / f"task_{task_id}.json"
        if "task_id" not in json_config:
            json_config["task_id"] = task_id
        json_path.write_text(
            json.dumps(json_config, ensure_ascii=False, indent=2), encoding="utf-8"
        )

        sched  = get_scheduler()
        job_id = f"task_{task_id}"

        if sched.get_job(job_id):
            sched.remove_job(job_id)

        # garante que scheduled_time está em UTC
        if scheduled_time.tzinfo is None:
            scheduled_time = scheduled_time.replace(tzinfo=ZoneInfo("America/Sao_Paulo"))

        now_utc = datetime.now(ZoneInfo("America/Sao_Paulo"))
        logger.info(f"[SCHEDULER] now_utc={now_utc} | scheduled={scheduled_time} | diff={scheduled_time - now_utc}")

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
            misfire_grace_time=300,
        )

        next_run = sched.get_job(job_id)
        logger.info(f"[SCHEDULER] Job {job_id} agendado. Próxima execução: {next_run.next_run_time if next_run else 'N/A'}")
        return True, "Agendamento criado com sucesso"

    except Exception as e:
        logger.error(f"[SCHEDULER] Erro ao criar tarefa {task_id}: {e}")
        return False, str(e)


def delete_task(task_id) -> None:
    try:
        sched  = get_scheduler()
        job_id = f"task_{task_id}"
        if sched.get_job(job_id):
            sched.remove_job(job_id)
            logger.info(f"[SCHEDULER] Job {job_id} removido.")
    except Exception as e:
        logger.error(f"[SCHEDULER] Erro ao remover tarefa {task_id}: {e}")


def shutdown():
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        logger.info("APScheduler encerrado.")