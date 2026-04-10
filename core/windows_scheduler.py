import sys
import json
import subprocess
from pathlib import Path
from datetime import datetime, timedelta
from core.paths import get_app_base_dir

APP_PATH = Path(get_app_base_dir())

def create_task_bat(task_id, task_name, json_config):
    import sys
    app_path = Path(get_app_base_dir()).absolute()
    scheduled_tasks_dir = app_path / "scheduled_tasks"
    scheduled_tasks_dir.mkdir(exist_ok=True)
    
    json_path = scheduled_tasks_dir / f"task_{task_id}.json"
    bat_path = scheduled_tasks_dir / f"task_{task_id}.bat"
    vbs_path = scheduled_tasks_dir / f"task_{task_id}.vbs"

    if 'task_id' not in json_config:
        json_config['task_id'] = task_id
    
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(json_config, f, indent=2, ensure_ascii=False)
    
    exe_path = Path(sys.executable).absolute()

    if getattr(sys, 'frozen', False):
        run_command = f'"{exe_path}" --executor-json "{json_path}"'
    else:
        executor_path = app_path / "executor.py"
        run_command = f'"{exe_path}" "{executor_path}" "{json_path}"'
    
    bat_content = f"""@echo off
chcp 65001 >nul
cd /d "{app_path}"
echo [%date% %time%] Iniciando tarefa {task_id}
{run_command}
if %ERRORLEVEL% EQU 0 (
    echo [%date% %time%] Tarefa concluida com sucesso
) else (
    echo [%date% %time%] Tarefa falhou com codigo %ERRORLEVEL%
)
exit
"""
    with open(bat_path, 'w', encoding='utf-8') as f:
        f.write(bat_content)

    vbs_content = f'CreateObject("Wscript.Shell").Run chr(34) & "{bat_path}" & chr(34), 0, False'
    with open(vbs_path, 'w', encoding='utf-8') as f:
        f.write(vbs_content)
    
    return str(vbs_path)


def create_windows_task(task_id, task_name, schedule_time, schedule_date=None,
                        daily=False, include_weekends=True):
    vbs_path = APP_PATH / "scheduled_tasks" / f"task_{task_id}.vbs"

    if not schedule_date:
        schedule_date = datetime.now().strftime("%d/%m/%Y")
    
    try:
        dt_str = f"{schedule_date} {schedule_time}"
        dt = datetime.strptime(dt_str, "%d/%m/%Y %H:%M")
    except Exception as e:
        return False, f"Erro ao processar data/hora: {str(e)}"

    task_full_name = f"AutoMessage_{task_id}"

    if daily:
        if include_weekends:
            cmd = (
                f'schtasks /create '
                f'/tn "{task_full_name}" '
                f'/tr "{vbs_path}" '
                f'/sc daily '
                f'/st {schedule_time} '
                f'/rl highest '
                f'/it '
                f'/f'
            )
        else:
            cmd = (
                f'schtasks /create '
                f'/tn "{task_full_name}" '
                f'/tr "{vbs_path}" '
                f'/sc weekly '
                f'/d MON,TUE,WED,THU,FRI '
                f'/st {schedule_time} '
                f'/rl highest '
                f'/it '
                f'/f'
            )
    else:
        cmd = (
            f'schtasks /create '
            f'/tn "{task_full_name}" '
            f'/tr "{vbs_path}" '
            f'/sc once '
            f'/sd {schedule_date} '
            f'/st {schedule_time} '
            f'/rl highest '
            f'/it '
            f'/f'
        )

    try:
        result = subprocess.run(
            cmd, 
            shell=True, 
            capture_output=True, 
            text=True,
            encoding='cp850',
            errors='replace'
        )
        
        if result.returncode != 0:
            erro = result.stderr if result.stderr else result.stdout
            print(f"[ERRO SCHTASKS] Código: {result.returncode}")
            print(f"[ERRO SCHTASKS] Comando: {cmd}")
            print(f"[ERRO SCHTASKS] Saída: {erro}")
            return False, f"Erro ao criar tarefa: {erro}"
        
        print(f"[OK] Tarefa {task_full_name} criada com sucesso")
        if daily:
            modo = "todos os dias" if include_weekends else "dias úteis (Seg-Sex)"
            print(f"[INFO] Agendada para: {schedule_time} | Recorrência: {modo}")
        else:
            print(f"[INFO] Agendada para: {schedule_date} às {schedule_time}")
            
        return True, "Agendamento criado com sucesso"
        
    except Exception as e:
        print(f"[EXCEÇÃO] Erro ao executar schtasks: {str(e)}")
        return False, f"Exceção ao criar tarefa: {str(e)}"


def delete_windows_task(task_id):
    task_name = f"AutoMessage_{task_id}"
    cmd = f'schtasks /delete /tn "{task_name}" /f'
    
    try:
        result = subprocess.run(
            cmd, 
            shell=True, 
            capture_output=True, 
            text=True,
            encoding='cp850',
            errors='replace'
        )
        
        if result.returncode == 0:
            print(f"[OK] Tarefa {task_name} removida com sucesso")
        else:
            print(f"[AVISO] Não foi possível remover {task_name}: {result.stderr}")
            
    except Exception as e:
        print(f"[ERRO] Exceção ao deletar tarefa: {str(e)}")