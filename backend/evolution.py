import os
import httpx

EVOLUTION_URL = os.environ.get("EVOLUTION_URL", "http://localhost:8080")
EVOLUTION_KEY = os.environ.get("EVOLUTION_KEY", "")
INSTANCE      = os.environ.get("EVOLUTION_INSTANCE", "minha-instancia")

HEADERS = {
    "apikey": EVOLUTION_KEY,
    "Content-Type": "application/json",
}


def _fmt_numero(numero: str) -> str:
    """Remove +, espaços e traços. Ex: +55 11 99999-9999 → 5511999999999"""
    return numero.strip().replace("+", "").replace(" ", "").replace("-", "")


async def criar_instancia():
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"{EVOLUTION_URL}/instance/create",
            headers=HEADERS,
            json={
                "instanceName": INSTANCE,
                "integration": "WHATSAPP-BAILEYS",
                "qrcode": True,
            },
        )
        # 409 = já existe, tudo bem
        if r.status_code not in (200, 201, 409):
            r.raise_for_status()
        return r.json()


async def get_qrcode() -> dict:
    """Retorna base64 do QR Code para escanear."""
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(
            f"{EVOLUTION_URL}/instance/connect/{INSTANCE}",
            headers=HEADERS,
        )
        return r.json()


async def get_status() -> dict:
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(
            f"{EVOLUTION_URL}/instance/connectionState/{INSTANCE}",
            headers=HEADERS,
        )
        return r.json()


async def enviar_texto(numero: str, mensagem: str) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"{EVOLUTION_URL}/message/sendText/{INSTANCE}",
            headers=HEADERS,
            json={
                "number": _fmt_numero(numero),
                "text": mensagem,
            },
        )
        r.raise_for_status()
        return r.json()


async def enviar_midia_url(
    numero: str,
    url: str,
    tipo: str,          # "image" | "document" | "video" | "audio"
    legenda: str = "",
    nome_arquivo: str = "arquivo",
) -> dict:
    """Envia mídia a partir de URL pública."""
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(
            f"{EVOLUTION_URL}/message/sendMedia/{INSTANCE}",
            headers=HEADERS,
            json={
                "number": _fmt_numero(numero),
                "mediatype": tipo,
                "media": url,
                "caption": legenda,
                "fileName": nome_arquivo,
            },
        )
        r.raise_for_status()
        return r.json()


async def enviar_midia_base64(
    numero: str,
    base64_data: str,   # sem prefixo "data:..."
    tipo: str,          # "image" | "document" | "video" | "audio"
    nome_arquivo: str,
    legenda: str = "",
) -> dict:
    """Envia mídia em base64 — útil quando não há URL pública."""
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(
            f"{EVOLUTION_URL}/message/sendMedia/{INSTANCE}",
            headers=HEADERS,
            json={
                "number": _fmt_numero(numero),
                "mediatype": tipo,
                "media": base64_data,
                "fileName": nome_arquivo,
                "caption": legenda,
                "encoding": True,
            },
        )
        r.raise_for_status()
        return r.json()