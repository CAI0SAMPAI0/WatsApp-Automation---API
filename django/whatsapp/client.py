import requests
import logging
import base64
import mimetypes
from django.conf import settings

logger = logging.getLogger(__name__)


class EvolutionClient:
    """
    Client para Evolution API v2.
    Documentação: https://doc.evolution-api.com/v2/pt
    """

    def __init__(self):
        self.base_url = settings.EVOLUTION_API_URL.rstrip("/")
        self.api_key  = settings.EVOLUTION_API_KEY
        self.instance = settings.EVOLUTION_INSTANCE
        self.headers  = {
            "apikey": self.api_key,
            "Content-Type": "application/json",
        }

    def _url(self, path: str) -> str:
        return f"{self.base_url}/{path}"

    # ── STATUS DA INSTÂNCIA ───────────────────────────────────────────────

    def get_instance_status(self) -> dict:
        """Retorna o status da conexão. Se der 404, a instância não existe."""
        r = requests.get(
            self._url(f"instance/connectionState/{self.instance}"),
            headers=self.headers,
            timeout=10,
        )
        return r.json()

    def create_instance(self) -> dict:
        """Cria a instância no Evolution API."""
        r = requests.post(
            self._url("instance/create"),
            headers=self.headers,
            json={
                "instanceName": self.instance,
                "token": self.api_key,
                "qrcode": True
            },
            timeout=20
        )
        r.raise_for_status()
        return r.json()

    def get_qrcode(self) -> dict:
        """Retorna o QR Code para conectar o WhatsApp."""
        r = requests.get(
            self._url(f"instance/connect/{self.instance}"),
            headers=self.headers,
            timeout=15,
        )
        r.raise_for_status()
        return r.json()

    # ── CONTATOS ─────────────────────────────────────────────────────────

    def fetch_contacts(self) -> list[dict]:
        """
        Retorna todos os contatos salvos no WhatsApp do número conectado.
        Cada item tem: id (JID), pushName, profilePictureUrl
        """
        r = requests.post(
            self._url(f"chat/findContacts/{self.instance}"),
            headers=self.headers,
            json={},  # body vazio = retorna todos
            timeout=30,
        )
        r.raise_for_status()
        data = r.json()
        # A API retorna lista direta ou {"contacts": [...]}
        if isinstance(data, list):
            return data
        return data.get("contacts", [])

    def fetch_groups(self) -> list[dict]:
        """
        Retorna todos os grupos.
        Cada item tem: id (JID), subject (nome do grupo), participants
        """
        r = requests.get(
            self._url(f"group/fetchAllGroups/{self.instance}?getParticipants=false"),
            headers=self.headers,
            timeout=30,
        )
        r.raise_for_status()
        data = r.json()
        if isinstance(data, list):
            return data
        return data.get("groups", [])

    # ── ENVIO DE MENSAGENS ────────────────────────────────────────────────

    def send_text(self, jid: str, text: str) -> dict:
        """
        Envia mensagem de texto.
        jid: ex '5511999999999@s.whatsapp.net' ou '120363...@g.us'
        """
        r = requests.post(
            self._url(f"message/sendText/{self.instance}"),
            headers=self.headers,
            json={
                "number": jid,
                "text": text,
            },
            timeout=30,
        )
        r.raise_for_status()
        return r.json()

    def send_media_url(self, jid: str, media_url: str,
                       caption: str = "", media_type: str = "document") -> dict:
        """
        Envia arquivo via URL pública.
        media_type: 'image' | 'video' | 'audio' | 'document'
        """
        r = requests.post(
            self._url(f"message/sendMedia/{self.instance}"),
            headers=self.headers,
            json={
                "number": jid,
                "mediatype": media_type,
                "mimetype": self._guess_mimetype(media_url),
                "caption": caption,
                "media": media_url,
                "fileName": media_url.split("/")[-1],
            },
            timeout=60,
        )
        r.raise_for_status()
        return r.json()

    def send_media_base64(self, jid: str, file_path: str,
                          caption: str = "") -> dict:
        """
        Envia arquivo local convertido para base64.
        Usado quando o arquivo está no servidor Django (upload do usuário).
        """
        with open(file_path, "rb") as f:
            file_bytes = f.read()

        b64 = base64.b64encode(file_bytes).decode("utf-8")
        mimetype, _ = mimetypes.guess_type(file_path)
        mimetype = mimetype or "application/octet-stream"
        media_type = self._media_type_from_mime(mimetype)
        filename = file_path.split("/")[-1]

        r = requests.post(
            self._url(f"message/sendMedia/{self.instance}"),
            headers=self.headers,
            json={
                "number": jid,
                "mediatype": media_type,
                "mimetype": mimetype,
                "caption": caption,
                "media": b64,
                "fileName": filename,
                "encoding": True,  # indica que é base64
            },
            timeout=120,
        )
        r.raise_for_status()
        return r.json()

    # ── HELPERS ───────────────────────────────────────────────────────────

    @staticmethod
    def _guess_mimetype(url: str) -> str:
        mime, _ = mimetypes.guess_type(url)
        return mime or "application/octet-stream"

    @staticmethod
    def _media_type_from_mime(mimetype: str) -> str:
        if mimetype.startswith("image/"):
            return "image"
        if mimetype.startswith("video/"):
            return "video"
        if mimetype.startswith("audio/"):
            return "audio"
        return "document"

    @staticmethod
    def number_to_jid(number: str) -> str:
        """
        Converte número brasileiro para JID.
        '11999999999' → '5511999999999@s.whatsapp.net'
        '5511999999999' → '5511999999999@s.whatsapp.net'
        """
        n = "".join(filter(str.isdigit, number))
        if not n.startswith("55"):
            n = "55" + n
        return f"{n}@s.whatsapp.net"


# instância global — importar em qualquer lugar com:
# from whatsapp.client import evolution
evolution = EvolutionClient()
