from fastapi import APIRouter, Depends, HTTPException
import httpx
from ..config import settings
from .deps import get_current_user

router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])

@router.get("/qr")
async def get_qr(current_user: dict = Depends(get_current_user)):
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{settings.WHATSAPP_SERVICE_URL}/status?sessionId={current_user['id']}"
        )
        return response.json()

@router.get("/status")
async def get_status(current_user: dict = Depends(get_current_user)):
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{settings.WHATSAPP_SERVICE_URL}/status?sessionId={current_user['id']}"
        )
        return response.json()

@router.get("/contacts")
async def get_contacts(current_user: dict = Depends(get_current_user)):
    async with httpx.AsyncClient() as client:
        headers = {"x-session-id": str(current_user['id']), "x-api-key": "minha-chave-secreta"}
        response = await client.get(
            f"{settings.WHATSAPP_SERVICE_URL}/contacts",
            headers=headers
        )
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=response.text)
        return response.json()

@router.get("/groups")
async def get_groups(current_user: dict = Depends(get_current_user)):
    async with httpx.AsyncClient() as client:
        headers = {"x-session-id": str(current_user['id']), "x-api-key": "minha-chave-secreta"}
        response = await client.get(
            f"{settings.WHATSAPP_SERVICE_URL}/groups",
            headers=headers
        )
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=response.text)
        return response.json()
