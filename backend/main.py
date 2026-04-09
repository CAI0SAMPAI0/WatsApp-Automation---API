"""
Grupos de rotas:
  /auth        → login, geração de token
  /admin       → criar clientes, gerenciar versões (só você, via X-Admin-Key)
  /agent       → endpoints que o agente local consome
  /panel       → endpoints que o painel web consome
"""
from dotenv import load_dotenv
load_dotenv()

import logging
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import FastAPI, Depends, HTTPException, Header, status, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import and_
import os as os_module

from database import (
    init_db, get_db,
    Client, Task, ErrorReport, AgentVersion,
    TaskStatus, SendMode
)
from schemas import (
    TokenOut, LoginIn,
    ClientCreate, ClientOut,
    TaskCreate, TaskUpdate, TaskStatusUpdate, TaskOut, PendingTasksResponse,
    ErrorReportCreate, ErrorReportOut,
    AgentVersionCreate, AgentVersionOut,
    DashboardStats, SendNowRequest
)
from auth import (
    generate_secret_key, hash_secret, verify_secret,
    create_access_token, get_current_client,
    ADMIN_KEY
)
from notifier import send_error_email, send_error_webhook, send_resolved_email

# ── app ───────────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="WhatsApp Bot API",
    description="Backend do sistema híbrido de automação WhatsApp",
    version="1.0.0",
)

import traceback
from fastapi import Request
from fastapi.responses import JSONResponse

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    tb = traceback.format_exc()
    print("ERRO INTERNO:\n", tb)
    return JSONResponse(status_code=500, content={"detail": str(exc), "traceback": tb})

# CORS — permite o painel web (Vercel) chamar a API
# Em produção, troque "*" pelo domínio real do seu frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Servir arquivos estáticos (HTML/CSS/JS) ─────────────────────────────────
ui_path = os_module.path.join(os_module.path.dirname(__file__), "..", "ui", "web")
if os_module.path.exists(ui_path):
    app.mount("/", StaticFiles(directory=ui_path, html=True), name="static")
    logger.info(f"✅ UI estática montada em /manage → {ui_path}")
else:
    logger.warning(f"⚠️  Pasta UI não encontrada: {ui_path}")

# ── helper: verificar admin key ───────────────────────────────────────────────
def check_admin(x_admin_key: str = Header(None)):
    print(f"DEBUG admin key recebida: '{x_admin_key}' | esperada: '{ADMIN_KEY}'")
    if x_admin_key != ADMIN_KEY:
        raise HTTPException(status_code=403, detail="Admin key inválida")


# ══════════════════════════════════════════════════════════════════════════════
#  AUTH
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/auth/token", response_model=TokenOut, tags=["auth"])
def login(payload: LoginIn, db: Session = Depends(get_db)):
    """
    O agente chama isso ao iniciar para obter/renovar o JWT.
    Credenciais: email + secret_key (configurados no .env do agente).
    """
    client = db.query(Client).filter(
        Client.email == payload.email,
        Client.is_active == True
    ).first()

    if not client or not verify_secret(payload.secret_key, client.secret_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciais inválidas"
        )

    token = create_access_token(client.id, client.email)
    return {"access_token": token}


