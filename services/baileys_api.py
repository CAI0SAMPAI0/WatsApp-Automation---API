import os
import mimetypes
import requests
from pathlib import Path


class BaileysAPI:
    def __init__(self):
        self.base_url = os.getenv("BAILEYS_URL", "http://localhost:3000").rstrip("/")
        self.api_key  = os.getenv("BAILEYS_API_KEY", "minha-chave-secreta")
        self.headers  = {
            "x-api-key":    self.api_key,
            "Content-Type": "application/json",
        }

    # ── status ────────────────────────────────────────────────────────────
    def status(self) -> dict:
        r = requests.get(f"{self.base_url}/status", timeout=10)
        return r.json()

    def is_connected(self) -> bool:
        try:
            return self.status().get("connected", False)
        except Exception:
            return False

    # ── texto ─────────────────────────────────────────────────────────────
    def send_text(self, number: str, message: str) -> dict:
        r = requests.post(
            f"{self.base_url}/send/text",
            headers=self.headers,
            json={"number": number, "message": message},
            timeout=30,
        )
        return r.json()

    # ── mídia por URL ─────────────────────────────────────────────────────
    def send_media_url(
        self,
        number: str,
        media_url: str,
        caption: str = "",
        media_type: str = "document",
        filename: str = "",
        mimetype: str = "",
    ) -> dict:
        r = requests.post(
            f"{self.base_url}/send/media",
            headers=self.headers,
            json={
                "number":     number,
                "media_url":  media_url,
                "caption":    caption,
                "media_type": media_type,
                "filename":   filename,
                "mimetype":   mimetype,
            },
            timeout=60,
        )
        return r.json()

    # ── mídia por arquivo local (base64) ─────────────────────────────────
    def send_media_file(
        self,
        number: str,
        file_path: str,
        caption: str = "",
    ) -> dict:
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"Arquivo não encontrado: {file_path}")

        mime, _ = mimetypes.guess_type(str(path))
        mime     = mime or "application/octet-stream"
        media_type = self._guess_type(path.suffix.lower())

        import base64
        with open(path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode()

        r = requests.post(
            f"{self.base_url}/send/media",
            headers=self.headers,
            json={
                "number":       number,
                "media_base64": b64,
                "mimetype":     mime,
                "filename":     path.name,
                "caption":      caption,
                "media_type":   media_type,
            },
            timeout=120,
        )
        return r.json()

    # ── helper ────────────────────────────────────────────────────────────
    @staticmethod
    def _guess_type(ext: str) -> str:
        if ext in (".jpg", ".jpeg", ".png", ".gif", ".webp"):
            return "image"
        if ext in (".mp4", ".avi", ".mov", ".mkv"):
            return "video"
        if ext in (".mp3", ".ogg", ".m4a", ".aac"):
            return "audio"
        return "document"