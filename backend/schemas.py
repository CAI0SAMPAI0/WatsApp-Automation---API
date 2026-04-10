from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

# --- Selector Schemas ---
class SelectorBase(BaseModel):
    key: str
    selectors: List[str]
    description: Optional[str] = None

class SelectorCreate(SelectorBase):
    pass

class SelectorUpdate(BaseModel):
    selectors: Optional[List[str]] = None
    description: Optional[str] = None

class Selector(SelectorBase):
    id: int

    class Config:
        from_attributes = True

# --- Task Schemas ---
class TaskBase(BaseModel):
    target: str
    mode: str
    message: Optional[str] = None
    file_path: Optional[str] = None
    scheduled_at: Optional[datetime] = None

class TaskCreate(TaskBase):
    pass

class TaskUpdate(BaseModel):
    status: Optional[str] = None
    error_message: Optional[str] = None

class Task(TaskBase):
    id: int
    status: str
    created_at: datetime
    executed_at: Optional[datetime] = None
    error_message: Optional[str] = None

    class Config:
        from_attributes = True
