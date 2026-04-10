import unicodedata
import logging
import httpx
import os

logger = logging.getLogger(__name__)

EVOLUTION_URL = os.environ.get("EVOLUTION_URL", "http://localhost:8080")
EVOLUTION_KEY = os.environ.get("EVOLUTION_KEY", "")
INSTANCE      = os.environ.get("EVOLUTION_INSTANCE", "minha-instancia")

HEADERS = {
    "apikey": EVOLUTION_KEY,
    "Content-Type": "application/json",
}


def _fmt_numero(numero: str) -> str:
    return numero.strip().replace("+", "").replace(" ", "").replace("-", "")


def _normalizar(texto: str) -> str:
    if not texto:
        return ""
    return unicodedata.normalize("NFD", str(texto)).encode("ascii", "ignore").decode("ascii").lower().strip()


async def resolver_destino(nome_ou_numero: str) -> str:
    nome = nome_ou_numero.strip()
    if "@" in nome or nome.replace("+", "").isdigit():
        return nome.replace("+", "")

    nome_norm = _normalizar(nome)

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                f"{EVOLUTION_URL}/group/fetchAllGroups/{INSTANCE}",
                headers=HEADERS,
                params={"getParticipants": "false"},
            )
            if r.status_code == 200:
                for g in r.json():
                    if nome_norm == _normalizar(g.get("subject", "")):
                        return g["id"]
                for g in r.json():
                    if nome_norm in _normalizar(g.get("subject", "")):
                        return g["id"]
    except Exception:
        pass

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                f"{EVOLUTION_URL}/chat/findContacts/{INSTANCE}",
                headers=HEADERS,
                json={},
            )
            if r.status_code == 200:
                exatos = []
                parciais = []
                for c in r.json():
                    push_norm = _normalizar(c.get("pushName", ""))
                    if push_norm == nome_norm:
                        exatos.append(c)
                    elif push_norm.startswith(nome_norm):
                        parciais.append(c)
                if exatos:
                    return exatos[0]["remoteJid"]
                if parciais:
                    return parciais[0]["remoteJid"]
    except Exception:
        pass

    return nome


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
        if r.status_code not in (200, 201, 409):
            r.raise_for_status()
        return r.json()


async def get_qrcode() -> dict:
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


async def enviar_midia_url(numero, url, tipo, legenda="", nome_arquivo="arquivo"):
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


async def enviar_midia_base64(numero, base64_data, tipo, nome_arquivo, legenda=""):
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
