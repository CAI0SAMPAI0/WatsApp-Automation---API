"""
core/paths.py
Caminhos base do app — funciona no Windows, Linux e Railway.
"""

import os
import sys


def get_app_base_dir() -> str:
    """
    Pasta raiz do app:
    - Executável PyInstaller → pasta do .exe
    - Desenvolvimento / Railway → pasta do repositório
    """
    if getattr(sys, "frozen", False):
        return os.path.dirname(os.path.abspath(sys.executable))
    return os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def get_user_data_dir() -> str:
    """Pasta de dados persistentes (banco SQLite, configs)."""
    base = get_app_base_dir()
    path = os.path.join(base, "user_data")
    os.makedirs(path, exist_ok=True)
    return path


def get_whatsapp_profile_dir() -> str:
    """
    Mantido por compatibilidade com código que ainda referencia esta função.
    No Railway não é mais utilizado (sem Playwright).
    """
    base = get_app_base_dir()
    path = os.path.join(base, "perfil_bot_whatsapp")
    os.makedirs(path, exist_ok=True)
    return path


def get_chrome_path() -> str:
    """
    Mantido por compatibilidade.
    Levanta FileNotFoundError no Railway (sem Chrome instalado).
    """
    caminhos = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    ]
    for c in caminhos:
        if os.path.exists(c):
            return c
    raise FileNotFoundError("Chrome/Edge não encontrado — não necessário no Railway.")