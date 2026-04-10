import sqlite3
import os
import sys
import datetime
from typing import List, Tuple, Optional
from pathlib import Path
from core.paths import get_user_data_dir

# CONFIGURAÇÃO DE CAMINHOS

DATA_DIR = Path(get_user_data_dir())
DB_PATH = DATA_DIR / "scheduler.db"
class SchedulerDB:
    """
    Gerenciador do banco de dados SQLite para agendamentos.

    Schema da tabela:
    - id: Identificador único
    - task_name: Nome único da tarefa (usado pelo Task Scheduler)
    - target: Contato/número para enviar
    - mode: Tipo de envio ('text', 'file', 'file_text')
    - message: Texto da mensagem (opcional)
    - file_path: Caminho do arquivo (opcional)
    - scheduled_time: Data/hora agendada (ISO format)
    - created_at: Data/hora de criação
    - status: Estado atual ('pending', 'running', 'completed', 'failed')
    - json_path: Caminho do JSON de instrução
    - executed_at: Data/hora de execução
    - error_message: Mensagem de erro
    """

    def __init__(self, db_path: Path = DB_PATH):
        self.db_path = db_path
        self._init_db()

    def _get_conn(self):
        """
        Conexão com SQLite em modo WAL (Write-Ahead Logging).

        WAL permite:
        - Leituras concorrentes (GUI + executor)
        - Escritas serializadas (automático)
        """
        conn = sqlite3.connect(
            str(self.db_path),
            timeout=60,
            detect_types=sqlite3.PARSE_DECLTYPES,
            isolation_level='DEFERRED'
        )

        # ===== ATIVA WAL MODE =====
        conn.execute("PRAGMA journal_mode=WAL")

        # ===== CONFIGURA CACHE =====
        conn.execute("PRAGMA cache_size=10000")  # 10MB cache

        # ===== FORÇA SINCRONIZAÇÃO =====
        conn.execute("PRAGMA synchronous=FULL")  # SEGURANÇA MÁXIMA
        
        # ===== CHECKPOINT AUTOMÁTICO =====
        conn.execute("PRAGMA wal_autocheckpoint=1")  # Merge a cada operação
        
        # ===== FORÇA LEITURA ATUALIZADA =====
        conn.execute("PRAGMA read_uncommitted=0")  # Garante leitura de dados commitados

        return conn

    def _force_sync(self, conn):
        """
        Força sincronização do banco de dados WAL
        """
        try:
            # PASSIVE é suficiente e não bloqueia
            conn.execute("PRAGMA wal_checkpoint(PASSIVE)")
        except Exception as e:
            # Se falhar, apenas loga mas não quebra a execução
            print(f"[DB] Aviso: Checkpoint falhou: {e}")

    def _init_db(self):
        """Cria tabela se não existir"""
        conn = self._get_conn()
        cur = conn.cursor()

        cur.execute("""
        CREATE TABLE IF NOT EXISTS agendamentos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_name TEXT UNIQUE NOT NULL,
            target TEXT NOT NULL,
            mode TEXT NOT NULL CHECK (mode IN ('text', 'file', 'file_text')),
            message TEXT,
            file_path TEXT,
            scheduled_time TEXT NOT NULL,
            created_at TEXT NOT NULL,
            status TEXT DEFAULT 'pending' 
                CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
            json_path TEXT,
            executed_at TEXT,
            error_message TEXT
        )
        """)

        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        conn.close()

        print(f"[OK] Database inicializado: {self.db_path}")

    # =============================
    # CREATE
    # =============================
    def adicionar(
        self,
        task_name: str,
        target: str,
        mode: str,
        scheduled_time: datetime.datetime,
        message: Optional[str] = None,
        file_path: Optional[str] = None,
        json_path: Optional[str] = None
    ) -> int:
        """
        Adiciona novo agendamento.

        Returns:
            int: ID do agendamento criado, ou -1 se task_name já existe
        """
        conn = self._get_conn()
        cur = conn.cursor()

        try:
            cur.execute("""
                INSERT INTO agendamentos (
                    task_name, target, mode, message, file_path,
                    scheduled_time, created_at, json_path, status
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
            """, (
                task_name,
                target,
                mode,
                message,
                file_path,
                scheduled_time.isoformat(),
                datetime.datetime.now().isoformat(),
                json_path
            ))

            conn.commit()
            task_id = cur.lastrowid
            self._force_sync(conn)

            print(f"[OK] Agendamento criado: ID={task_id}, task_name={task_name}")
            return task_id

        except sqlite3.IntegrityError as e:
            print(f"✗ Erro: Task name '{task_name}' já existe")
            return -1

        finally:
            conn.close()

    # =============================
    # READ
    # =============================
    def listar_todos(self) -> List[Tuple]:
        """
        Lista TODOS os agendamentos.
        Abre uma conexão NOVA a cada chamada para garantir leitura atualizada
        (evita o problema de snapshot do WAL mode com singleton).
        """
        conn = self._get_conn()
        # força o WAL a ser mergeado antes de ler
        conn.execute("PRAGMA wal_checkpoint(PASSIVE)")
        cur = conn.cursor()
        cur.execute("""
            SELECT
                id, task_name, target, mode,
                scheduled_time, status, created_at
            FROM agendamentos
            ORDER BY scheduled_time DESC
        """)
        rows = cur.fetchall()
        conn.close()   # ← ESSENCIAL: fecha para liberar o snapshot
        return rows

    def listar_pendentes(self) -> List[Tuple]:
        """
        Lista apenas agendamentos PENDENTES.

        Returns:
            List[Tuple]: Lista ordenada por data/hora
        """
        conn = self._get_conn()
        cur = conn.cursor()

        cur.execute("""
            SELECT 
                id, task_name, target, mode, message, 
                file_path, scheduled_time, json_path
            FROM agendamentos
            WHERE status = 'pending'
            ORDER BY scheduled_time ASC
        """)

        rows = cur.fetchall()
        conn.close()

        return rows

    def obter_por_id(self, task_id: int) -> Optional[dict]:
        conn = self._get_conn()
        conn.execute("PRAGMA wal_checkpoint(PASSIVE)")
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        try:
            cur.execute("SELECT * FROM agendamentos WHERE id = ?", (task_id,))
            row = cur.fetchone()
            return dict(row) if row else None
        finally:
            conn.close()   

    def atualizar_agendamento_completo(self, task_id, target, mode, message, file_path, scheduled_time):
        """Método para permitir a edição de um agendamento existente"""
        conn = self._get_conn()
        cur = conn.cursor()
        try:
            cur.execute("""
                UPDATE agendamentos 
                SET target = ?, mode = ?, message = ?, file_path = ?, scheduled_time = ?, status = 'pending'
                WHERE id = ?
            """, (target, mode, message, file_path, scheduled_time.isoformat(), task_id))
            conn.commit()
            conn.execute("PRAGMA wal_checkpoint(PASSIVE)")
            return True
        except Exception as e:
            print(f"Erro ao editar DB: {e}")
            return False
        finally:
            conn.close()

    def obter_detalhes(self, identificador) -> Optional[dict]:
        """
        Sempre abre conexão nova para ter a leitura mais recente.
        """
        conn = self._get_conn()
        conn.execute("PRAGMA wal_checkpoint(PASSIVE)")
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()

        if isinstance(identificador, int):
            cur.execute("SELECT * FROM agendamentos WHERE id = ?", (identificador,))
        else:
            cur.execute("SELECT * FROM agendamentos WHERE task_name = ?", (identificador,))

        row = cur.fetchone()
        conn.close()   # ← ESSENCIAL
        return dict(row) if row else None

    # =============================
    # UPDATE
    # =============================
    def atualizar_status(
        self,
        identificador,
        status: str,
        error_message: Optional[str] = None
    ):
        """
        Atualiza status de um agendamento.

        Args:
            identificador: ID ou task_name
            status: Novo status ('pending', 'running', 'completed', 'failed')
            error_message: Mensagem de erro (opcional)
        """
        conn = self._get_conn()
        cur = conn.cursor()
        now = datetime.datetime.now().isoformat()

        # ===== LOG DE DEBUG =====
        print(f"\n{'='*60}")
        print(f"[DB] ATUALIZANDO STATUS")
        print(f"[DB] Identificador: {identificador}")
        print(f"[DB] Novo status: {status}")
        print(f"[DB] Timestamp: {now}")
        print(f"{'='*60}\n")

        if isinstance(identificador, int):
            cur.execute("""
                UPDATE agendamentos
                SET status = ?, executed_at = ?, error_message = ?
                WHERE id = ?
            """, (status, now, error_message, identificador))
        else:
            cur.execute("""
                UPDATE agendamentos
                SET status = ?, executed_at = ?, error_message = ?
                WHERE task_name = ?
            """, (status, now, error_message, identificador))

        # ===== VERIFICAÇÃO =====
        if cur.rowcount == 0:
            print(f"[DB] ⚠️ AVISO: Nenhuma linha foi atualizada! Identificador pode estar errado.")
        else:
            print(f"[DB] [OK] {cur.rowcount} linha(s) atualizada(s)")

        # ✅ Commit e sincronização
        conn.commit()
        self._force_sync(conn)
        conn.close()

        # ===== VERIFICAÇÃO PÓS-SYNC =====
        # Re-abre conexão para verificar se realmente salvou
        conn_verify = self._get_conn()
        cur_verify = conn_verify.cursor()
        
        if isinstance(identificador, int):
            cur_verify.execute("SELECT status FROM agendamentos WHERE id = ?", (identificador,))
        else:
            cur_verify.execute("SELECT status FROM agendamentos WHERE task_name = ?", (identificador,))
        
        row = cur_verify.fetchone()
        conn_verify.close()
        
        if row:
            status_verificado = row[0]
            if status_verificado == status:
                print(f"[DB] [OK] VERIFICAÇÃO OK: Status confirmado como '{status}'")
            else:
                print(f"[DB]  ERRO: Status está '{status_verificado}' mas deveria ser '{status}'")
        else:
            print(f"[DB]  ERRO: Registro não encontrado na verificação!")

        print(f"[OK] Status atualizado: {identificador} → {status}")

    # =============================
    # DELETE
    # =============================
    def deletar(self, identificador):
        """
        Remove um agendamento do banco.

        Args:
            identificador: ID ou task_name
        """
        conn = self._get_conn()
        cur = conn.cursor()

        if isinstance(identificador, int):
            cur.execute("DELETE FROM agendamentos WHERE id = ?",
                        (identificador,))
        else:
            cur.execute(
                "DELETE FROM agendamentos WHERE task_name = ?", (identificador,))

        conn.commit()
        self._force_sync(conn)
        conn.close()

        print(f"[OK] Agendamento deletado: {identificador}")

    # =============================
    # UTILITÁRIOS
    # =============================
    def registrar_erro(self, task_id: int, error_message: str):
        """Atalho para registrar erro"""
        self.atualizar_status(task_id, 'failed', error_message)

    def contar_por_status(self) -> dict:
        """
        Conta agendamentos por status.

        Returns:
            dict: {'pending': X, 'completed': Y, ...}
        """
        conn = self._get_conn()
        cur = conn.cursor()

        cur.execute("""
            SELECT status, COUNT(*) as count
            FROM agendamentos
            GROUP BY status
        """)

        rows = cur.fetchall()
        conn.close()

        return {status: count for status, count in rows}


# =============================
# INSTÂNCIA GLOBAL
# =============================
# Singleton para uso em todo o app
# db = SchedulerDB()

_db_instance = None


def get_db():
    global _db_instance
    if _db_instance is None:
        _db_instance = SchedulerDB()
    return _db_instance


db = get_db()
