from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent / ".env", override=True)

import logging
import csv
import io
import unicodedata
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import FastAPI, Depends, HTTPException, Header, status, BackgroundTasks, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import and_
import os as os_module
import httpx

from database import (
    init_db, get_db,
    Client, Task, ErrorReport, AgentVersion,
    TaskStatus, SendMode, Contact
)
from schemas import (
    TokenOut, LoginIn,
    ClientCreate, ClientOut,
    TaskCreate, TaskUpdate, TaskStatusUpdate, TaskOut, PendingTasksResponse,
    ErrorReportCreate, ErrorReportOut,
    AgentVersionCreate, AgentVersionOut,
    DashboardStats, SendNowRequest,
    ContactCreate, ContactOut,
)
from auth import (
    generate_secret_key, hash_secret, verify_secret,
    create_access_token, get_current_client,
    ADMIN_KEY
)
from notifier import send_error_email, send_error_webhook, send_resolved_email
from evolution import (
    get_qrcode, get_status, criar_instancia, resolver_contatos,
    EVOLUTION_URL, HEADERS, INSTANCE
)
from scheduler import scheduler, agendar_task, cancelar_task

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Servir arquivos estáticos ─────────────────────────────────────────────────
ui_path = os_module.path.join(os_module.path.dirname(__file__), "..", "ui", "web")
if os_module.path.exists(ui_path):
    app.mount("/manage", StaticFiles(directory=ui_path, html=True), name="static")
    logger.info(f"✅ UI estática montada em /manage → {ui_path}")
else:
    logger.warning(f"⚠️  Pasta UI não encontrada: {ui_path}")

# ── helpers ───────────────────────────────────────────────────────────────────
def check_admin(x_admin_key: str = Header(None)):
    if x_admin_key != ADMIN_KEY:
        raise HTTPException(status_code=403, detail="Admin key inválida")

def _norm(t):
    if not t:
        return ""
    return unicodedata.normalize("NFD", str(t)).encode("ascii", "ignore").decode("ascii").lower().strip()

def _clean_phone(phone: str) -> str:
    phone = (
        phone.replace("+", "").replace(" ", "").replace("-", "")
             .replace("(", "").replace(")", "").replace(".", "")
    )
    if not phone.isdigit():
        return ""
    if len(phone) <= 11:
        phone = "55" + phone
    return phone


# ══════════════════════════════════════════════════════════════════════════════
#  AUTH
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/auth/token", response_model=TokenOut, tags=["auth"])
def login(payload: LoginIn, db: Session = Depends(get_db)):
    client = db.query(Client).filter(
        Client.email == payload.email,
        Client.is_active == True
    ).first()
    if not client or not verify_secret(payload.secret_key, client.secret_key):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciais inválidas")
    token = create_access_token(client.id, client.email)
    return {"access_token": token}


