"""
migrate_db.py — Migração do banco antigo (CTK) para o novo (PyWebView)

Roda automaticamente ao abrir o app se detectar banco antigo.
Também pode ser rodado manualmente:
    python migrate_db.py
"""

import sqlite3
import shutil
from pathlib import Path
from datetime import datetime


def _find_old_db(base_dir: Path) -> Path | None:
    """Procura o banco do app antigo (CTK) em locais conhecidos."""
    candidates = [
        base_dir / "scheduler.db",              # raiz do projeto
        base_dir / "data" / "scheduler.db",     # pasta data/
        base_dir / "db" / "scheduler.db",       # pasta db/
        base_dir / "user_data" / "tasks.db",    # nome alternativo
        base_dir / "user_data" / "scheduler.db",# mesmo nome, pasta diferente
    ]
    for p in candidates:
        if p.exists() and p.stat().st_size > 0:
            return p
    return None


def _get_new_db(base_dir: Path) -> Path:
    """Retorna o caminho do banco novo."""
    new_db = base_dir / "user_data" / "scheduler.db"
    new_db.parent.mkdir(parents=True, exist_ok=True)
    return new_db


def _ensure_new_schema(conn: sqlite3.Connection):
    """Garante que o banco novo tem todas as colunas necessárias."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS agendamentos (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            task_name      TEXT NOT NULL,
            target         TEXT NOT NULL,
            mode           TEXT NOT NULL DEFAULT 'text',
            message        TEXT,
            file_path      TEXT,
            scheduled_time TEXT NOT NULL,
            status         TEXT NOT NULL DEFAULT 'pending',
            created_at     TEXT DEFAULT (datetime('now','localtime')),
            error_msg      TEXT,
            batch_id       TEXT
        )
    """)
    # garante coluna batch_id mesmo em bancos antigos
    for col in ["batch_id", "error_msg", "file_path", "message"]:
        try:
            conn.execute(f"ALTER TABLE agendamentos ADD COLUMN {col} TEXT")
        except Exception:
            pass
    conn.commit()


def _get_columns(conn: sqlite3.Connection, table: str) -> list[str]:
    cur = conn.execute(f"PRAGMA table_info({table})")
    return [row[1] for row in cur.fetchall()]


def migrate(base_dir: Path | None = None) -> dict:
    """
    Executa a migração.
    Retorna {"migrated": N, "skipped": N, "source": path}
    """
    if base_dir is None:
        import sys
        if getattr(sys, "frozen", False):
            base_dir = Path(sys.executable).parent
        else:
            base_dir = Path(__file__).parent

    new_db_path = _get_new_db(base_dir)

    # conecta no banco novo (cria se não existir)
    new_conn = sqlite3.connect(str(new_db_path))
    new_conn.row_factory = sqlite3.Row
    _ensure_new_schema(new_conn)

    # procura banco antigo em outros locais
    old_db_path = None
    for candidate in [
        base_dir / "scheduler.db",
        base_dir / "data" / "scheduler.db",
        base_dir / "db" / "scheduler.db",
        base_dir / "tasks.db",
    ]:
        if candidate.exists() and candidate != new_db_path and candidate.stat().st_size > 0:
            old_db_path = candidate
            break

    if not old_db_path:
        new_conn.close()
        return {"migrated": 0, "skipped": 0, "source": None}

    # verifica se já foi migrado (flag)
    flag = base_dir / "user_data" / ".migrated_from_ctk"
    if flag.exists():
        new_conn.close()
        return {"migrated": 0, "skipped": 0, "source": str(old_db_path), "already_done": True}

    old_conn = sqlite3.connect(str(old_db_path))
    old_conn.row_factory = sqlite3.Row

    # descobre as tabelas disponíveis no banco antigo
    tables = [r[0] for r in old_conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    ).fetchall()]

    # tenta nomes comuns de tabela usados no CTK
    source_table = None
    for t in ["agendamentos", "tasks", "scheduled_tasks", "tarefas"]:
        if t in tables:
            source_table = t
            break

    if not source_table:
        old_conn.close()
        new_conn.close()
        return {"migrated": 0, "skipped": 0, "source": str(old_db_path), "error": "tabela nao encontrada"}

    old_cols  = _get_columns(old_conn, source_table)
    new_cols  = _get_columns(new_conn, "agendamentos")

    # IDs já existentes no banco novo
    existing_ids = set()
    try:
        existing_ids = {r[0] for r in new_conn.execute(
            "SELECT id FROM agendamentos"
        ).fetchall()}
    except Exception:
        pass

    rows    = old_conn.execute(f"SELECT * FROM {source_table}").fetchall()
    migrated = 0
    skipped  = 0

    for row in rows:
        row_dict = dict(row)

        # pula se já existe pelo id
        row_id = row_dict.get("id")
        if row_id and row_id in existing_ids:
            skipped += 1
            continue

        # normaliza campos com nomes diferentes entre versões
        def get(key, *aliases):
            for k in [key] + list(aliases):
                if k in row_dict and row_dict[k] is not None:
                    return row_dict[k]
            return None

        task_name = get("task_name", "name", "nome") or f"MigTask_{row_id or migrated}"
        target    = get("target", "contato", "destinatario", "contact") or ""
        mode      = get("mode", "tipo", "type") or "text"
        message   = get("message", "mensagem", "texto", "msg")
        file_path = get("file_path", "arquivo", "file", "attachment")
        status    = get("status", "estado") or "completed"
        batch_id  = get("batch_id")
        error_msg = get("error_msg", "erro", "error")
        created   = get("created_at", "criado_em", "created")

        # normaliza scheduled_time para ISO
        raw_time = get("scheduled_time", "data_hora", "scheduled", "data", "hora")
        scheduled_time = None
        if raw_time:
            for fmt in [
                "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S",
                "%d/%m/%Y %H:%M", "%d/%m/%Y %H:%M:%S",
                "%Y-%m-%d %H:%M",
            ]:
                try:
                    scheduled_time = datetime.strptime(str(raw_time), fmt).isoformat()
                    break
                except ValueError:
                    continue
        if not scheduled_time:
            scheduled_time = datetime.now().isoformat()

        try:
            new_conn.execute("""
                INSERT INTO agendamentos
                    (id, task_name, target, mode, message, file_path,
                     scheduled_time, status, created_at, error_msg, batch_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                row_id, task_name, target, mode, message, file_path,
                scheduled_time, status, created, error_msg, batch_id
            ))
            migrated += 1
        except sqlite3.IntegrityError:
            skipped += 1

    new_conn.commit()
    new_conn.close()
    old_conn.close()

    # marca como migrado
    flag.write_text(f"migrated {migrated} rows from {old_db_path} at {datetime.now()}")

    return {"migrated": migrated, "skipped": skipped, "source": str(old_db_path)}


if __name__ == "__main__":
    result = migrate()
    if result.get("already_done"):
        print(f"[OK] Migracao ja realizada anteriormente.")
    elif result.get("error"):
        print(f"[ERRO] {result['error']}")
    elif result["source"]:
        print(f"[OK] Migrados {result['migrated']} agendamentos de {result['source']}")
        if result["skipped"]:
            print(f"[--] {result['skipped']} ignorados (ja existiam)")
    else:
        print("[--] Nenhum banco antigo encontrado. Nada a migrar.")