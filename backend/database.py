"""
database.py — Modelos SQLAlchemy + conexão PostgreSQL

O DATABASE_URL vem da variável de ambiente que o Railway injeta
automaticamente quando você adiciona um Postgres ao projeto.
"""
from dotenv import load_dotenv
load_dotenv()

import os
from datetime import datetime
from sqlalchemy import (
    create_engine, Column, Integer, String, Text,
    DateTime, Enum as SAEnum, ForeignKey, Boolean
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
import enum

# ── conexão ──────────────────────────────────────────────────────────────────
DATABASE_URL = os.environ.get("DATABASE_URL", "")

if not DATABASE_URL or DATABASE_URL == "":
    raise ValueError("DATABASE_URL não foi configurada! Verifique o arquivo .env")

# Railway entrega URLs no formato postgres://, SQLAlchemy 1.4+ exige postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,       # reconecta automaticamente se a conexão cair
    pool_size=5,
    max_overflow=10,
)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
Base = declarative_base()


# ── enums ─────────────────────────────────────────────────────────────────────
class TaskStatus(str, enum.Enum):
    pending   = "pending"
    running   = "running"
    completed = "completed"
    failed    = "failed"
    cancelled = "cancelled"


class SendMode(str, enum.Enum):
    text      = "text"
    file      = "file"
    file_text = "file_text"


# ── models ────────────────────────────────────────────────────────────────────
class Client(Base):
    """
    Cada instalação do agente é um Client.
    O JWT é gerado com client_id + secret.
    """
    __tablename__ = "clients"

    id         = Column(Integer, primary_key=True, index=True)
    name       = Column(String(100), nullable=False)           # ex: "Caio - PC Casa"
    email      = Column(String(200), unique=True, nullable=False)
    secret_key = Column(String(200), nullable=False)           # gerado na criação
    is_active  = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    tasks  = relationship("Task", back_populates="client")
    errors = relationship("ErrorReport", back_populates="client")


class Task(Base):
    """
    Agendamento criado pelo painel web.
    O agente busca tasks com status=pending e scheduled_time <= now.
    """
    __tablename__ = "tasks"

    id             = Column(Integer, primary_key=True, index=True)
    client_id      = Column(Integer, ForeignKey("clients.id"), nullable=False)
    task_name      = Column(String(200), nullable=False)
    target         = Column(String(300), nullable=False)       # contato/grupo WA
    mode           = Column(SAEnum(SendMode), nullable=False)
    message        = Column(Text, nullable=True)
    file_path      = Column(Text, nullable=True)               # path no PC do cliente
    scheduled_time = Column(DateTime, nullable=False)
    is_daily       = Column(Boolean, default=False)
    include_weekends = Column(Boolean, default=True)
    batch_id       = Column(String(100), nullable=True)        # agrupa lotes
    status         = Column(SAEnum(TaskStatus), default=TaskStatus.pending)
    created_at     = Column(DateTime, default=datetime.utcnow)
    executed_at    = Column(DateTime, nullable=True)
    error_message  = Column(Text, nullable=True)

    client = relationship("Client", back_populates="tasks")


class ErrorReport(Base):
    """
    Erro reportado pelo agente.
    Inclui screenshot em base64 e traceback completo.
    Você recebe notificação quando um novo erro chega.
    """
    __tablename__ = "error_reports"

    id           = Column(Integer, primary_key=True, index=True)
    client_id    = Column(Integer, ForeignKey("clients.id"), nullable=False)
    task_id      = Column(Integer, ForeignKey("tasks.id"), nullable=True)
    agent_version = Column(String(20), nullable=True)          # versão do agente que falhou
    error_type   = Column(String(200), nullable=True)          # ex: "SelectorNotFound"
    traceback    = Column(Text, nullable=True)
    screenshot   = Column(Text, nullable=True)                 # base64 PNG
    is_resolved  = Column(Boolean, default=False)
    resolved_at  = Column(DateTime, nullable=True)
    created_at   = Column(DateTime, default=datetime.utcnow)

    client = relationship("Client", back_populates="errors")


class AgentVersion(Base):
    """
    Controla qual versão do agente está disponível.
    O agente checa isso a cada ciclo — se a versão dele for menor,
    baixa o novo exe do download_url e reinicia.
    """
    __tablename__ = "agent_versions"

    id           = Column(Integer, primary_key=True, index=True)
    version      = Column(String(20), nullable=False)          # ex: "1.0.5"
    download_url = Column(String(500), nullable=False)         # link do novo exe
    changelog    = Column(Text, nullable=True)                 # o que mudou
    is_current   = Column(Boolean, default=True)
    created_at   = Column(DateTime, default=datetime.utcnow)


# ── dependency injection (FastAPI) ────────────────────────────────────────────
def get_db():
    """
    Dependency que garante que a sessão é fechada após cada request,
    mesmo em caso de erro.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Cria todas as tabelas. Chamado no startup da aplicação."""
    Base.metadata.create_all(bind=engine)