from datetime import datetime
from .windows_scheduler import create_windows_task, create_task_bat

def create_windows_task_interface(task_id, scheduled_time, target,
                                  mode, message=None, file_path=None):

    task_name = f"WA_Task_{task_id}"

    dt = datetime.fromisoformat(scheduled_time)
    schedule_time_only = dt.strftime("%H:%M")

    task_data = {
        "task_id": str(task_id),
        "task_name": task_name,
        "target": target,
        "mode": mode,
        "message": message or "",
        "file_path": file_path or "",
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }

    create_task_bat(
        task_id=str(task_id),
        task_name=task_name,
        json_config=task_data
    )

    return create_windows_task(
        task_id=str(task_id),
        task_name=task_name,
        schedule_time=schedule_time_only
    )
