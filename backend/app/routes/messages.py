from fastapi import APIRouter, Depends, HTTPException
from ..database import get_supabase
from .deps import get_current_user
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta
from supabase import Client
import uuid

router = APIRouter(prefix="/messages", tags=["messages"])

class MessageCreate(BaseModel):
    target_name: str
    target_type: str
    message_text: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    file_urls: Optional[List[str]] = []

@router.post("/send")
async def send_message(msg: MessageCreate, current_user: dict = Depends(get_current_user), supabase: Client = Depends(get_supabase)):
    scheduled_at = datetime.utcnow() + timedelta(seconds=5)
    
    new_msg = {
        "user_id": current_user["id"],
        "target_name": msg.target_name,
        "target_type": msg.target_type,
        "message_text": msg.message_text,
        "status": "pending",
        "scheduled_at": scheduled_at.isoformat()
    }
    
    res = supabase.table("messages").insert(new_msg).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create message")
    
    msg_id = res.data[0]["id"]
    
    for url in msg.file_urls:
        supabase.table("message_files").insert({"message_id": msg_id, "file_url": url}).execute()
    
    # Trigger celery task
    from ..tasks import send_whatsapp_message
    send_whatsapp_message.delay(str(msg_id))
    
    return {"message_id": str(msg_id), "status": "pending", "scheduled_at": scheduled_at}

@router.post("/schedule")
async def schedule_message(msg: MessageCreate, current_user: dict = Depends(get_current_user), supabase: Client = Depends(get_supabase)):
    if not msg.scheduled_at:
        raise HTTPException(status_code=400, detail="scheduled_at is required")
    
    min_delay = datetime.utcnow() + timedelta(seconds=5)
    if msg.scheduled_at < min_delay:
        msg.scheduled_at = min_delay
        
    new_msg = {
        "user_id": current_user["id"],
        "target_name": msg.target_name,
        "target_type": msg.target_type,
        "message_text": msg.message_text,
        "status": "pending",
        "scheduled_at": msg.scheduled_at.isoformat()
    }
    
    res = supabase.table("messages").insert(new_msg).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create message")
    
    msg_id = res.data[0]["id"]
    
    for url in msg.file_urls:
        supabase.table("message_files").insert({"message_id": msg_id, "file_url": url}).execute()
    
    return {"message_id": str(msg_id), "status": "pending", "scheduled_at": msg.scheduled_at}

@router.get("/")
async def list_messages(current_user: dict = Depends(get_current_user), supabase: Client = Depends(get_supabase)):
    res = supabase.table("messages").select("*, message_files(*)").eq("user_id", current_user["id"]).order("created_at", desc=True).execute()
    return res.data

@router.get("/{message_id}")
async def get_message(message_id: uuid.UUID, current_user: dict = Depends(get_current_user), supabase: Client = Depends(get_supabase)):
    res = supabase.table("messages").select("*, message_files(*)").eq("id", str(message_id)).eq("user_id", current_user["id"]).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Message not found")
    return res.data[0]
