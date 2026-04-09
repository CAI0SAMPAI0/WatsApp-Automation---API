"""
notifier.py — Notificações quando o agente reporta um erro

Suporta dois canais configuráveis via variável de ambiente:
  - Email (SMTP — Gmail funciona bem)
  - Webhook genérico (Discord, Slack, ou qualquer POST)

Configure no Railway:
  NOTIFY_EMAIL_TO=seu@email.com
  NOTIFY_SMTP_HOST=smtp.gmail.com
  NOTIFY_SMTP_PORT=587
  NOTIFY_SMTP_USER=seu@gmail.com
  NOTIFY_SMTP_PASS=sua_app_password_gmail

  NOTIFY_WEBHOOK_URL=https://discord.com/api/webhooks/...  (opcional)
"""

import os
import smtplib
import logging
import httpx
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime

logger = logging.getLogger(__name__)

# ── configuração via env ──────────────────────────────────────────────────────
EMAIL_TO      = os.environ.get("NOTIFY_EMAIL_TO", "")
SMTP_HOST     = os.environ.get("NOTIFY_SMTP_HOST", "smtp.gmail.com")
SMTP_PORT     = int(os.environ.get("NOTIFY_SMTP_PORT", 587))
SMTP_USER     = os.environ.get("NOTIFY_SMTP_USER", "")
SMTP_PASS     = os.environ.get("NOTIFY_SMTP_PASS", "")
WEBHOOK_URL   = os.environ.get("NOTIFY_WEBHOOK_URL", "")
APP_URL       = os.environ.get("APP_URL", "https://seu-app.railway.app")


# ── email ─────────────────────────────────────────────────────────────────────
def send_error_email(
    client_name: str,
    error_type: str,
    traceback: str,
    agent_version: str,
    error_id: int,
    task_target: str = "",
):
    if not all([EMAIL_TO, SMTP_USER, SMTP_PASS]):
        logger.warning("Email não configurado — erro não notificado por email")
        return

    subject = f"[WhatsApp Bot] Erro reportado — {client_name}"

    body = f"""
<h2>⚠️ Erro no agente do cliente</h2>

<table style="border-collapse:collapse;width:100%">
  <tr><td><b>Cliente</b></td><td>{client_name}</td></tr>
  <tr><td><b>Tipo de erro</b></td><td>{error_type or 'Desconhecido'}</td></tr>
  <tr><td><b>Versão do agente</b></td><td>{agent_version or '?'}</td></tr>
  <tr><td><b>Contato alvo</b></td><td>{task_target or '—'}</td></tr>
  <tr><td><b>Data/hora</b></td><td>{datetime.now().strftime('%d/%m/%Y %H:%M:%S')}</td></tr>
</table>

<h3>Traceback</h3>
<pre style="background:#f5f5f5;padding:12px;border-radius:6px;font-size:12px">{traceback or 'Não disponível'}</pre>

<p>
  <a href="{APP_URL}/admin/errors/{error_id}" 
     style="background:#7c5ce0;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">
    Ver erro no painel →
  </a>
</p>

<p style="color:#888;font-size:12px">
  Após corrigir e fazer deploy, marque o erro como resolvido no painel.
  O agente do cliente vai atualizar automaticamente.
</p>
"""

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = SMTP_USER
    msg["To"]      = EMAIL_TO
    msg.attach(MIMEText(body, "html"))

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(SMTP_USER, EMAIL_TO, msg.as_string())
        logger.info(f"Email de erro enviado para {EMAIL_TO}")
    except Exception as e:
        logger.error(f"Falha ao enviar email: {e}")


# ── webhook (Discord/Slack/genérico) ─────────────────────────────────────────
async def send_error_webhook(
    client_name: str,
    error_type: str,
    agent_version: str,
    error_id: int,
):
    if not WEBHOOK_URL:
        return

    # formato Discord — se for outro webhook, adapte o payload
    payload = {
        "embeds": [{
            "title": "⚠️ Erro no agente WhatsApp",
            "color": 0xe05252,
            "fields": [
                {"name": "Cliente",        "value": client_name,          "inline": True},
                {"name": "Tipo de erro",   "value": error_type or "?",    "inline": True},
                {"name": "Versão agente",  "value": agent_version or "?", "inline": True},
            ],
            "footer": {"text": f"ID do erro: {error_id}"},
            "timestamp": datetime.utcnow().isoformat(),
        }]
    }

    try:
        async with httpx.AsyncClient() as client:
            await client.post(WEBHOOK_URL, json=payload, timeout=10)
    except Exception as e:
        logger.error(f"Falha ao enviar webhook: {e}")


# ── notificação de erro resolvido (opcional) ──────────────────────────────────
def send_resolved_email(client_name: str, new_version: str):
    """
    Chamado quando você marca um erro como resolvido e sobe nova versão.
    Opcional — pode ignorar por enquanto.
    """
    if not all([EMAIL_TO, SMTP_USER, SMTP_PASS]):
        return

    subject = f"[WhatsApp Bot] Erro corrigido — {new_version} disponível"
    body = f"""
<h2>✅ Erro corrigido</h2>
<p>A versão <b>{new_version}</b> está disponível.</p>
<p>O agente de <b>{client_name}</b> vai atualizar automaticamente no próximo ciclo (até 1 minuto).</p>
<p>Após a atualização, o cliente pode tentar o reenvio.</p>
"""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = SMTP_USER
    msg["To"]      = EMAIL_TO
    msg.attach(MIMEText(body, "html"))

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(SMTP_USER, EMAIL_TO, msg.as_string())
    except Exception as e:
        logger.error(f"Falha ao enviar email de resolução: {e}")