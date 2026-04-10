import unicodedata
import logging
import httpx
import os
import re

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
    return (
        unicodedata.normalize("NFD", str(texto))
        .encode("ascii", "ignore")
        .decode("ascii")
        .lower()
        .strip()
    )


def _match(query_norm: str, candidato: str) -> bool:
    return query_norm in _normalizar(candidato)


def _detectar_tipo_mime(mime: str, filename: str) -> str:
    """
    Mapeia mime type para o tipo aceito pela Evolution API:
    'image', 'video', 'audio', 'document'
    """
    if not mime:
        mime = ""
    mime = mime.lower()

    if mime.startswith("image/"):
        return "image"
    if mime.startswith("video/"):
        return "video"
    if mime.startswith("audio/"):
        return "audio"

    # Para qualquer outro tipo (pdf, doc, xlsx, zip, etc) → document
    return "document"


def _extrair_data_uri(file_path: str):
    """
    Se file_path for um data URI (data:<mime>;base64,<dados>),
    retorna (base64_data, mime, tipo_evolution).
    Caso contrário retorna None.
    """
    if not file_path or not file_path.startswith("data:"):
        return None

    # formato: data:<mime>;base64,<dados>
    match = re.match(r"data:([^;]+);base64,(.+)", file_path, re.DOTALL)
    if not match:
        return None

    mime = match.group(1)
    b64_data = match.group(2).strip()
    tipo = _detectar_tipo_mime(mime, "")
    return b64_data, mime, tipo


async def resolver_destino(nome_ou_numero: str, db_contacts=None) -> str:
    nome = nome_ou_numero.strip()

    if "@" in nome or nome.replace("+", "").isdigit():
        return nome.replace("+", "")

    nome_norm = _normalizar(nome)

    # Banco de dados local
    if db_contacts:
        for c in db_contacts:
            if _normalizar(c.name) == nome_norm:
                logger.info(f"[resolver] Exato no banco: '{nome}' → {c.phone}")
                return c.phone
        for c in db_contacts:
            if nome_norm in _normalizar(c.name):
                logger.info(f"[resolver] Parcial no banco: '{nome}' → {c.phone}")
                return c.phone

    # Grupos da Evolution
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                f"{EVOLUTION_URL}/group/fetchAllGroups/{INSTANCE}",
                headers=HEADERS,
                params={"getParticipants": "false"},
            )
            if r.status_code == 200:
                grupos = r.json()
                for g in grupos:
                    if _normalizar(g.get("subject", "")) == nome_norm:
                        logger.info(f"[resolver] Grupo exato: '{nome}' → {g['id']}")
                        return g["id"]
                for g in grupos:
                    if _match(nome_norm, g.get("subject", "")):
                        logger.info(f"[resolver] Grupo parcial: '{nome}' → {g['id']}")
                        return g["id"]
    except Exception as e:
        logger.warning(f"[resolver] Falha ao buscar grupos: {e}")

    # Contatos da Evolution
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                f"{EVOLUTION_URL}/chat/findContacts/{INSTANCE}",
                headers=HEADERS,
                json={},
            )
            if r.status_code == 200:
                exatos   = []
                parciais = []
                for c in r.json():
                    push_norm = _normalizar(c.get("pushName", ""))
                    if push_norm == nome_norm:
                        exatos.append(c)
                    elif nome_norm in push_norm:
                        parciais.append(c)
                if exatos:
                    jid = exatos[0]["remoteJid"]
                    logger.info(f"[resolver] Contato exato Evolution: '{nome}' → {jid}")
                    return jid
                if parciais:
                    jid = parciais[0]["remoteJid"]
                    logger.info(f"[resolver] Contato parcial Evolution: '{nome}' → {jid}")
                    return jid
    except Exception as e:
        logger.warning(f"[resolver] Falha ao buscar contatos Evolution: {e}")

    logger.warning(f"[resolver] Não resolvido, usando valor original: '{nome}'")
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


async def enviar_midia(numero: str, file_path: str, legenda: str = "", nome_arquivo: str = "arquivo") -> dict:
    """
    Ponto de entrada unificado para envio de mídia.
    Detecta automaticamente se file_path é:
      - data URI (base64) → envia como base64
      - URL http(s)       → envia como URL
      - outro             → lança erro claro
    """
    parsed = _extrair_data_uri(file_path)

    if parsed:
        b64_data, mime, tipo = parsed
        # tenta extrair nome do arquivo do base64 (não temos, usa genérico por tipo)
        ext_map = {
            "image": "imagem.jpg",
            "video": "video.mp4",
            "audio": "audio.mp3",
            "document": "documento.pdf",
        }
        nome = nome_arquivo or ext_map.get(tipo, "arquivo")
        return await _enviar_midia_base64_raw(numero, b64_data, tipo, nome, legenda)

    if file_path.startswith("http://") or file_path.startswith("https://"):
        # Detecta tipo pela extensão
        ext = file_path.split("?")[0].rsplit(".", 1)[-1].lower()
        tipo_map = {
            "jpg": "image", "jpeg": "image", "png": "image", "gif": "image", "webp": "image",
            "mp4": "video", "mov": "video", "avi": "video",
            "mp3": "audio", "ogg": "audio", "wav": "audio",
        }
        tipo = tipo_map.get(ext, "document")
        return await enviar_midia_url(numero, file_path, tipo, legenda, nome_arquivo)

    raise ValueError(
        f"file_path inválido: deve ser uma data URI (data:...) ou URL (http/https). "
        f"Recebido: '{str(file_path)[:80]}'"
    )


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


async def _enviar_midia_base64_raw(numero, base64_data, tipo, nome_arquivo, legenda=""):
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


# Mantém compatibilidade com código antigo
async def enviar_midia_base64(numero, base64_data, tipo, nome_arquivo, legenda=""):
    return await _enviar_midia_base64_raw(numero, base64_data, tipo, nome_arquivo, legenda)


async def resolver_contatos(q: str = "") -> list:
    q_norm = _normalizar(q)
    resultados = []

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                f"{EVOLUTION_URL}/group/fetchAllGroups/{INSTANCE}",
                headers=HEADERS,
                params={"getParticipants": "false"},
            )
            if r.status_code == 200:
                for g in r.json():
                    nome = g.get("subject", "")
                    if not q_norm or _match(q_norm, nome):
                        resultados.append({
                            "label": nome,
                            "value": g["id"],
                            "tipo": "grupo",
                        })
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
                for c in r.json():
                    nome = c.get("pushName") or ""
                    jid  = c.get("remoteJid", "")
                    if not nome or not jid:
                        continue
                    if not q_norm or _match(q_norm, nome):
                        resultados.append({
                            "label": nome,
                            "value": jid,
                            "tipo": "contato",
                        })
    except Exception:
        pass

    resultados.sort(key=lambda x: _normalizar(x["label"]))
    return resultados[:30]