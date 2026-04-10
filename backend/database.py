from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent / ".env", override=True)

import os
import enum
from datetime import datetime
from sqlalchemy import (
    create_engine, Column, Integer, String, Text,
    DateTime, Enum as SAEnum, ForeignKey, Boolean
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship

DATABASE_URL = os.environ.get("DATABASE_URL", "")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL nao configurada!")

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(
    DATABASE_URL.replace("postgresql://", "postgresql+psycopg://"),
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
Base = declarative_base()


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


class Client(Base):
    __tablename__ = "clients"
    id         = Column(Integer, primary_key=True, index=True)
    name       = Column(String(100), nullable=False)
    email      = Column(String(200), unique=True, nullable=False)
    secret_key = Column(String(200), nullable=False)
    is_active  = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    tasks  = relationship("Task", back_populates="client")
    errors = relationship("ErrorReport", back_populates="client")


class Task(Base):
    __tablename__ = "tasks"
    id               = Column(Integer, primary_key=True, index=True)
    client_id        = Column(Integer, ForeignKey("clients.id"), nullable=False)
    task_name        = Column(String(200), nullable=False)
    target           = Column(String(300), nullable=False)
    mode             = Column(SAEnum(SendMode), nullable=False)
    message          = Column(Text, nullable=True)
    file_path        = Column(Text, nullable=True)
    scheduled_time   = Column(DateTime, nullable=False)
    is_daily         = Column(Boolean, default=False)
    include_weekends = Column(Boolean, default=True)
    batch_id         = Column(String(100), nullable=True)
    status           = Column(SAEnum(TaskStatus), default=TaskStatus.pending)
    created_at       = Column(DateTime, default=datetime.utcnow)
    executed_at      = Column(DateTime, nullable=True)
    error_message    = Column(Text, nullable=True)
    client = relationship("Client", back_populates="tasks")


class ErrorReport(Base):
    __tablename__ = "error_reports"
    id            = Column(Integer, primary_key=True, index=True)
    client_id     = Column(Integer, ForeignKey("clients.id"), nullable=False)
    task_id       = Column(Integer, ForeignKey("tasks.id"), nullable=True)
    agent_version = Column(String(20), nullable=True)
    error_type    = Column(String(200), nullable=True)
    traceback     = Column(Text, nullable=True)
    screenshot    = Column(Text, nullable=True)
    is_resolved   = Column(Boolean, default=False)
    resolved_at   = Column(DateTime, nullable=True)
    created_at    = Column(DateTime, default=datetime.utcnow)
    client = relationship("Client", back_populates="errors")


class AgentVersion(Base):
    __tablename__ = "agent_versions"
    id           = Column(Integer, primary_key=True, index=True)
    version      = Column(String(20), nullable=False)
    download_url = Column(String(500), nullable=False)
    changelog    = Column(Text, nullable=True)
    is_current   = Column(Boolean, default=True)
    created_at   = Column(DateTime, default=datetime.utcnow)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)