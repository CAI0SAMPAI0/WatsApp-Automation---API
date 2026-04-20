import logging
from datetime import timedelta
from django.utils import timezone
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger(__name__)
_scheduler = None


def _run_pending_tasks():
    """Verifica tasks pendentes e dispara as que estão na hora."""
    from .models import Task
    from .views import _dispatch
    import os

    now     = timezone.now()
    window  = now + timedelta(seconds=45)  # 45s de tolerância

    tasks = Task.objects.filter(
        status="pending",
        scheduled_at__lte=window,
    )

    for task in tasks:
        logger.info(f"[SCHEDULER] Disparando task {task.id} → {task.target_name}")
        task.status = "running"
        task.save(update_fields=["status"])

        try:
            file_path = task.file.path if task.file else None
            _dispatch(
                jid       = task.target_jid,
                mode      = task.mode,
                message   = task.message,
                file_path = file_path,
            )
            task.status      = "completed"
            task.executed_at = timezone.now()

            # recorrente: reagenda para amanhã
            if task.is_recurring:
                Task.objects.create(
                    target_jid   = task.target_jid,
                    target_name  = task.target_name,
                    mode         = task.mode,
                    message      = task.message,
                    file         = task.file,
                    file_name    = task.file_name,
                    scheduled_at = task.scheduled_at + timedelta(days=1)
                    if task.recur_days == "all"
                    else _next_weekday(task.scheduled_at),
                    is_recurring = True,
                    recur_days   = task.recur_days,
                    batch_id     = task.batch_id,
                )

        except Exception as e:
            logger.error(f"[SCHEDULER] Erro na task {task.id}: {e}")
            task.status        = "failed"
            task.error_message = str(e)
            task.executed_at   = timezone.now()

        task.save(update_fields=["status", "executed_at", "error_message"])


def _next_weekday(dt):
    """Próximo dia útil (Seg-Sex) após dt."""
    from datetime import timedelta
    next_dt = dt + timedelta(days=1)
    while next_dt.weekday() >= 5:  # 5=Sábado, 6=Domingo
        next_dt += timedelta(days=1)
    return next_dt


def start():
    global _scheduler
    if _scheduler and _scheduler.running:
        return
    _scheduler = BackgroundScheduler(timezone="America/Sao_Paulo")
    _scheduler.add_job(
        _run_pending_tasks,
        trigger=IntervalTrigger(seconds=30),
        id="run_pending_tasks",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info("[SCHEDULER] Iniciado — verificando a cada 30s")
