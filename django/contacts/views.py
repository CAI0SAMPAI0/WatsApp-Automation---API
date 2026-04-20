from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from whatsapp.client import evolution
from .models import Contact
import json


@csrf_exempt
@require_http_methods(["POST"])
def sync_contacts(request):
    """Sincroniza contatos e grupos da Evolution API e salva no banco."""
    try:
        raw_contacts = evolution.fetch_contacts()
        raw_groups   = evolution.fetch_groups()
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=502)

    saved = 0
    for c in raw_contacts:
        jid  = c.get("id") or c.get("remoteJid", "")
        name = c.get("pushName") or c.get("name") or ""
        if not jid or not name or "@g.us" in jid:
            continue
        Contact.objects.update_or_create(
            jid=jid,
            defaults={"name": name, "type": "contact"}
        )
        saved += 1

    for g in raw_groups:
        jid  = g.get("id", "")
        name = g.get("subject") or g.get("name") or ""
        if not jid or not name:
            continue
        Contact.objects.update_or_create(
            jid=jid,
            defaults={"name": name, "type": "group"}
        )
        saved += 1

    return JsonResponse({"ok": True, "synced": saved})


@require_http_methods(["GET"])
def search_contacts(request):
    """Autocomplete: ?q=Tips retorna contatos e grupos com esse nome."""
    q = request.GET.get("q", "").strip()
    qs = Contact.objects.all()
    if q:
        qs = qs.filter(name__icontains=q)
    data = [{"jid": c.jid, "name": c.name, "type": c.type} for c in qs[:30]]
    return JsonResponse({"results": data})


@require_http_methods(["GET"])
def whatsapp_status(request):
    """Retorna status da conexão e QR Code se necessário."""
    try:
        status = evolution.get_instance_status()
        
        # Se a instância não existe (404), tenta criar
        if "instance" not in status:
            evolution.create_instance()
            status = evolution.get_instance_status()

        state  = status.get("instance", {}).get("state", "unknown")

        if state != "open":
            qr = evolution.get_qrcode()
            return JsonResponse({"state": state, "qrcode": qr})

        return JsonResponse({"state": "open"})
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=502)
