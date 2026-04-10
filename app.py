import sys
import os

def _get_executor_json():
    """
    Lê --executor-json do sys.argv manualmente.
    argparse pode falhar com paths com espaços no Windows mesmo com aspas.
    """
    argv = sys.argv[1:]
    for i, arg in enumerate(argv):
        if arg == "--executor-json" and i + 1 < len(argv):
            return argv[i + 1]
        if arg.startswith("--executor-json="):
            return arg.split("=", 1)[1]
    return None

_EXECUTOR_JSON = _get_executor_json()

# Se estamos em modo executor, seta a variável e executa direto
if _EXECUTOR_JSON:
    os.environ["EXECUTOR_MODE"] = "1"
    # muda para o diretório base antes de qualquer import de core
    if getattr(sys, 'frozen', False):
        os.chdir(os.path.dirname(os.path.abspath(sys.executable)))
    else:
        os.chdir(os.path.dirname(os.path.abspath(__file__)))

    import io
    if sys.stdout and hasattr(sys.stdout, "buffer"):
        try:
            sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
        except Exception:
            pass
    if sys.stderr and hasattr(sys.stderr, "buffer"):
        try:
            sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")
        except Exception:
            pass

    # importa e executa — nenhum import de UI aconteceu até aqui
    sys.path.insert(0, os.getcwd())
    from executor import main as executor_main
    executor_main(_EXECUTOR_JSON)
    sys.exit(0)

# ── MODO GUI ─────────────────────────────────────────────────────────────────
# Só chega aqui se NÃO for modo executor
import multiprocessing

if __name__ == "__main__":
    multiprocessing.freeze_support()

    import io
    from datetime import datetime

    # stdout UTF-8
    if sys.stdout and hasattr(sys.stdout, "buffer"):
        try:
            sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
        except Exception:
            pass

    from core.paths import get_app_base_dir, get_whatsapp_profile_dir

    BASE_DIR    = get_app_base_dir()
    PROFILE_DIR = get_whatsapp_profile_dir()
    os.chdir(BASE_DIR)

    with open(os.path.join(BASE_DIR, "last_run_path.txt"), "a") as f:
        f.write(f"{datetime.now()}: Rodando em {BASE_DIR} | Perfil: {PROFILE_DIR}\n")

    try:
        from ui.main_window import App
        app = App()
        app.mainloop()
    except Exception as e:
        import traceback
        with open(os.path.join(BASE_DIR, "erro_fatal.txt"), "a", encoding="utf-8") as f:
            f.write(f"[{datetime.now()}] {traceback.format_exc()}\n")
        raise