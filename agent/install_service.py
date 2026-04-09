"""
install_service.py — Instala/desinstala o agente como serviço do Windows

Execute como Administrador:

  # instalar e iniciar
  python install_service.py install
  python install_service.py start

  # parar e desinstalar
  python install_service.py stop
  python install_service.py remove

  # verificar status
  python install_service.py status

Quando compilado como exe (PyInstaller):
  agent.exe install
  agent.exe start
"""

import sys
import os
import subprocess
from pathlib import Path


def run_sc(args: list) -> tuple[int, str]:
    """Executa um comando sc.exe e retorna (returncode, output)."""
    result = subprocess.run(
        ["sc"] + args,
        capture_output=True,
        text=True,
        encoding="cp850",
        errors="replace",
    )
    return result.returncode, result.stdout + result.stderr


def install(exe_path: str):
    print(f"Instalando serviço WhatsAppAgent...")
    print(f"Executável: {exe_path}")

    code, out = run_sc([
        "create", "WhatsAppAgent",
        "binPath=", f'"{exe_path}" service-run',
        "DisplayName=", "WhatsApp Bot Agent",
        "start=", "auto",          # inicia com o Windows
        "obj=", "LocalSystem",
    ])

    if code != 0:
        print(f"❌ Falha ao criar serviço: {out}")
        return False

    # configura descrição
    run_sc(["description", "WhatsAppAgent",
            "Agente local de automacao WhatsApp"])

    # configura restart automático em caso de falha
    run_sc([
        "failure", "WhatsAppAgent",
        "reset=", "86400",
        "actions=", "restart/5000/restart/10000/restart/30000"
    ])

    print("✅ Serviço instalado com sucesso")
    return True


def start():
    print("Iniciando serviço WhatsAppAgent...")
    code, out = run_sc(["start", "WhatsAppAgent"])
    if code != 0 and "already running" not in out.lower():
        print(f"❌ Falha: {out}")
        return False
    print("✅ Serviço iniciado")
    return True


def stop():
    print("Parando serviço WhatsAppAgent...")
    code, out = run_sc(["stop", "WhatsAppAgent"])
    if code != 0 and "not started" not in out.lower() and "1062" not in out:
        print(f"⚠️ {out}")
    else:
        print("✅ Serviço parado")
    return True


def remove():
    stop()
    import time; time.sleep(2)
    print("Removendo serviço WhatsAppAgent...")
    code, out = run_sc(["delete", "WhatsAppAgent"])
    if code != 0:
        print(f"❌ Falha: {out}")
        return False
    print("✅ Serviço removido")
    return True


def status():
    code, out = run_sc(["query", "WhatsAppAgent"])
    print(out)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return

    cmd = sys.argv[1].lower()

    # quando o pyinstaller compila, o exe usa este entry point
    if cmd == "service-run":
        # chamado pelo Windows Service Manager — inicia o agente via pywin32
        from agent import WhatsAppAgentService, WIN32_AVAILABLE
        if WIN32_AVAILABLE:
            import win32serviceutil
            win32serviceutil.HandleCommandLine(WhatsAppAgentService)
        else:
            from agent import run_agent
            run_agent()
        return

    # verifica admin
    if cmd in ("install", "remove", "start", "stop"):
        import ctypes
        if not ctypes.windll.shell32.IsUserAnAdmin():
            print("❌ Execute como Administrador (clique direito → Executar como administrador)")
            sys.exit(1)

    if cmd == "install":
        exe = Path(sys.executable) if getattr(sys, 'frozen', False) else Path(__file__).parent / "agent.exe"
        install(str(exe.absolute()))
    elif cmd == "start":
        start()
    elif cmd == "stop":
        stop()
    elif cmd == "remove":
        remove()
    elif cmd == "status":
        status()
    else:
        print(f"Comando desconhecido: {cmd}")
        print("Use: install | start | stop | remove | status")


if __name__ == "__main__":
    main()