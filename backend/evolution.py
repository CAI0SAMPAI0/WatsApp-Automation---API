import os
import httpx
from typing import Optional

EVOLUTION_URL = os.environ.get("EVOLUTION_URL", "http://localhost:8080")
EVOLUTION_KEY = os.environ.get("EVOLUTION_KEY", "")

HEADERS = {
    "apikey": EVOLUTION_KEY,
    "Content-Type": "application/json",
}

INSTANCE = "minha-instancia"   # nome da instância criada no Evolution


async def criar_instancia():
    """Cria a instância do WhatsApp (roda uma vez na startup)."""
    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{EVOLUTION_URL}/instance/create",
            headers=HEADERS,
            json={
                "instanceName": INSTANCE,
                "qrcode": True,
                "integration": "WHATSAPP-BAILEYS",
            },
        )
        return r.json()


async def get_qrcode() -> dict:
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{EVOLUTION_URL}/instance/connect/{INSTANCE}",
            headers=HEADERS,
        )
        return r.json()


async def get_status() -> dict:
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{EVOLUTION_URL}/instance/connectionState/{INSTANCE}",
            headers=HEADERS,
        )
        return r.json()


async def enviar_texto(numero: str, mensagem: str) -> dict:
    """
    numero: formato internacional sem + ex: '5511999999999'
    """
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"{EVOLUTION_URL}/message/sendText/{INSTANCE}",
            headers=HEADERS,
            json={
                "number": numero,
                "text": mensagem,
            },
        )
        r.raise_for_status()
        return r.json()


async def enviar_midia(
    numero: str,
    url_arquivo: str,
    tipo: str,          # "image" | "document" | "video" | "audio"
    legenda: str = "",
    nome_arquivo: str = "arquivo",
) -> dict:
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(
            f"{EVOLUTION_URL}/message/sendMedia/{INSTANCE}",
            headers=HEADERS,
            json={
                "number": numero,
                "mediatype": tipo,
                "media": url_arquivo,
                "caption": legenda,
                "fileName": nome_arquivo,
            },
        )
        r.raise_for_status()
        return r.json()


async def enviar_documento_base64(
    numero: str,
    base64_data: str,
    nome_arquivo: str,
    legenda: str = "",
) -> dict:
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(
            f"{EVOLUTION_URL}/message/sendMedia/{INSTANCE}",
            headers=HEADERS,
            json={
                "number": numero,
                "mediatype": "document",
                "media": base64_data,   # base64 puro, sem prefixo data:
                "fileName": nome_arquivo,
                "caption": legenda,
                "encoding": True,       # indica que é base64
            },
        )
        r.raise_for_status()
        return r.json()