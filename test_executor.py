import json
import os
from pathlib import Path

# cria o json de teste
task = {
    "task_id": None,
    "target": "5524999139693",
    "mode": "text",
    "message": "Executor funcionando!"
}

json_path = Path("test_task.json")
json_path.write_text(json.dumps(task), encoding="utf-8")

# roda o executor
os.system(f"python executor.py test_task.json")