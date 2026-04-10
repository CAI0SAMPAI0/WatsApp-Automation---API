import os
import sys
import shutil
import subprocess
from pathlib import Path

BASE_DIR = Path(__file__).parent

# ─────────────────────────────────────────────
ISCC_PATHS = [
    r"C:\Users\Caio\AppData\Local\Programs\Inno Setup 6\ISCC.exe",
    r"C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
    r"C:\Program Files\Inno Setup 6\ISCC.exe",
]
# ─────────────────────────────────────────────


def titulo(msg):
    print(f"\n{'═'*60}")
    print(f"  {msg}")
    print(f"{'═'*60}")


def ok(msg):   print(f"  [OK] {msg}")
def err(msg):  print(f"  [ERRO] {msg}")
def info(msg): print(f"  [--] {msg}")


def limpar():
    titulo("1/3 — Limpando temporários")
    pastas = ["build", "logs", "user_data", "perfil_bot_whatsapp",
              "temp_tasks", "scheduled_tasks", "__pycache__"]
    for p in pastas:
        caminho = BASE_DIR / p
        if caminho.exists():
            shutil.rmtree(caminho)
            ok(f"{p}/")
    arquivos = ["execution_count.txt", "last_run_path.txt",
                "erro_agendamento.log", "erro_fatal.txt"]
    for a in arquivos:
        caminho = BASE_DIR / a
        if caminho.exists():
            caminho.unlink()
            ok(a)


def compilar_exe():
    titulo("2/3 — Compilando com PyInstaller")

    # remove dist anterior
    dist = BASE_DIR / "dist"
    if dist.exists():
        shutil.rmtree(dist)
        info("dist/ removido")

    spec = BASE_DIR / "app.spec"
    if not spec.exists():
        err("app.spec não encontrado!")
        sys.exit(1)

    resultado = subprocess.run(
        [sys.executable, "-m", "PyInstaller", "--clean", str(spec)],
        cwd=str(BASE_DIR)
    )
    if resultado.returncode != 0:
        err("PyInstaller falhou. Verifique os erros acima.")
        sys.exit(1)

    exe = BASE_DIR / "dist" / "Study_Practices.exe"
    if not exe.exists():
        err(f"Executável não gerado em {exe}")
        sys.exit(1)

    tamanho = exe.stat().st_size / 1024 / 1024
    ok(f"Study_Practices.exe gerado ({tamanho:.1f} MB)")


def compilar_instalador():
    titulo("3/3 — Gerando instalador com Inno Setup")

    # encontra o ISCC.exe
    iscc = None
    for p in ISCC_PATHS:
        if Path(p).exists():
            iscc = p
            break

    if not iscc:
        err("Inno Setup não encontrado.")
        info("Instale com:  winget install JRSoftware.InnoSetup")
        info("Ou ajuste ISCC_PATHS no topo deste arquivo.")
        sys.exit(1)

    ok(f"Inno Setup encontrado: {iscc}")

    iss = BASE_DIR / "setup.iss"
    if not iss.exists():
        err("setup.iss não encontrado!")
        sys.exit(1)

    resultado = subprocess.run(
        [iscc, str(iss)],
        cwd=str(BASE_DIR)
    )
    if resultado.returncode != 0:
        err("Inno Setup falhou. Verifique os erros acima.")
        sys.exit(1)

    setup_exe = BASE_DIR / "dist" / "Study_Practices_Setup.exe"
    if setup_exe.exists():
        tamanho = setup_exe.stat().st_size / 1024 / 1024
        ok(f"Study_Practices_Setup.exe gerado ({tamanho:.1f} MB)")
    else:
        err("Setup.exe não encontrado após compilação.")
        sys.exit(1)


def main():
    titulo("BUILD — Study Practices")
    print(f"  Pasta: {BASE_DIR}")

    limpar()
    compilar_exe()
    compilar_instalador()

    titulo("BUILD CONCLUIDO")
    print(f"\n  Arquivos gerados em: {BASE_DIR / 'dist'}")
    print(f"  Study_Practices.exe         <- executavel direto")
    print(f"  Study_Practices_Setup.exe   <- instalador para distribuir\n")


if __name__ == "__main__":
    main()