from celery import Celery
from .config import settings

celery_app = Celery(
    "worker",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["backend.app.tasks"]
)

celery_app.conf.task_routes = {
    "app.tasks.*": "main-queue"
}

celery_app.conf.beat_schedule = {
    "check-scheduled-every-minute": {
        "task": "check_scheduled_messages",
        "schedule": 60.0,
    },
}

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="America/Sao_Paulo",
    enable_utc=True,
)
