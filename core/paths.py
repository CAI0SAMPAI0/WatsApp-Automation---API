import os
import sys

def get_app_base_dir():
    """
    Retorna SEMPRE a pasta onde o executável está,
    independente de como o Windows chama o processo.
    """
    if getattr(sys, 'frozen', False):
        # Executável: usa o diretório do .exe
        return os.path.dirname(os.path.abspath(sys.executable))
    else:
        # Desenvolvimento: raiz do projeto
        return os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

def get_user_data_dir():
    """
    Pasta de dados do usuário (banco, configs)
    """
    base = get_app_base_dir()
    path = os.path.join(base, "user_data")
    os.makedirs(path, exist_ok=True)
    return path

def get_whatsapp_profile_dir(modo='gui'):
    """
    Retorna perfil SEPARADO para GUI e agendador.
    
    Args:
        modo: 'gui' ou 'scheduler'
    
    Returns:
        Path absoluto do perfil
    
    IMPORTANTE: Cada modo tem seu próprio QR Code.
    - GUI: Login uma vez, mantém sessão
    - Scheduler: Login separado (não conflita)
    """
    base = get_app_base_dir()
    profile = os.path.join(base, "perfil_bot_whatsapp")
    os.makedirs(profile, exist_ok=True)
    return profile

def get_chrome_path():
    """
    Busca o executável do Chrome ou Edge no sistema
    """
    caminhos = [
        r"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        r"C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        r"C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    ]
    for c in caminhos:
        if os.path.exists(c):
            return c
    raise FileNotFoundError("Chrome/Edge não encontrado no sistema")