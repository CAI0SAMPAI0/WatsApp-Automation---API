from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional
import datetime

import models, schemas
from database import engine, get_db

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Study Practices")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# SEED INITIAL SELECTORS
def seed_selectors(db: Session):
    initial_selectors = [
        {
            "key": "SEARCH_BOX",
            "selectors": [
                'input[data-tab="3"]',
                '#_r_9_',
                'input[aria-label="Pesquisar ou começar uma nova conversa"]',
                'input[aria-label="Search or start new chat"]',
                'div[contenteditable="true"][data-tab="3"]',
            ],
            "description": "WhatsApp search box"
        },
        {
            "key": "FIRST_RESULT",
            "selectors": [
                'div[aria-label="Lista de chats"] div[role="listitem"]:first-child',
                'div[role="listitem"][data-testid="cell-frame-container"]',
                'div[data-testid="cell-frame-container"]',
                'div[data-testid="chat-list-search-result-item"]',
                'div._ak8q',
                'span[data-testid="conversation-info-header-chat-title"]:first-of-type',
            ],
            "description": "First result in WhatsApp search list"
        },
        {
            "key": "ATTACH_BUTTON",
            "selectors": [
                '//div[@aria-label="Anexar"]',
                '//span[@data-icon="plus"]',
                '//span[@data-icon="plus-rounded"]',
                '//span[@data-icon="clip"]',
                '//div[@aria-label="Attach"]'
            ],
            "description": "WhatsApp attachment button (xpath)"
        },
        {
            "key": "TYPE_PHOTO",
            "selectors": [
                "xpath=//span[contains(text(), 'Fotos')]",
                "xpath=//span[contains(text(), 'Photos')]",
                "xpath=//div[@aria-label='Fotos e vídeos']",
                "xpath=//div[@aria-label='Photos & videos']",
                "css=[data-icon='image']",
                "css=[data-testid='mi-attach-media']",
            ],
            "description": "Selectors for Photo/Video type"
        },
        {
            "key": "TYPE_DOC",
            "selectors": [
                "xpath=//span[contains(text(), 'Documento')]",
                "xpath=//span[contains(text(), 'Document')]",
                "xpath=//div[@aria-label='Documento']",
                "xpath=//div[@aria-label='Document']",
                "css=[data-icon='document']",
                "css=[data-testid='mi-attach-document']",
            ],
            "description": "Selectors for Document type"
        },
        {
            "key": "CAPTION_BOX",
            "selectors": [
                "css=.lexical-rich-text-input [contenteditable='true']",
                "xpath=//div[contains(@aria-label, 'legenda')]",
                "css=div.lexical-rich-text-input div[contenteditable='true']",
                "css=div[contenteditable='true'][role='textbox']",
            ],
            "description": "Selectors for Caption input"
        },
        {
            "key": "SEND_BUTTON",
            "selectors": [
                "xpath=//span[@data-icon='send']",
                "xpath=//div[@role='button' and @aria-label='Enviar']",
                '//*[@data-icon="send"]',
                '//div[@aria-label="Enviar"]',
            ],
            "description": "Selectors for the Send button after attaching files"
        },
        {
            "key": "CHAT_BOX",
            "selectors": [
                'div[contenteditable="true"][data-tab="10"]',
            ],
            "description": "Main WhatsApp chat box"
        }
    ]
    for sel_data in initial_selectors:
        existing = db.query(models.Selector).filter(models.Selector.key == sel_data["key"]).first()
        if not existing:
            db.add(models.Selector(**sel_data))
    db.commit()

@app.on_event("startup")
def startup_event():
    db = next(get_db())
    seed_selectors(db)

# --- SELECTORS ---
@app.get("/selectors", response_model=List[schemas.Selector])
def get_selectors(db: Session = Depends(get_db)):
    return db.query(models.Selector).all()

@app.post("/selectors", response_model=schemas.Selector)
def create_selector(selector: schemas.SelectorCreate, db: Session = Depends(get_db)):
    db_selector = models.Selector(**selector.dict())
    db.add(db_selector)
    db.commit()
    db.refresh(db_selector)
    return db_selector

@app.put("/selectors/{key}", response_model=schemas.Selector)
def update_selector(key: str, selector: schemas.SelectorUpdate, db: Session = Depends(get_db)):
    db_selector = db.query(models.Selector).filter(models.Selector.key == key).first()
    if not db_selector:
        raise HTTPException(status_code=404, detail="Selector not found")
    if selector.selectors is not None:
        db_selector.selectors = selector.selectors
    if selector.description is not None:
        db_selector.description = selector.description
    db.commit()
    db.refresh(db_selector)
    return db_selector

# --- TASKS ---
@app.get("/tasks/pending", response_model=List[schemas.Task])
def get_pending_tasks(db: Session = Depends(get_db)):
    return db.query(models.Task).filter(models.Task.status == "pending").all()

@app.get("/tasks", response_model=List[schemas.Task])
def list_tasks(db: Session = Depends(get_db)):
    return db.query(models.Task).order_by(models.Task.created_at.desc()).all()

@app.post("/tasks", response_model=schemas.Task)
def create_task(task: schemas.TaskCreate, db: Session = Depends(get_db)):
    db_task = models.Task(**task.dict())
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    return db_task

@app.patch("/tasks/{task_id}", response_model=schemas.Task)
def update_task_status(task_id: int, task_update: schemas.TaskUpdate, db: Session = Depends(get_db)):
    db_task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if task_update.status:
        db_task.status = task_update.status
    if task_update.error_message:
        db_task.error_message = task_update.error_message
    if task_update.status in ["completed", "failed"]:
        db_task.executed_at = datetime.datetime.now()
    
    db.commit()
    db.refresh(db_task)
    return db_task
