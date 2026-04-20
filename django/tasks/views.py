import json
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from .models import Task
from whatsapp.client import evolution
import uuid


def _task_to_dict(t: Task) -> dict:
    return {
        "id":           t.id,
        "target_jid":   t.target_jid,
        "target_name":  t.target_name,
        "mode":         t.mode,
        "message":      t.message,
        "file_url":     t.file.url if t.file else None,
        "file_name":    t.file_name,
        "scheduled_at": t.scheduled_at.isoformat(),
        "is_recurring": t.is_recurring,
        "recur_days":   t.recur_days,
        "batch_id":     t.batch_id,
        "status":       t.status,
        "error_message":t.error_message,
        "created_at":   t.created_at.isoformat(),
    }


@require_http_methods(["GET"])
def list_tasks(request):
    tasks = Task.objects.all()[:100]
    return JsonResponse({"tasks": [_task_to_dict(t) for t in tasks]})


@csrf_exempt
@require_http_methods(["POST"])
def create_task(request):
    try:
        data         = json.loads(request.body)
        scheduled_at = parse_datetime(data["scheduled_at"])
        if scheduled_at is None:
            return JsonResponse({"error": "Data inválida"}, status=400)

        task = Task.objects.create(
            target_jid   = data["target_jid"],
            target_name  = data["target_name"],
            mode         = data["mode"],
            message      = data.get("message", ""),
            scheduled_at = scheduled_at,
            is_recurring = data.get("is_recurring", False),
            recur_days   = data.get("recur_days", ""),
            batch_id     = data.get("batch_id", ""),
        )
        return JsonResponse({"ok": True, "task": _task_to_dict(task)}, status=201)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=400)


@csrf_exempt
@require_http_methods(["POST"])
def create_task_with_file(request):
    """Cria tarefa com upload de arquivo."""
    try:
        task = Task.objects.create(
            target_jid   = request.POST["target_jid"],
            target_name  = request.POST["target_name"],
            mode         = request.POST["mode"],
            message      = request.POST.get("message", ""),
            scheduled_at = parse_datetime(request.POST["scheduled_at"]),
            is_recurring = request.POST.get("is_recurring") == "true",
            recur_days   = request.POST.get("recur_days", ""),
            batch_id     = request.POST.get("batch_id", ""),
        )
        if "file" in request.FILES:
            f = request.FILES["file"]
            task.file      = f
            task.file_name = f.name
            task.save()

        return JsonResponse({"ok": True, "task": _task_to_dict(task)}, status=201)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=400)


@csrf_exempt
@require_http_methods(["DELETE"])
def delete_task(request, task_id):
    try:
        Task.objects.filter(id=task_id).delete()
        return JsonResponse({"ok": True})
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=400)


@csrf_exempt
@require_http_methods(["POST"])
def send_now(request):
    """Envia imediatamente sem agendar."""
    try:
        data = json.loads(request.body)
        _dispatch(
            jid       = data["target_jid"],
            mode      = data["mode"],
            message   = data.get("message", ""),
            file_path = None,
        )
        return JsonResponse({"ok": True})
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def create_batch(request):
    """Cria múltiplas tasks com o mesmo batch_id."""
    try:
        data     = json.loads(request.body)
        items    = data["items"]          # lista de {target_jid, target_name, mode, message}
        sched    = parse_datetime(data["scheduled_at"])
        recur    = data.get("is_recurring", False)
        recur_d  = data.get("recur_days", "")
        batch_id = str(uuid.uuid4())[:8]

        tasks = []
        for item in items:
            t = Task.objects.create(
                target_jid   = item["target_jid"],
                target_name  = item["target_name"],
                mode         = item["mode"],
                message      = item.get("message", ""),
                scheduled_at = sched,
                is_recurring = recur,
                recur_days   = recur_d,
                batch_id     = batch_id,
            )
            tasks.append(_task_to_dict(t))

        return JsonResponse({"ok": True, "batch_id": batch_id, "tasks": tasks}, status=201)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=400)


def _dispatch(jid: str, mode: str, message: str, file_path: str | None):
    """Chama a Evolution API de acordo com o modo."""
    if mode == "text":
        evolution.send_text(jid, message)
    elif mode == "file" and file_path:
        evolution.send_media_base64(jid, file_path)
    elif mode == "file_text" and file_path:
        evolution.send_media_base64(jid, file_path, caption=message)
