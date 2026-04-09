"""
auth.py — JWT por cliente

Fluxo:
  1. Você cria o cliente via endpoint de admin (POST /admin/clients)
  2. O backend gera um secret_key aleatório e retorna
  3. Você configura esse secret_key no agente do cliente (.env local)
  4. O agente faz POST /auth/token com email + secret_key → recebe JWT
  5. Todos os requests seguintes usam Authorization: Bearer <token>

O JWT tem validade de 30 dias — o agente renova automaticamente quando expira.
"""

import os
import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from database import Client, get_db
import bcrypt

# ── configuração ──────────────────────────────────────────────────────────────
SECRET_KEY      = os.environ.get("JWT_SECRET_KEY", "troque-isso-em-producao")
ALGORITHM       = "HS256"
TOKEN_EXPIRE_DAYS = 30

bearer_scheme = HTTPBearer()


# ── helpers ───────────────────────────────────────────────────────────────────
def generate_secret_key() -> str:
    """Gera um secret_key seguro para um novo cliente."""
    return secrets.token_urlsafe(24)


def hash_secret(secret: str) -> str:
    return bcrypt.hashpw(secret.encode(), bcrypt.gensalt()).decode()

def verify_secret(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(client_id: int, email: str) -> str:
    payload = {
        "sub": str(client_id),
        "email": email,
        "exp": datetime.utcnow() + timedelta(days=TOKEN_EXPIRE_DAYS),
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


# ── dependency: cliente autenticado ──────────────────────────────────────────
def get_current_client(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> Client:
    """
    Dependency injetada em todos os endpoints que precisam de autenticação.
    Uso: client: Client = Depends(get_current_client)
    """
    token = credentials.credentials
    payload = decode_token(token)

    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido ou expirado",
            headers={"WWW-Authenticate": "Bearer"},
        )

    client_id = int(payload.get("sub", 0))
    client = db.query(Client).filter(
        Client.id == client_id,
        Client.is_active == True
    ).first()

    if not client:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Cliente não encontrado ou desativado",
        )

    return client


# ── dependency: admin (só você) ───────────────────────────────────────────────
ADMIN_KEY = os.environ.get("ADMIN_API_KEY", "troque-isso-tambem")

def require_admin(x_admin_key: str = None):
    """
    Endpoints de admin usam um header simples X-Admin-Key.
    Só você conhece esse valor (vai no .env do Railway).
    Não precisa de JWT para esses endpoints — você acessa pelo /docs.
    """
    from fastapi import Header
    async def _check(x_admin_key: str = Header(None)):
        if x_admin_key != ADMIN_KEY:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin key inválida"
            )
    return _check