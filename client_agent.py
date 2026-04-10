import time
import requests
import os
import sys
from pathlib import Path
from datetime import datetime

# Add current dir to path to allow imports
BASE_DIR = Path(__file__).parent.absolute()
sys.path.insert(0, str(BASE_DIR))

from core.automation import executar_envio
from core.paths import get_whatsapp_profile_dir

# Configuration
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")
POLL_INTERVAL = 2 # Consulta a cada 2 segundos

def get_selectors():
    try:
        response = requests.get(f"{API_BASE_URL}/selectors", timeout=5)
        if response.status_code == 200:
            selectors_list = response.json()
            return {item["key"]: item["selectors"] for item in selectors_list}
    except Exception as e:
        print(f"Error fetching selectors: {e}")
    return None

def get_pending_tasks():
    try:
        response = requests.get(f"{API_BASE_URL}/tasks/pending", timeout=5)
        if response.status_code == 200:
            return response.json()
    except Exception as e:
        print(f"Error fetching tasks: {e}")
    return []

def update_task_status(task_id, status, error_message=None):
    try:
        payload = {"status": status}
        if error_message:
            payload["error_message"] = error_message
        requests.patch(f"{API_BASE_URL}/tasks/{task_id}", json=payload, timeout=5)
    except Exception as e:
        print(f"Error updating task status: {e}")

def main():
    print(f"[{datetime.now()}] Client Agent iniciado. Lendo de {API_BASE_URL}")
    profile_dir = get_whatsapp_profile_dir()
    
    while True:
        selectors = get_selectors()
        tasks = get_pending_tasks()
        
        for task in tasks:
            task_id = task["id"]
            
            # Lógica de Horário
            scheduled_at_str = task.get("scheduled_at")
            if scheduled_at_str:
                try:
                    from datetime import datetime as dt
                    sched_dt = dt.fromisoformat(scheduled_at_str.replace('Z', '+00:00'))
                    now = dt.now(sched_dt.tzinfo)
                    
                    # Se faltar MAIS de 1 minuto para a tarefa (agendamento real futuro), pula.
                    # Se a tarefa for para "agora" (mesmo que esteja 1 min no futuro), executa.
                    diff = (sched_dt - now).total_seconds()
                    if diff > 65: # Tolerância para agendamentos futuros reais
                        continue
                except Exception as e:
                    print(f"Erro no parse da data: {e}")
            
            print(f"[{datetime.now()}] Processando tarefa {task_id} para {task['target']}...")
            update_task_status(task_id, "running")
            
            try:
                success = executar_envio(
                    userdir=profile_dir,
                    target=task["target"],
                    mode=task["mode"],
                    selectors=selectors,
                    message=task.get("message"),
                    file_path=task.get("file_path"),
                    modo_execucao='manual' 
                )
                
                if success:
                    update_task_status(task_id, "completed")
                else:
                    update_task_status(task_id, "failed", "Automação retornou falso")
            except Exception as e:
                update_task_status(task_id, "failed", str(e))
                print(f"Erro na execução: {e}")
        
        time.sleep(POLL_INTERVAL)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("Parado.")
