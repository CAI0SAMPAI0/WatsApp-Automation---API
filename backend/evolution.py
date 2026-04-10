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
    """Remove acentos, converte para minúsculo e elimina espaços extras."""
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
    """Verifica se query bate com candidato, ignorando acentos e capitalização."""
    return query_norm in _normalizar(candidato)


async def resolver_destino(nome_ou_numero: str, db_contacts=None) -> str:
    """
    Resolve um nome/número para o JID do WhatsApp.

    Ordem de prioridade:
      1. Já é número ou JID → retorna direto
      2. Busca exata nos contatos do banco (db_contacts)
      3. Busca parcial nos contatos do banco
      4. Busca exata nos grupos da Evolution API
      5. Busca parcial nos grupos da Evolution API
      6. Busca exata nos contatos da Evolution API
      7. Busca parcial nos contatos da Evolution API
      8. Retorna o valor original como fallback

    Args:
        nome_ou_numero: Nome do contato/grupo ou número de telefone
        db_contacts: Lista de objetos Contact do banco (opcional).
                     Cada item deve ter .name e .phone.
    """
    nome = nome_ou_numero.strip()

    # ── 1. Já é número ou JID ──────────────────────────────────────────────
    if "@" in nome or nome.replace("+", "").isdigit():
        return nome.replace("+", "")

    nome_norm = _normalizar(nome)

    # ── 2 & 3. Banco de dados local (mais rápido, sem chamada HTTP) ────────
    if db_contacts:
        # busca exata
        for c in db_contacts:
            if _normalizar(c.name) == nome_norm:
                logger.info(f"[resolver] Exato no banco: '{nome}' → {c.phone}")
                return c.phone
        # busca parcial
        for c in db_contacts:
            if nome_norm in _normalizar(c.name):
                logger.info(f"[resolver] Parcial no banco: '{nome}' → {c.phone}")
                return c.phone

    # ── 4 & 5. Grupos da Evolution ─────────────────────────────────────────
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                f"{EVOLUTION_URL}/group/fetchAllGroups/{INSTANCE}",
                headers=HEADERS,
                params={"getParticipants": "false"},
            )
            if r.status_code == 200:
                grupos = r.json()
                # exato
                for g in grupos:
                    if _normalizar(g.get("subject", "")) == nome_norm:
                        logger.info(f"[resolver] Grupo exato: '{nome}' → {g['id']}")
                        return g["id"]
                # parcial
                for g in grupos:
                    if _match(nome_norm, g.get("subject", "")):
                        logger.info(f"[resolver] Grupo parcial: '{nome}' → {g['id']}")
                        return g["id"]
    except Exception as e:
        logger.warning(f"[resolver] Falha ao buscar grupos: {e}")

    # ── 6 & 7. Contatos da Evolution ───────────────────────────────────────
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

    # ── 8. Fallback ────────────────────────────────────────────────────────
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


async def resolver_contatos(q: str = "") -> list:
    """Retorna contatos e grupos filtrados para autocomplete."""
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