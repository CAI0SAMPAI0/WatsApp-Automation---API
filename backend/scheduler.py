import logging
import redis.asyncio as aioredis
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.jobstores.redis import RedisJobStore
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from database import SessionLocal, Task, TaskStatus, get_db
from evolution import enviar_texto, enviar_midia

logger = logging.getLogger(__name__)

import os
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")

jobstores = {
    "default": RedisJobStore(
        jobs_key="apscheduler.jobs",
        run_times_key="apscheduler.run_times",
        host=REDIS_URL.replace("redis://", "").split(":")[0],
        port=int(REDIS_URL.split(":")[-1]),
    )
}

scheduler = AsyncIOScheduler(jobstores=jobstores, timezone="America/Sao_Paulo")


async def executar_task(task_id: int):
    db: Session = SessionLocal()
    try:
        task = db.query(Task).filter(Task.id == task_id).first()
        if not task or task.status != TaskStatus.pending:
            return

        task.status = TaskStatus.running
        db.commit()

        numero = task.target.strip().replace("+", "").replace(" ", "")

        if task.mode.value == "text":
            await enviar_texto(numero, task.message or "")

        elif task.mode.value in ("file", "file_text"):
            await enviar_midia(
                numero=numero,
                url_arquivo=task.file_path,
                tipo="document",
                legenda=task.message or "",
            )

        task.status = TaskStatus.completed
        task.executed_at = datetime.now(timezone.utc)
        db.commit()
        logger.info(f"Task {task_id} concluída")

    except Exception as e:
        logger.error(f"Task {task_id} falhou: {e}")
        if task:
            task.status = TaskStatus.failed
            task.error_message = str(e)
            db.commit()
    finally:
        db.close()


def agendar_task(task_id: int, scheduled_time: datetime, is_daily: bool = False):
    job_id = f"task_{task_id}"

    if is_daily:
        scheduler.add_job(
            executar_task,
            trigger="cron",
            hour=scheduled_time.hour,
            minute=scheduled_time.minute,
            args=[task_id],
            id=job_id,
            replace_existing=True,
            misfire_grace_time=120,
        )
    else:
        scheduler.add_job(
            executar_task,
            trigger="date",
            run_date=scheduled_time,
            args=[task_id],
            id=job_id,
            replace_existing=True,
            misfire_grace_time=120,
        )


def cancelar_task(task_id: int):
    job_id = f"task_{task_id}"
    try:
        scheduler.remove_job(job_id)
    except Exception:
        pass