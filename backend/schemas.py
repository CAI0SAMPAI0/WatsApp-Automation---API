from __future__ import annotations
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr
from database import SendMode, TaskStatus


# ══════════════════════════════════════════
#  AUTH
# ══════════════════════════════════════════

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginIn(BaseModel):
    email: str
    secret_key: str


# ══════════════════════════════════════════
#  CLIENT
# ══════════════════════════════════════════

class ClientCreate(BaseModel):
    name: str
    email: EmailStr
    password: str


class ClientOut(BaseModel):
    id: int
    name: str
    email: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ══════════════════════════════════════════
#  TASK
# ══════════════════════════════════════════

class TaskCreate(BaseModel):
    target: str
    mode: SendMode
    message: Optional[str] = None
    file_path: Optional[str] = None
    scheduled_time: datetime
    is_daily: bool = False
    include_weekends: bool = True
    batch_id: Optional[str] = None


class TaskUpdate(BaseModel):
    target: Optional[str] = None
    mode: Optional[SendMode] = None
    message: Optional[str] = None
    file_path: Optional[str] = None
    scheduled_time: Optional[datetime] = None
    is_daily: Optional[bool] = None
    include_weekends: Optional[bool] = None


class TaskStatusUpdate(BaseModel):
    """Enviado pelo agente ao iniciar e ao terminar um envio."""
    status: TaskStatus
    error_message: Optional[str] = None


class TaskOut(BaseModel):
    id: int
    client_id: int
    task_name: str
    target: str
    mode: SendMode
    message: Optional[str]
    file_path: Optional[str]
    scheduled_time: datetime
    is_daily: bool
    include_weekends: bool
    batch_id: Optional[str]
    status: TaskStatus
    created_at: datetime
    executed_at: Optional[datetime]
    error_message: Optional[str]

    class Config:
        from_attributes = True


# ══════════════════════════════════════════
#  ERROR REPORT
# ══════════════════════════════════════════

class ErrorReportCreate(BaseModel):
    """
    O agente manda isso quando um envio falha.
    screenshot é base64 — o frontend exibe direto no <img src="data:...">
    """
    task_id: Optional[int] = None
    agent_version: Optional[str] = None
    error_type: Optional[str] = None
    traceback: Optional[str] = None
    screenshot: Optional[str] = None   # base64 PNG


class ErrorReportOut(BaseModel):
    id: int
    client_id: int
    task_id: Optional[int]
    agent_version: Optional[str]
    error_type: Optional[str]
    traceback: Optional[str]
    screenshot: Optional[str]
    is_resolved: bool
    resolved_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


# ══════════════════════════════════════════
#  AGENT VERSION
# ══════════════════════════════════════════

class AgentVersionCreate(BaseModel):
    version: str
    download_url: str
    changelog: Optional[str] = None


class AgentVersionOut(BaseModel):
    """
    O agente recebe isso ao checar /agent/version.
    Se needs_update=True, baixa o exe em download_url.
    """
    version: str
    download_url: str
    changelog: Optional[str]
    needs_update: bool             # calculado pelo backend: versão do agente < versão atual


# ══════════════════════════════════════════
#  PAINEL — RESPOSTAS AGREGADAS
# ══════════════════════════════════════════

class DashboardStats(BaseModel):
    total_tasks: int
    pending: int
    completed: int
    failed: int
    unresolved_errors: int


class PendingTasksResponse(BaseModel):
    """
    O agente busca isso a cada ciclo.
    Retorna apenas as tasks que ele deve executar agora.
    """
    tasks: List[TaskOut]