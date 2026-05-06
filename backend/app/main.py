from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routes import auth, whatsapp, messages, upload
from .models.models import Base
from .database import engine

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Study Practices API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(whatsapp.router)
app.include_router(messages.router)
app.include_router(upload.router)

@app.get("/")
def read_root():
    return {"message": "Welcome to Study Practices API"}
