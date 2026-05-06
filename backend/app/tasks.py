from .celery_app import celery_app
from .database import supabase
import httpx
from datetime import datetime
from .config import settings

@celery_app.task(name="send_whatsapp_message")
def send_whatsapp_message(message_id: str):
    try:
        res = supabase.table("messages").select("*").eq("id", message_id).execute()
        if not res.data:
            return "Message not found"
        
        msg = res.data[0]
        supabase.table("messages").update({"status": "executing"}).eq("id", message_id).execute()
        
        with httpx.Client() as client:
            headers = {"x-session-id": str(msg["user_id"]), "x-api-key": "minha-chave-secreta"}
            target = msg["target_name"]
            
            if msg["message_text"]:
                client.post(
                    f"{settings.WHATSAPP_SERVICE_URL}/send/text",
                    headers=headers,
                    json={"number": target, "message": msg["message_text"]}
                )
            
            res_files = supabase.table("message_files").select("*").eq("message_id", message_id).execute()
            for f in res_files.data:
                client.post(
                    f"{settings.WHATSAPP_SERVICE_URL}/send/media",
                    headers=headers,
                    json={
                        "number": target,
                        "media_url": f["file_url"],
                        "media_type": "document"
                    }
                )
            
        supabase.table("messages").update({"status": "success"}).eq("id", message_id).execute()
        return "Success"
        
    except Exception as e:
        supabase.table("messages").update({"status": "error"}).eq("id", message_id).execute()
        return str(e)

@celery_app.task(name="check_scheduled_messages")
def check_scheduled_messages():
    try:
        now = datetime.utcnow().isoformat()
        res = supabase.table("messages").select("*").eq("status", "pending").lte("scheduled_at", now).execute()
        
        for msg in res.data:
            send_whatsapp_message.delay(str(msg["id"]))
            
    except Exception as e:
        print(f"Error checking scheduled messages: {e}")