# ══════════════════════════════════════════════════════════════════════════════
#  ADMIN — só você acessa (via /docs ou curl)
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/admin/clients", response_model=dict, tags=["admin"])
def create_client(
    payload: ClientCreate,
    db: Session = Depends(get_db),
    x_admin_key: str = Header(None),
):
    if x_admin_key != ADMIN_KEY:
        raise HTTPException(status_code=403, detail="Admin key inválida")
    
    existing = db.query(Client).filter(Client.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email já cadastrado")

    raw_secret = payload.password
    client = Client(
        name=payload.name,
        email=payload.email,
        secret_key=hash_secret(raw_secret),
    )
    db.add(client)
    db.commit()
    db.refresh(client)

    return {
        "id": client.id,
        "name": client.name,
        "email": client.email,
        "secret_key": raw_secret,   # ← mostre só aqui, nunca mais
        "message": "Guarde o secret_key — configure no .env do agente"
    }


@app.get("/admin/clients", response_model=List[ClientOut], tags=["admin"])
def list_clients(
    db: Session = Depends(get_db),
    _: None = Depends(check_admin),
):
    return db.query(Client).all()


@app.patch("/admin/clients/{client_id}/deactivate", tags=["admin"])
def deactivate_client(
    client_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(check_admin),
):
    """Revoga o acesso de um cliente (token para de funcionar imediatamente)."""
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    client.is_active = False
    db.commit()
    return {"ok": True}


@app.post("/admin/versions", response_model=dict, tags=["admin"])
def create_version(
    payload: AgentVersionCreate,
    db: Session = Depends(get_db),
    _: None = Depends(check_admin),
):
    """
    Registra nova versão do agente.
    Após subir o novo exe no link, chame esse endpoint.
    Todos os agentes vão detectar e se atualizar no próximo ciclo.
    """
    # marca versões anteriores como não-current
    db.query(AgentVersion).update({"is_current": False})

    version = AgentVersion(
        version=payload.version,
        download_url=payload.download_url,
        changelog=payload.changelog,
        is_current=True,
    )
    db.add(version)
    db.commit()
    db.refresh(version)

    return {
        "ok": True,
        "version": version.version,
        "message": f"Versão {version.version} definida como atual. Agentes vão atualizar em até 1 minuto."
    }


@app.get("/admin/errors", response_model=List[ErrorReportOut], tags=["admin"])
def list_errors(
    resolved: Optional[bool] = None,
    db: Session = Depends(get_db),
    _: None = Depends(check_admin),
):
    """Lista erros reportados pelos agentes. resolved=false para ver só os abertos."""
    q = db.query(ErrorReport)
    if resolved is not None:
        q = q.filter(ErrorReport.is_resolved == resolved)
    return q.order_by(ErrorReport.created_at.desc()).all()


@app.patch("/admin/errors/{error_id}/resolve", tags=["admin"])
def resolve_error(
    error_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(check_admin),
):
    """
    Marca um erro como resolvido.
    O painel do cliente vai mostrar "Corrigido — tente reenviar".
    """
    error = db.query(ErrorReport).filter(ErrorReport.id == error_id).first()
    if not error:
        raise HTTPException(status_code=404, detail="Erro não encontrado")

    error.is_resolved = True
    error.resolved_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


@app.get("/admin/stats", response_model=DashboardStats, tags=["admin"])
def admin_stats(
    db: Session = Depends(get_db),
    _: None = Depends(check_admin),
):
    total    = db.query(Task).count()
    pending  = db.query(Task).filter(Task.status == TaskStatus.pending).count()
    completed= db.query(Task).filter(Task.status == TaskStatus.completed).count()
    failed   = db.query(Task).filter(Task.status == TaskStatus.failed).count()
    errors   = db.query(ErrorReport).filter(ErrorReport.is_resolved == False).count()
    return DashboardStats(
        total_tasks=total, pending=pending, completed=completed,
        failed=failed, unresolved_errors=errors
    )


# ══════════════════════════════════════════════════════════════════════════════
#  AGENT — consumido pelo agente local
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/agent/version", response_model=AgentVersionOut, tags=["agent"])
def check_version(
    x_agent_version: str = Header("0.0.0"),
    client: Client = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """
    O agente checa isso a cada ciclo (ex: a cada 60s).
    Se needs_update=True, baixa o exe em download_url e reinicia.
    """
    current = db.query(AgentVersion).filter(
        AgentVersion.is_current == True
    ).first()

    if not current:
        raise HTTPException(status_code=404, detail="Nenhuma versão registrada")

    # comparação semântica simples: transforma "1.0.5" em (1, 0, 5)
    def parse_ver(v: str):
        try:
            return tuple(int(x) for x in v.strip().split("."))
        except Exception:
            return (0, 0, 0)

    needs_update = parse_ver(x_agent_version) < parse_ver(current.version)

    return AgentVersionOut(
        version=current.version,
        download_url=current.download_url,
        changelog=current.changelog,
        needs_update=needs_update,
    )


@app.get("/agent/tasks/pending", response_model=PendingTasksResponse, tags=["agent"])
def get_pending_tasks(
    client: Client = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """
    O agente busca isso a cada ciclo.
    Retorna tasks que devem ser executadas agora:
      - status = pending
      - scheduled_time <= agora + 60s (margem para latência de rede)
    """
    now = datetime.utcnow()
    margin = now + timedelta(seconds=60)

    tasks = db.query(Task).filter(
        and_(
            Task.client_id == client.id,
            Task.status == TaskStatus.pending,
            Task.scheduled_time <= margin,
        )
    ).all()

    return PendingTasksResponse(tasks=tasks)


@app.patch("/agent/tasks/{task_id}/status", tags=["agent"])
def update_task_status(
    task_id: int,
    payload: TaskStatusUpdate,
    client: Client = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """
    O agente atualiza o status ao iniciar (running) e ao terminar (completed/failed).
    Garante que só o cliente dono da task pode atualizá-la.
    """
    task = db.query(Task).filter(
        Task.id == task_id,
        Task.client_id == client.id
    ).first()

    if not task:
        raise HTTPException(status_code=404, detail="Task não encontrada")

    task.status = payload.status
    task.error_message = payload.error_message

    if payload.status in (TaskStatus.completed, TaskStatus.failed):
        task.executed_at = datetime.utcnow()

        # se task diária e concluída com sucesso → agenda para o próximo dia
        if task.is_daily and payload.status == TaskStatus.completed:
            next_run = task.scheduled_time + timedelta(days=1)
            # pula fim de semana se configurado
            if not task.include_weekends:
                while next_run.weekday() >= 5:  # 5=sábado, 6=domingo
                    next_run += timedelta(days=1)
            task.scheduled_time = next_run
            task.status = TaskStatus.pending
            task.executed_at = None

    db.commit()
    return {"ok": True}


@app.post("/agent/errors", response_model=dict, tags=["agent"])
async def report_error(
    payload: ErrorReportCreate,
    background_tasks: BackgroundTasks,
    client: Client = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """
    O agente chama isso quando um envio falha.
    Salva o erro + dispara notificação para você em background.
    """
    # busca target da task para incluir na notificação
    task_target = ""
    if payload.task_id:
        task = db.query(Task).filter(Task.id == payload.task_id).first()
        if task:
            task_target = task.target

    error = ErrorReport(
        client_id=client.id,
        task_id=payload.task_id,
        agent_version=payload.agent_version,
        error_type=payload.error_type,
        traceback=payload.traceback,
        screenshot=payload.screenshot,
    )
    db.add(error)
    db.commit()
    db.refresh(error)

    # notificações em background — não bloqueia o response pro agente
    background_tasks.add_task(
        send_error_email,
        client_name=client.name,
        error_type=payload.error_type or "Desconhecido",
        traceback=payload.traceback or "",
        agent_version=payload.agent_version or "?",
        error_id=error.id,
        task_target=task_target,
    )
    background_tasks.add_task(
        send_error_webhook,
        client_name=client.name,
        error_type=payload.error_type or "Desconhecido",
        agent_version=payload.agent_version or "?",
        error_id=error.id,
    )

    return {"ok": True, "error_id": error.id}


# ══════════════════════════════════════════════════════════════════════════════
#  PANEL — consumido pelo painel web
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/panel/tasks", response_model=List[TaskOut], tags=["panel"])
def list_tasks(
    client: Client = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    return db.query(Task).filter(
        Task.client_id == client.id
    ).order_by(Task.scheduled_time.desc()).all()


@app.post("/panel/tasks", response_model=TaskOut, tags=["panel"])
def create_task(
    payload: TaskCreate,
    client: Client = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    task = Task(
        client_id=client.id,
        task_name=f"task_{client.id}_{int(datetime.utcnow().timestamp())}",
        **payload.model_dump(),
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task

    agendar_task(task.id, task.scheduled_time, task.is_daily)


@app.put("/panel/tasks/{task_id}", response_model=TaskOut, tags=["panel"])
def update_task(
    task_id: int,
    payload: TaskUpdate,
    client: Client = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    task = db.query(Task).filter(
        Task.id == task_id,
        Task.client_id == client.id
    ).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task não encontrada")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(task, field, value)

    # ao editar, volta para pending
    task.status = TaskStatus.pending
    task.error_message = None
    db.commit()
    db.refresh(task)
    return task

@app.patch("/panel/tasks/{task_id}/status", tags=["panel"])
def panel_update_task_status(
    task_id: int,
    payload: TaskStatusUpdate,
    client: Client = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    task = db.query(Task).filter(
        Task.id == task_id,
        Task.client_id == client.id
    ).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task não encontrada")
    task.status = payload.status
    task.error_message = None
    db.commit()
    return {"ok": True}

@app.delete("/panel/tasks/{task_id}", tags=["panel"])
def delete_task(
    task_id: int,
    client: Client = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    task = db.query(Task).filter(
        Task.id == task_id,
        Task.client_id == client.id
    ).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task não encontrada")
    db.delete(task)
    db.commit()
    return {"ok": True}

    cancelar_task(task_id)


@app.get("/panel/errors", response_model=List[ErrorReportOut], tags=["panel"])
def list_my_errors(
    client: Client = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """O painel exibe os erros do cliente — sem screenshot para economizar payload."""
    errors = db.query(ErrorReport).filter(
        ErrorReport.client_id == client.id
    ).order_by(ErrorReport.created_at.desc()).limit(50).all()

    # remove screenshot da listagem (pesada) — o detalhe tem screenshot
    for e in errors:
        e.screenshot = None
    return errors


@app.get("/panel/errors/{error_id}", response_model=ErrorReportOut, tags=["panel"])
def get_error_detail(
    error_id: int,
    client: Client = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """Detalhe do erro com screenshot (para o cliente ver o que aconteceu)."""
    error = db.query(ErrorReport).filter(
        ErrorReport.id == error_id,
        ErrorReport.client_id == client.id
    ).first()
    if not error:
        raise HTTPException(status_code=404, detail="Erro não encontrado")
    return error


@app.get("/panel/stats", response_model=DashboardStats, tags=["panel"])
def my_stats(
    client: Client = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    cid = client.id
    total    = db.query(Task).filter(Task.client_id == cid).count()
    pending  = db.query(Task).filter(Task.client_id == cid, Task.status == TaskStatus.pending).count()
    completed= db.query(Task).filter(Task.client_id == cid, Task.status == TaskStatus.completed).count()
    failed   = db.query(Task).filter(Task.client_id == cid, Task.status == TaskStatus.failed).count()
    errors   = db.query(ErrorReport).filter(
        ErrorReport.client_id == cid,
        ErrorReport.is_resolved == False
    ).count()
    return DashboardStats(
        total_tasks=total, pending=pending, completed=completed,
        failed=failed, unresolved_errors=errors
    )

@app.post("/panel/send-now", tags=["panel"])
def send_now(
    payload: SendNowRequest,
    background_tasks: BackgroundTasks,
    client: Client = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """
    Cria uma task com scheduled_time = agora + 5s e status 'pending'.
    O agente a detecta no próximo ciclo (até 60s, mas normalmente <10s).
    
    DIFERENÇA do /panel/tasks normal:
      - scheduled_time é sempre NOW, não escolhido pelo usuário
      - O frontend trata como "envio imediato"
      - A task some do histórico após execução (is_immediate=True)
    """
    import datetime
    
    task = Task(
        client_id=client.id,
        task_name=f"immediate_{client.id}_{int(datetime.datetime.utcnow().timestamp())}",
        target=payload.target,
        mode=payload.mode,
        message=payload.message,
        file_path=payload.file_path,
        scheduled_time=datetime.datetime.utcnow(),   # agora
        is_daily=False,
        status=TaskStatus.pending,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    
    return {"ok": True, "task_id": task.id, "message": "Enviando em breve (próximo ciclo do agente)"}

# ── healthcheck ───────────────────────────────────────────────────────────────
@app.get("/health", tags=["infra"])
def health():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}

from evolution import get_qrcode, get_status, criar_instancia
from scheduler import scheduler, agendar_task, cancelar_task

@app.on_event("startup")
async def startup():
    try:
        init_db()
    except Exception as e:
        logger.warning(f"⚠️  Banco de dados não disponível no startup: {e}")
    
    try:
        scheduler.start()
    except Exception as e:
        logger.warning(f"⚠️  Scheduler não pode iniciar: {e}")
    
    # garante que a instância existe
    try:
        await criar_instancia()
    except Exception:
        pass   # já existe, normal

@app.on_event("shutdown")
async def shutdown():
    scheduler.shutdown()

# ── QR Code para conectar WhatsApp ──────────────
@app.get("/panel/qrcode", tags=["panel"])
async def qrcode(client=Depends(get_current_client)):
    return await get_qrcode()

@app.get("/panel/status", tags=["panel"])
async def status_wa(client=Depends(get_current_client)):
    return await get_status()

# ── ao criar task, agenda no APScheduler ────────
# (adicione ao final do seu POST /panel/tasks existente)
# 

# ── ao deletar task, cancela o job ──────────────
# (adicione ao DELETE /panel/tasks/{task_id})
# cancelar_task(task_id)