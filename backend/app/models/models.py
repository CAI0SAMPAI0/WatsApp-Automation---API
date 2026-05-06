from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Text, Enum, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declarative_base
import uuid
from datetime import datetime
import enum

Base = declarative_base()

class TargetType(enum.Enum):
    contact = "contact"
    group = "group"

class MessageStatus(enum.Enum):
    pending = "pending"
    executing = "executing"
    success = "success"
    error = "error"

class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    sessions = relationship("WhatsAppSession", back_populates="user")
    messages = relationship("Message", back_populates="user")

class WhatsAppSession(Base):
    __tablename__ = "whatsapp_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    session_data = Column(JSON, nullable=True)
    is_active = Column(Boolean, default=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="sessions")

class Message(Base):
    __tablename__ = "messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    target_name = Column(String, nullable=False)
    target_type = Column(Enum(TargetType), nullable=False)
    message_text = Column(Text, nullable=True)
    status = Column(Enum(MessageStatus), default=MessageStatus.pending)
    scheduled_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="messages")
    files = relationship("MessageFile", back_populates="message")

class MessageFile(Base):
    __tablename__ = "message_files"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    message_id = Column(UUID(as_uuid=True), ForeignKey("messages.id"), nullable=False)
    file_url = Column(String, nullable=False)

    message = relationship("Message", back_populates="files")
