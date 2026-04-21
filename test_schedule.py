import requests
from datetime import datetime, timedelta
import json

# Insere tarefa que dispara em 2 minutos
from core.db import get_db
from core.scheduler import create_task

db = get_db()
dt = datetime.now() + timedelta(minutes=2)

task_id = db.adicionar(
    task_name="teste_baileys",
    target="5524999139693",
    mode="text",
    message="Agendamento funcionando!",
    scheduled_time=dt
)

create_task(
    task_id=task_id,
    task_name="teste_baileys",
    json_config={
        "target": "5524999139693",
        "mode": "text",
        "message": "Agendamento funcionando!"
    },
    scheduled_time=dt
)

print(f"Tarefa {task_id} agendada para {dt}")