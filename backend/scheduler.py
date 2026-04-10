import logging
import os
from datetime import datetime, timezone, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.jobstores.redis import RedisJobStore
from sqlalchemy.orm import Session

from database import SessionLocal, Task, TaskStatus
from evolution import enviar_texto, enviar_midia_url, enviar_midia_base64

logger = logging.getLogger(__name__)

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")

# ── parse seguro da URL do Redis ──────────────────────────────────────────────
def _redis_host_port(url: str):
    # suporta redis://host:port e redis://:password@host:port
    url = url.replace("redis://", "")
    if "@" in url:
        url = url.split("@", 1)[1]
    host, _, port = url.partition(":")
    return host or "localhost", int(port or 6379)

_rhost, _rport = _redis_host_port(REDIS_URL)

jobstores = {
    "default": RedisJobStore(
        jobs_key="apscheduler.jobs",
        run_times_key="apscheduler.run_times",
        host=_rhost,
        port=_rport,
    )
}

# SEMPRE usar timezone de Brasília
scheduler = AsyncIOScheduler(
    jobstores=jobstores,
    timezone="America/Sao_Paulo",
)


async def executar_task(task_id: int):
    """Executa um envio e atualiza o status no banco."""
    db: Session = SessionLocal()
    task = None
    try:
        task = db.query(Task).filter(Task.id == task_id).first()
        if not task:
            logger.warning(f"Task {task_id} não encontrada")
            return
        if task.status != TaskStatus.pending:
            logger.info(f"Task {task_id} já processada (status={task.status}), pulando")
            return

        task.status = TaskStatus.running
        db.commit()

        from evolution import resolver_destino
        numero = await resolver_destino(task.target.strip())
        logger.info(f"[DEBUG] Destino resolvido: '{task.target}' → '{numero}'")
        modo   = task.mode.value if hasattr(task.mode, "value") else task.mode

        if modo == "text":
            await enviar_texto(numero, task.message or "")

        elif modo == "file":
            # file_path pode ser URL ou base64
            fp = task.file_path or ""
            if fp.startswith("http"):
                await enviar_midia_url(numero, fp, "document")
            else:
                await enviar_midia_base64(numero, fp, "document", "arquivo")

        elif modo == "file_text":
            fp = task.file_path or ""
            if fp.startswith("http"):
                await enviar_midia_url(numero, fp, "document",
                                       legenda=task.message or "")
            else:
                await enviar_midia_base64(numero, fp, "document", "arquivo",
                                          legenda=task.message or "")

        task.status     = TaskStatus.completed
        task.executed_at = datetime.now(timezone.utc)
        db.commit()
        logger.info(f"✅ Task {task_id} concluída → {numero}")

    except Exception as e:
        logger.error(f"❌ Task {task_id} falhou: {e}")
        if task:
            task.status        = TaskStatus.failed
            task.error_message = str(e)
            db.commit()
    finally:
        db.close()


def agendar_task(task_id: int, scheduled_time: datetime, is_daily: bool = False,
                 include_weekends: bool = True):
    """
    Agenda ou reagenda um job no APScheduler.
    scheduled_time deve chegar como UTC — convertemos para Brasília internamente.
    """
    job_id = f"task_{task_id}"

    # garante que o datetime tem timezone (assume UTC se naive)
    if scheduled_time.tzinfo is None:
        scheduled_time = scheduled_time.replace(tzinfo=timezone.utc)

    # converte para horário de Brasília para o cron/date trigger
    brt = timezone(timedelta(hours=-3))
    dt_brt = scheduled_time.astimezone(brt)

    if is_daily:
        days = "mon-fri" if not include_weekends else "mon-sun"
        scheduler.add_job(
            executar_task,
            trigger="cron",
            day_of_week=days,
            hour=dt_brt.hour,
            minute=dt_brt.minute,
            args=[task_id],
            id=job_id,
            replace_existing=True,
            misfire_grace_time=300,
        )
    else:
        scheduler.add_job(
            executar_task,
            trigger="date",
            run_date=dt_brt,
            args=[task_id],
            id=job_id,
            replace_existing=True,
            misfire_grace_time=300,
        )
    logger.info(f"Job {job_id} agendado para {dt_brt.strftime('%d/%m/%Y %H:%M')} BRT")


def cancelar_task(task_id: int):
    try:
        scheduler.remove_job(f"task_{task_id}")
    except Exception:
        pass