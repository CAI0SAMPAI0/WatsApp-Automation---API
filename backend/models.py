from sqlalchemy import Column, Integer, String, JSON, DateTime, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
import datetime

Base = declarative_base()

class Selector(Base):
    __tablename__ = "selectors"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, index=True) # e.g., "SEARCH_BOX"
    selectors = Column(JSON) # List of selector strings
    description = Column(String, nullable=True)

class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    target = Column(String, nullable=False)
    mode = Column(String, nullable=False) # 'text', 'file', 'file_text'
    message = Column(String, nullable=True)
    file_path = Column(String, nullable=True) # Remote URL or local path reference
    status = Column(String, default="pending") # 'pending', 'running', 'completed', 'failed'
    error_message = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.now)
    scheduled_at = Column(DateTime, nullable=True)
    executed_at = Column(DateTime, nullable=True)
