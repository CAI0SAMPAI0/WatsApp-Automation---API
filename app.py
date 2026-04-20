"""
app.py — Entrypoint no Railway (sem UI, sem Playwright).
Inicia o scheduler APScheduler e mantém o processo vivo.
"""

import os
import sys
import time
import signal
import logging

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("app")


def main():
    from core.db        import get_db
    from core.scheduler import get_scheduler, shutdown

    logger.info("=" * 60)
    logger.info("Study Practices — iniciando no Railway")
    logger.info("=" * 60)

    # inicializa banco
    db = get_db()
    logger.info("Banco de dados OK.")

    # inicia o scheduler (APScheduler em background)
    sched = get_scheduler()
    logger.info("Scheduler iniciado.")

    # encerramento limpo com SIGTERM (Railway envia isso ao fazer deploy)
    def _shutdown(sig, frame):
        logger.info("Sinal recebido, encerrando...")
        shutdown()
        sys.exit(0)

    signal.signal(signal.SIGTERM, _shutdown)
    signal.signal(signal.SIGINT,  _shutdown)

    logger.info("Aguardando tarefas agendadas... (Ctrl+C para encerrar)")
    while True:
        time.sleep(30)


if __name__ == "__main__":
    main()