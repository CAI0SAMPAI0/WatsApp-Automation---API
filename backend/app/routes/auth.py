from fastapi import APIRouter, Depends, HTTPException, status
from ..database import get_supabase
from ..services.auth_service import verify_password, get_password_hash, create_access_token
from pydantic import BaseModel, EmailStr
from supabase import Client

router = APIRouter(prefix="/auth", tags=["auth"])

class UserCreate(BaseModel):
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

@router.post("/register", response_model=Token)
def register(user: UserCreate, supabase: Client = Depends(get_supabase)):
    # Check if user exists
    res = supabase.table("users").select("*").eq("email", user.email).execute()
    if res.data:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = get_password_hash(user.password)
    new_user = {
        "email": user.email,
        "password_hash": hashed_password
    }
    
    res = supabase.table("users").insert(new_user).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create user")
    
    user_id = res.data[0]["id"]
    access_token = create_access_token(data={"sub": str(user_id)})
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/login", response_model=Token)
def login(user: UserLogin, supabase: Client = Depends(get_supabase)):
    res = supabase.table("users").select("*").eq("email", user.email).execute()
    if not res.data:
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    
    db_user = res.data[0]
    if not verify_password(user.password, db_user["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    
    access_token = create_access_token(data={"sub": str(db_user["id"])})
    return {"access_token": access_token, "token_type": "bearer"}
