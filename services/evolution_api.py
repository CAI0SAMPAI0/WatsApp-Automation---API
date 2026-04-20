import os
import requests
from dotenv import load_dotenv

load_dotenv()


class EvolutionAPI:
    def __init__(self):
        self.base_url = os.getenv("SERVER_URL", "http://localhost:8081").rstrip("/")
        self.api_key  = os.getenv("AUTHENTICATION_API_KEY", "")
        self.instance = os.getenv("EVOLUTION_INSTANCE", "default")
        self.headers  = {
            "apikey":       self.api_key,
            "Content-Type": "application/json",
        }

    # ── texto simples ──────────────────────────────────────────────────────
    def send_text(self, number: str, text: str) -> dict:
        r = requests.post(
            f"{self.base_url}/message/sendText/{self.instance}",
            headers=self.headers,
            json={"number": number, "text": text},
            timeout=30,
        )
        return r.json()

    # ── mídia (imagem / vídeo / documento) ────────────────────────────────
    def send_media(
        self,
        number: str,
        media_url: str,
        caption: str = "",
        media_type: str = "document",   # image | video | document | audio
    ) -> dict:
        r = requests.post(
            f"{self.base_url}/message/sendMedia/{self.instance}",
            headers=self.headers,
            json={
                "number":    number,
                "mediatype": media_type,
                "media":     media_url,
                "caption":   caption,
            },
            timeout=60,
        )
        return r.json()

    # ── detecta tipo de mídia pelo caminho ────────────────────────────────
    @staticmethod
    def guess_media_type(path: str) -> str:
        ext = os.path.splitext(path.lower())[1]
        if ext in (".jpg", ".jpeg", ".png", ".gif", ".webp"):
            return "image"
        if ext in (".mp4", ".avi", ".mov", ".mkv"):
            return "video"
        if ext in (".mp3", ".ogg", ".m4a", ".aac"):
            return "audio"
        return "document"

    # ── status da instância ───────────────────────────────────────────────
    def connection_state(self) -> dict:
        r = requests.get(
            f"{self.base_url}/instance/connectionState/{self.instance}",
            headers=self.headers,
            timeout=10,
        )
        return r.json()

    # ── verifica se está conectado ────────────────────────────────────────
    def is_connected(self) -> bool:
        try:
            state = self.connection_state()
            return state.get("instance", {}).get("state") == "open"
        except Exception:
            return False