# ══════════════════════════════════════════════════════════════════════════════
#  ADMIN
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/admin/clients", response_model=dict, tags=["admin"])
def create_client(payload: ClientCreate, db: Session = Depends(get_db), x_admin_key: str = Header(None)):
    if x_admin_key != ADMIN_KEY:
        raise HTTPException(status_code=403, detail="Admin key inválida")
    existing = db.query(Client).filter(Client.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email já cadastrado")
    raw_secret = payload.password
    client = Client(name=payload.name, email=payload.email, secret_key=hash_secret(raw_secret))
    db.add(client)
    db.commit()
    db.refresh(client)
    return {
        "id": client.id, "name": client.name, "email": client.email,
        "secret_key": raw_secret,
        "message": "Guarde o secret_key — configure no .env do agente",
    }

@app.get("/admin/clients", response_model=List[ClientOut], tags=["admin"])
def list_clients(db: Session = Depends(get_db), _: None = Depends(check_admin)):
    return db.query(Client).all()

@app.patch("/admin/clients/{client_id}/deactivate", tags=["admin"])
def deactivate_client(client_id: int, db: Session = Depends(get_db), _: None = Depends(check_admin)):
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    client.is_active = False
    db.commit()
    return {"ok": True}

@app.post("/admin/versions", response_model=dict, tags=["admin"])
def create_version(payload: AgentVersionCreate, db: Session = Depends(get_db), _: None = Depends(check_admin)):
    db.query(AgentVersion).update({"is_current": False})
    version = AgentVersion(
        version=payload.version, download_url=payload.download_url,
        changelog=payload.changelog, is_current=True,
    )
    db.add(version)
    db.commit()
    db.refresh(version)
    return {"ok": True, "version": version.version}

@app.get("/admin/errors", response_model=List[ErrorReportOut], tags=["admin"])
def list_errors(resolved: Optional[bool] = None, db: Session = Depends(get_db), _: None = Depends(check_admin)):
    q = db.query(ErrorReport)
    if resolved is not None:
        q = q.filter(ErrorReport.is_resolved == resolved)
    return q.order_by(ErrorReport.created_at.desc()).all()

@app.patch("/admin/errors/{error_id}/resolve", tags=["admin"])
def resolve_error(error_id: int, db: Session = Depends(get_db), _: None = Depends(check_admin)):
    error = db.query(ErrorReport).filter(ErrorReport.id == error_id).first()
    if not error:
        raise HTTPException(status_code=404, detail="Erro não encontrado")
    error.is_resolved = True
    error.resolved_at = datetime.utcnow()
    db.commit()
    return {"ok": True}

@app.get("/admin/stats", response_model=DashboardStats, tags=["admin"])
def admin_stats(db: Session = Depends(get_db), _: None = Depends(check_admin)):
    total     = db.query(Task).count()
    pending   = db.query(Task).filter(Task.status == TaskStatus.pending).count()
    completed = db.query(Task).filter(Task.status == TaskStatus.completed).count()
    failed    = db.query(Task).filter(Task.status == TaskStatus.failed).count()
    errors    = db.query(ErrorReport).filter(ErrorReport.is_resolved == False).count()
    return DashboardStats(
        total_tasks=total, pending=pending, completed=completed,
        failed=failed, unresolved_errors=errors,
    )


# ══════════════════════════════════════════════════════════════════════════════
#  CONTACTS — cadastro manual + CSV + sync WhatsApp
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/panel/contacts", tags=["panel"])
async def list_contacts(
    q: str = "",
    client: Client = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """Autocomplete: busca contatos cadastrados + grupos/contatos da Evolution."""
    q_norm = _norm(q)

    # 1. contatos cadastrados no sistema (prioridade)
    db_contacts = db.query(Contact).filter(Contact.client_id == client.id).all()
    results = []
    numeros_ja = set()

    for c in db_contacts:
        if not q or q_norm in _norm(c.name) or q_norm in _norm(c.phone):
            results.append({"label": c.name, "value": c.phone, "tipo": "contato"})
            numeros_ja.add(c.phone)

    # 2. grupos e contatos da Evolution (complementar)
    try:
        evo = await resolver_contatos(q)
        for item in evo:
            val = item["value"].replace("@s.whatsapp.net", "").replace("@g.us", "")
            if val not in numeros_ja:
                results.append(item)
                numeros_ja.add(val)
    except Exception:
        pass

    results.sort(key=lambda x: _norm(x["label"]))
    return results[:50]


@app.get("/panel/my-contacts", response_model=List[ContactOut], tags=["panel"])
def get_my_contacts(
    client: Client = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    return db.query(Contact).filter(Contact.client_id == client.id).order_by(Contact.name).all()


@app.post("/panel/my-contacts", response_model=ContactOut, tags=["panel"])
def add_contact(
    payload: ContactCreate,
    client: Client = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    phone = _clean_phone(payload.phone)
    if not phone:
        raise HTTPException(status_code=400, detail="Número inválido")

    existing = db.query(Contact).filter(
        Contact.client_id == client.id,
        Contact.phone == phone
    ).first()
    if existing:
        existing.name = payload.name.strip()
        db.commit()
        db.refresh(existing)
        return existing

    contact = Contact(client_id=client.id, name=payload.name.strip(), phone=phone)
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return contact


@app.put("/panel/my-contacts/{contact_id}", response_model=ContactOut, tags=["panel"])
def update_contact(
    contact_id: int,
    payload: ContactCreate,
    client: Client = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    contact = db.query(Contact).filter(
        Contact.id == contact_id,
        Contact.client_id == client.id
    ).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contato não encontrado")
    phone = _clean_phone(payload.phone)
    if not phone:
        raise HTTPException(status_code=400, detail="Número inválido")
    contact.name = payload.name.strip()
    contact.phone = phone
    db.commit()
    db.refresh(contact)
    return contact


@app.delete("/panel/my-contacts/{contact_id}", tags=["panel"])
def delete_contact(
    contact_id: int,
    client: Client = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    contact = db.query(Contact).filter(
        Contact.id == contact_id,
        Contact.client_id == client.id
    ).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contato não encontrado")
    db.delete(contact)
    db.commit()
    return {"ok": True}


@app.post("/panel/my-contacts/import", tags=["panel"])
async def import_contacts_csv(
    file: UploadFile = File(...),
    client: Client = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """Importa contatos de CSV. Aceita exportação do Google Contacts, Android, iPhone."""
    content = await file.read()
    try:
        text = content.decode("utf-8-sig")
    except Exception:
        text = content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    imported = 0
    skipped  = 0

    for row in reader:
        name = (
            row.get("Name") or row.get("nome") or row.get("Nome") or
            row.get("First Name") or row.get("display_name") or
            row.get("Primeiro nome") or ""
        ).strip()

        if not name:
            first = (row.get("First Name") or row.get("Primeiro nome") or "").strip()
            last  = (row.get("Last Name")  or row.get("Último nome")   or "").strip()
            name  = f"{first} {last}".strip()

        phone = ""
        for col in ["Phone", "telefone", "Telefone", "Phone 1 - Value",
                    "numero", "Número", "Mobile", "Celular", "Phone Number"]:
            val = row.get(col, "").strip()
            if val:
                phone = val
                break

        if not name or not phone:
            skipped += 1
            continue

        phone = _clean_phone(phone)
        if not phone:
            skipped += 1
            continue

        existing = db.query(Contact).filter(
            Contact.client_id == client.id,
            Contact.phone == phone
        ).first()

        if existing:
            existing.name = name
        else:
            db.add(Contact(client_id=client.id, name=name, phone=phone))
            imported += 1

    db.commit()
    return {"ok": True, "imported": imported, "skipped": skipped}


@app.post("/panel/my-contacts/sync-whatsapp", tags=["panel"])
async def sync_whatsapp_contacts(
    client: Client = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """
    Importa automaticamente todos os contatos do WhatsApp conectado via Evolution API.
    Atualiza o nome se o número já existir, insere se for novo.
    """
    imported = 0
    updated  = 0
    skipped  = 0

    try:
        async with httpx.AsyncClient(timeout=30) as http:
            r = await http.post(
                f"{EVOLUTION_URL}/chat/findContacts/{INSTANCE}",
                headers=HEADERS,
                json={},
            )
            if r.status_code != 200:
                raise HTTPException(status_code=502, detail="Evolution API indisponível")
            contacts = r.json()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erro ao conectar na Evolution API: {e}")

    for c in contacts:
        name = (c.get("pushName") or "").strip()
        jid  = c.get("remoteJid", "")

        # pula grupos, broadcasts e entradas sem nome
        if not name or "@g.us" in jid or "broadcast" in jid:
            skipped += 1
            continue

        phone = jid.replace("@s.whatsapp.net", "")
        phone = _clean_phone(phone)
        if not phone:
            skipped += 1
            continue

        existing = db.query(Contact).filter(
            Contact.client_id == client.id,
            Contact.phone == phone
        ).first()

        if existing:
            if existing.name != name:
                existing.name = name
                updated += 1
        else:
            db.add(Contact(client_id=client.id, name=name, phone=phone))
            imported += 1

    db.commit()
    logger.info(f"Sync WhatsApp — cliente {client.id}: {imported} importados, {updated} atualizados, {skipped} ignorados")
    return {"ok": True, "imported": imported, "updated": updated, "skipped": skipped}


# ══════════════════════════════════════════════════════════════════════════════
#  AGENT
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/agent/version", response_model=AgentVersionOut, tags=["agent"])
def check_version(
    x_agent_version: str = Header("0.0.0"),
    client: Client = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    current = db.query(AgentVersion).filter(AgentVersion.is_current == True).first()
    if not current:
        raise HTTPException(status_code=404, detail="Nenhuma versão registrada")

    def parse_ver(v: str):
        try:
            return tuple(int(x) for x in v.strip().split("."))
        except:
            return (0, 0, 0)

    needs_update = parse_ver(x_agent_version) < parse_ver(current.version)
    return AgentVersionOut(
        version=current.version, download_url=current.download_url,
        changelog=current.changelog, needs_update=needs_update,
    )


@app.get("/agent/tasks/pending", response_model=PendingTasksResponse, tags=["agent"])
def get_pending_tasks(client: Client = Depends(get_current_client), db: Session = Depends(get_db)):
    now    = datetime.utcnow()
    margin = now + timedelta(seconds=60)
    tasks  = db.query(Task).filter(
        and_(Task.client_id == client.id, Task.status == TaskStatus.pending, Task.scheduled_time <= margin)
    ).all()
    return PendingTasksResponse(tasks=tasks)


@app.patch("/agent/tasks/{task_id}/status", tags=["agent"])
def update_task_status(
    task_id: int, payload: TaskStatusUpdate,
    client: Client = Depends(get_current_client), db: Session = Depends(get_db),
):
    task = db.query(Task).filter(Task.id == task_id, Task.client_id == client.id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task não encontrada")
    task.status = payload.status
    task.error_message = payload.error_message
    if payload.status in (TaskStatus.completed, TaskStatus.failed):
        task.executed_at = datetime.utcnow()
        if task.is_daily and payload.status == TaskStatus.completed:
            next_run = task.scheduled_time + timedelta(days=1)
            if not task.include_weekends:
                while next_run.weekday() >= 5:
                    next_run += timedelta(days=1)
            task.scheduled_time = next_run
            task.status = TaskStatus.pending
            task.executed_at = None
    db.commit()
    return {"ok": True}


@app.post("/agent/errors", response_model=dict, tags=["agent"])
async def report_error(
    payload: ErrorReportCreate, background_tasks: BackgroundTasks,
    client: Client = Depends(get_current_client), db: Session = Depends(get_db),
):
    task_target = ""
    if payload.task_id:
        task = db.query(Task).filter(Task.id == payload.task_id).first()
        if task:
            task_target = task.target

    error = ErrorReport(
        client_id=client.id, task_id=payload.task_id,
        agent_version=payload.agent_version, error_type=payload.error_type,
        traceback=payload.traceback, screenshot=payload.screenshot,
    )
    db.add(error)
    db.commit()
    db.refresh(error)

    background_tasks.add_task(
        send_error_email, client_name=client.name,
        error_type=payload.error_type or "Desconhecido",
        traceback=payload.traceback or "", agent_version=payload.agent_version or "?",
        error_id=error.id, task_target=task_target,
    )
    background_tasks.add_task(
        send_error_webhook, client_name=client.name,
        error_type=payload.error_type or "Desconhecido",
        agent_version=payload.agent_version or "?", error_id=error.id,
    )
    return {"ok": True, "error_id": error.id}


# ══════════════════════════════════════════════════════════════════════════════
#  PANEL — TASKS
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/panel/tasks", response_model=List[TaskOut], tags=["panel"])
def list_tasks(client: Client = Depends(get_current_client), db: Session = Depends(get_db)):
    return db.query(Task).filter(Task.client_id == client.id).order_by(Task.scheduled_time.desc()).all()


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
    agendar_task(task.id, task.scheduled_time, task.is_daily, task.include_weekends)
    return task


@app.post("/panel/send-now", tags=["panel"])
async def send_now(
    payload: SendNowRequest,
    client: Client = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    import datetime as dt_mod
    now_utc = dt_mod.datetime.now(dt_mod.timezone.utc)
    task = Task(
        client_id=client.id,
        task_name=f"immediate_{client.id}_{int(now_utc.timestamp())}",
        target=payload.target, mode=payload.mode,
        message=payload.message, file_path=payload.file_path,
        scheduled_time=now_utc, is_daily=False, status=TaskStatus.pending,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    run_at = now_utc + dt_mod.timedelta(seconds=2)
    agendar_task(task.id, run_at, is_daily=False)
    return {"ok": True, "task_id": task.id, "message": "Enviando agora..."}


@app.put("/panel/tasks/{task_id}", response_model=TaskOut, tags=["panel"])
def update_task(
    task_id: int, payload: TaskUpdate,
    client: Client = Depends(get_current_client), db: Session = Depends(get_db),
):
    task = db.query(Task).filter(Task.id == task_id, Task.client_id == client.id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task não encontrada")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(task, field, value)
    task.status = TaskStatus.pending
    task.error_message = None
    db.commit()
    db.refresh(task)
    return task


@app.delete("/panel/tasks/{task_id}", tags=["panel"])
def delete_task(
    task_id: int,
    client: Client = Depends(get_current_client), db: Session = Depends(get_db),
):
    task = db.query(Task).filter(Task.id == task_id, Task.client_id == client.id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task não encontrada")
    cancelar_task(task_id)
    db.delete(task)
    db.commit()
    return {"ok": True}


@app.patch("/panel/tasks/{task_id}/status", tags=["panel"])
def panel_update_task_status(
    task_id: int, payload: TaskStatusUpdate,
    client: Client = Depends(get_current_client), db: Session = Depends(get_db),
):
    task = db.query(Task).filter(Task.id == task_id, Task.client_id == client.id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task não encontrada")
    task.status = payload.status
    task.error_message = None
    db.commit()
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════════
#  PANEL — ERRORS / STATS / WHATSAPP
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/panel/errors", response_model=List[ErrorReportOut], tags=["panel"])
def list_my_errors(client: Client = Depends(get_current_client), db: Session = Depends(get_db)):
    errors = db.query(ErrorReport).filter(
        ErrorReport.client_id == client.id
    ).order_by(ErrorReport.created_at.desc()).limit(50).all()
    for e in errors:
        e.screenshot = None
    return errors


@app.get("/panel/errors/{error_id}", response_model=ErrorReportOut, tags=["panel"])
def get_error_detail(
    error_id: int, client: Client = Depends(get_current_client), db: Session = Depends(get_db),
):
    error = db.query(ErrorReport).filter(
        ErrorReport.id == error_id, ErrorReport.client_id == client.id
    ).first()
    if not error:
        raise HTTPException(status_code=404, detail="Erro não encontrado")
    return error


@app.get("/panel/stats", response_model=DashboardStats, tags=["panel"])
def my_stats(client: Client = Depends(get_current_client), db: Session = Depends(get_db)):
    cid       = client.id
    total     = db.query(Task).filter(Task.client_id == cid).count()
    pending   = db.query(Task).filter(Task.client_id == cid, Task.status == TaskStatus.pending).count()
    completed = db.query(Task).filter(Task.client_id == cid, Task.status == TaskStatus.completed).count()
    failed    = db.query(Task).filter(Task.client_id == cid, Task.status == TaskStatus.failed).count()
    errors    = db.query(ErrorReport).filter(
        ErrorReport.client_id == cid, ErrorReport.is_resolved == False
    ).count()
    return DashboardStats(
        total_tasks=total, pending=pending, completed=completed,
        failed=failed, unresolved_errors=errors,
    )


@app.get("/panel/qrcode", tags=["panel"])
async def qrcode(client=Depends(get_current_client)):
    return await get_qrcode()

@app.get("/panel/status", tags=["panel"])
async def status_wa(client=Depends(get_current_client)):
    return await get_status()


# ── healthcheck ───────────────────────────────────────────────────────────────
@app.get("/health", tags=["infra"])
def health():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}


# ══════════════════════════════════════════════════════════════════════════════
#  LIFECYCLE
# ══════════════════════════════════════════════════════════════════════════════

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
    try:
        await criar_instancia()
        logger.info("✅ Instância Evolution verificada")
    except Exception as e:
        logger.warning(f"⚠️  Evolution não disponível no startup: {e}")


@app.on_event("shutdown")
async def shutdown():
    scheduler.shutdown(wait=False)