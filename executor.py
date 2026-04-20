import sys
import os
import json
from pathlib import Path
from datetime import datetime

os.environ["EXECUTOR_MODE"] = "1"

# ── encoding UTF-8 ────────────────────────────────────────────────────────
if sys.platform == "win32":
    for _s in (sys.stdout, sys.stderr):
        if _s:
            try:
                _s.reconfigure(encoding="utf-8")
            except AttributeError:
                import io
                if _s is sys.stdout:
                    sys.stdout = io.TextIOWrapper(_s.buffer, encoding="utf-8", errors="replace")
                else:
                    sys.stderr = io.TextIOWrapper(_s.buffer, encoding="utf-8", errors="replace")

# ── base dir ──────────────────────────────────────────────────────────────
if getattr(sys, "frozen", False):
    BASE_DIR = Path(sys.executable).parent.absolute()
else:
    BASE_DIR = Path(__file__).parent.absolute()

sys.path.insert(0, str(BASE_DIR))

from core.db      import get_db
from core.logger  import get_logger
from services.evolution_api import EvolutionAPI


# ── envio via Evolution API ───────────────────────────────────────────────
def executar_via_api(dados: dict, logger) -> dict:
    """
    Envia uma mensagem usando a Evolution API.
    Suporta: text | file | file_text
    """
    api     = EvolutionAPI()
    target  = dados["target"].strip()
    mode    = dados["mode"]
    message = (dados.get("message") or "").strip()
    file_path = dados.get("file_path") or None

    logger.info(f"Enviando para '{target}' | modo={mode}")

    if not api.is_connected():
        raise RuntimeError(
            "Instância Evolution API não está conectada. "
            "Verifique a variável EVOLUTION_INSTANCE e o QR Code."
        )

    if mode == "text":
        if not message:
            raise ValueError("Mensagem vazia para modo 'text'")
        result = api.send_text(target, message)

    elif mode == "file":
        if not file_path:
            raise ValueError("file_path vazio para modo 'file'")
        media_type = EvolutionAPI.guess_media_type(file_path)
        result = api.send_media(target, file_path, media_type=media_type)

    else:  # file_text
        if not file_path:
            raise ValueError("file_path vazio para modo 'file_text'")
        media_type = EvolutionAPI.guess_media_type(file_path)
        result = api.send_media(target, file_path, caption=message, media_type=media_type)

    # Evolution API retorna campo "error" ou "key" quando ok
    if "error" in result and result["error"]:
        raise RuntimeError(f"Evolution API error: {result}")

    logger.info(f"Enviado com sucesso para '{target}': {result}")
    return result


# ── envio em lote ─────────────────────────────────────────────────────────
def executar_lote(itens: list, logger) -> int:
    """
    Envia para todos os itens do lote via Evolution API.
    Retorna a contagem de envios bem-sucedidos.
    """
    ok_count = 0
    for i, item in enumerate(itens):
        try:
            executar_via_api(item, logger)
            ok_count += 1
            logger.info(f"[OK] {i+1}/{len(itens)} — '{item.get('target')}'")
        except Exception as e:
            logger.error(f"[ERRO] {i+1}/{len(itens)} — '{item.get('target')}': {e}")
    return ok_count


# ── main ──────────────────────────────────────────────────────────────────
def main(json_path: str):
    log_dir = BASE_DIR / "logs" / datetime.now().strftime("%Y-%m-%d")
    log_dir.mkdir(parents=True, exist_ok=True)

    task_name = Path(json_path).stem
    logger    = get_logger(task_name, log_dir / f"{task_name}.log")

    logger.info("=" * 70)
    logger.info(f"EXECUTOR INICIADO | JSON: {json_path}")

    task_id = None
    db      = get_db()

    try:
        with open(json_path, "r", encoding="utf-8") as f:
            dados = json.load(f)

        task_id = dados.get("task_id")
        logger.info(f"Task ID: {task_id}")

        if task_id:
            db.atualizar_status(task_id, "running")

        # ── modo lote ──────────────────────────────────────────────────
        if dados.get("lote") and dados.get("itens"):
            itens    = dados["itens"]
            logger.info(f"Modo LOTE: {len(itens)} itens")
            ok_count = executar_lote(itens, logger)

            if task_id:
                status = "completed" if ok_count == len(itens) else "failed"
                db.atualizar_status(task_id, status)

            logger.info(f"[OK] LOTE CONCLUÍDO: {ok_count}/{len(itens)}")
            logger.info("=" * 70)
            sys.exit(0 if ok_count > 0 else 1)

        # ── modo simples ───────────────────────────────────────────────
        executar_via_api(dados, logger)

        if task_id:
            db.atualizar_status(task_id, "completed")

        logger.info("[OK] TAREFA CONCLUÍDA COM SUCESSO")
        logger.info("=" * 70)
        sys.exit(0)

    except Exception as e:
        import traceback
        erro = traceback.format_exc()
        logger.error("[ERRO] ERRO NA EXECUÇÃO:")
        logger.error(erro)

        if task_id:
            db.registrar_erro(task_id, str(e))

        status_file = Path(json_path).with_suffix(".status")
        status_file.write_text(f"FAILED: {e}", encoding="utf-8")

        sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: executor.py <caminho_para_task.json>")
        sys.exit(2)
    main(sys.argv[1])