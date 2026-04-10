import sys
import os

os.environ["EXECUTOR_MODE"] = "1"

if sys.platform == 'win32':
    if sys.stdout:
        try:
            sys.stdout.reconfigure(encoding='utf-8')
        except AttributeError:
            import io
            sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    
    if sys.stderr:
        try:
            sys.stderr.reconfigure(encoding='utf-8')
        except AttributeError:
            import io
            sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

import json
from pathlib import Path
from datetime import datetime

if getattr(sys, 'frozen', False):
    BASE_DIR = Path(sys.executable).parent.absolute()
else:
    BASE_DIR = Path(__file__).parent.absolute()

sys.path.insert(0, str(BASE_DIR))

from core.db import get_db
from core.automation import executar_envio, contador_execucao
from core.logger import get_logger
from core.paths import get_whatsapp_profile_dir


def _executar_lote(itens, profile_dir, logger):
    """
    Abre o WhatsApp UMA vez e envia para todos os itens em sequência.

    ── CORREÇÃO ──
    Substituída a lógica manual de busca+Enter pelo helper
    _abrir_conversa() de core.automation, que clica no primeiro
    resultado da lista em vez de depender do Enter.
    """
    import time
    import pyperclip
    from core.automation import (
        iniciar_driver,
        enviar_arquivo_com_mensagem,
        _abrir_conversa,          # ← helper corrigido
    )

    # Seletores para limpar a search box entre envios
    SELETORES_SEARCH = [
        'input[data-tab="3"]',
        '#_r_9_',
        'input[aria-label="Pesquisar ou começar uma nova conversa"]',
        'input[aria-label="Search or start new chat"]',
        'div[contenteditable="true"][data-tab="3"]',
    ]

    def _reset_search_box():
        """Volta para a search box limpa após cada envio."""
        try:
            page.keyboard.press("Escape")
            time.sleep(0.3)
        except Exception:
            pass
        for sel in SELETORES_SEARCH:
            try:
                el = page.locator(sel).first
                el.wait_for(state='visible', timeout=5000)
                el.click()
                time.sleep(0.2)
                page.keyboard.press("Control+a")
                time.sleep(0.1)
                page.keyboard.press("Delete")
                time.sleep(0.2)
                try:
                    val = el.input_value()
                    if val:
                        el.fill("")
                        time.sleep(0.1)
                except Exception:
                    pass
                return el
            except Exception:
                continue
        return None

    ok_count = 0
    pw = context = page = None

    try:
        pw, context, page = iniciar_driver(profile_dir, modo_execucao='background', logger=logger)

        for i, item in enumerate(itens):
            target    = item["target"].strip()
            mode      = item["mode"]
            message   = item.get("message", "").strip()
            file_path = item.get("file_path") or None

            try:
                # Limpa a search box a partir do 2º item
                if i > 0:
                    time.sleep(1.0)
                    _reset_search_box()
                    time.sleep(0.5)

                # ── usa o helper corrigido (clica no 1º resultado) ──
                _abrir_conversa(page, target, logger)

                if mode == "text":
                    chat_box = page.locator('div[contenteditable="true"][data-tab="10"]')
                    chat_box.wait_for(state="visible", timeout=12000)
                    chat_box.click(force=True)
                    pyperclip.copy(message)
                    page.keyboard.press("Control+V")
                    time.sleep(0.3)
                    page.keyboard.press("Enter")
                    time.sleep(3.0)
                else:
                    enviar_arquivo_com_mensagem(page, file_path, message, logger)

                ok_count += 1
                logger.info(f"[OK] Enviado para '{target}' ({ok_count}/{len(itens)})")

            except Exception as e:
                logger.error(f"[ERRO] Falha em '{target}': {str(e)}")

    except Exception as e:
        logger.error(f"[ERRO] Falha geral no lote: {str(e)}")
    finally:
        try:
            if context:
                for p in context.pages:
                    try: p.close()
                    except: pass
        except: pass
        if pw:
            try: pw.stop()
            except: pass

    return ok_count


def main(json_path: str):
    """
    Executa uma tarefa a partir de arquivo JSON.
    """
    if sys.stdout:
        try:
            sys.stdout.reconfigure(encoding='utf-8')
        except:
            pass
    
    log_dir = BASE_DIR / "logs" / datetime.now().strftime("%Y-%m-%d")
    log_dir.mkdir(parents=True, exist_ok=True)
    
    task_name = Path(json_path).stem
    logger = get_logger(task_name, log_dir / f"{task_name}.log")
    
    logger.info("=" * 70)
    logger.info(f"EXECUTOR INICIADO | JSON: {json_path}")
    logger.info(f"BASE_DIR: {BASE_DIR}")
    logger.info(f"sys.executable: {sys.executable}")
    logger.info(f"frozen: {getattr(sys, 'frozen', False)}")
    
    task_id = None
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            dados = json.load(f)
        
        task_id = dados.get("task_id")
        logger.info(f"Task ID: {task_id}")

        # ── modo lote ──────────────────────────────────────────────────
        if dados.get("lote") and dados.get("itens"):
            logger.info(f"Modo LOTE: {len(dados['itens'])} itens")
            db = get_db()
            if task_id:
                db.atualizar_status(task_id, "running")

            profile_dir = get_whatsapp_profile_dir()
            ok_count = _executar_lote(dados["itens"], profile_dir, logger)

            if task_id:
                status = "completed" if ok_count == len(dados["itens"]) else "failed"
                db.atualizar_status(task_id, status)
            contador_execucao(True)

            logger.info(f"[OK] LOTE CONCLUIDO: {ok_count}/{len(dados['itens'])}")
            logger.info("=" * 70)
            sys.exit(0 if ok_count > 0 else 1)

        # ── modo simples ───────────────────────────────────────────────
        modo_execucao = 'manual' if task_id is None else 'auto'
        
        db = get_db()
        if task_id:
            db.atualizar_status(task_id, "running")
        
        profile_dir = get_whatsapp_profile_dir()
        logger.info(f"Perfil: {profile_dir}")
        logger.info(f"Modo: {modo_execucao}")
        
        executar_envio(
            userdir=profile_dir,
            target=dados["target"],
            mode=dados["mode"],
            message=dados.get("message"),
            file_path=dados.get("file_path"),
            logger=logger,
            modo_execucao=modo_execucao
        )
        
        if task_id:
            db.atualizar_status(task_id, "completed")
        contador_execucao(True)
        
        logger.info("[OK] TAREFA CONCLUIDA COM SUCESSO")
        logger.info("=" * 70)
        sys.exit(0)
        
    except Exception as e:
        import traceback
        erro = traceback.format_exc()
        
        logger.error("[ERRO] ERRO NA EXECUCAO:")
        logger.error(erro)
        
        if task_id:
            db = get_db()
            db.registrar_erro(task_id, str(e))
        
        status_file = Path(json_path).with_suffix('.status')
        with open(status_file, 'w', encoding='utf-8') as f:
            f.write(f"FAILED: {str(e)}")
        
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: executor.py <caminho_para_task.json>")
        print("Este script NÃO deve ser executado diretamente.")
        print("Use o Study_Practices.exe para interface gráfica.")
        sys.exit(2)
    
    main(sys.argv[1])