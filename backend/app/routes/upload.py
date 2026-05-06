from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from .deps import get_current_user
from ..models.models import User
from ..config import settings
from supabase import create_client, Client
import uuid

router = APIRouter(prefix="/upload", tags=["upload"])

supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)

@router.post("/")
async def upload_file(file: UploadFile = File(...), current_user: User = Depends(get_current_user)):
    file_ext = file.filename.split(".")[-1]
    file_name = f"{current_user.id}/{uuid.uuid4()}.{file_ext}"
    
    try:
        contents = await file.read()
        # Upload to Supabase Storage (bucket named 'uploads')
        # Ensure the bucket exists in your Supabase project
        res = supabase.storage.from_("uploads").upload(
            path=file_name,
            file=contents,
            file_options={"content-type": file.content_type}
        )
        
        # Get public URL
        url = supabase.storage.from_("uploads").get_public_url(file_name)
        return {"url": url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
