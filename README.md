# Study Practices - Automação WhatsApp

SaaS de automação WhatsApp com agendamento, múltiplos arquivos e gestão de contatos/grupos.

## Estrutura do Projeto

- `frontend/`: NextJS + Tailwind + Shadcn UI
- `backend/`: FastAPI (Python) - API Principal e Auth
- `whatsapp-service/`: Baileys (TypeScript) - Ponte com WhatsApp
- `worker/`: Celery Worker para execução de tarefas

## Requisitos

- Node.js >= 20
- Python >= 3.10
- Redis (para a fila do Celery)
- PostgreSQL (via Supabase ou local)
- Conta Supabase (para Storage e Database)

## Configuração

1. Crie um arquivo `.env` na raiz (e configure nos serviços se necessário):

```env
DATABASE_URL=postgresql://...
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...
JWT_SECRET=seu_segredo_aqui
REDIS_URL=redis://localhost:6379/0
WHATSAPP_SERVICE_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Como Rodar

### 1. WhatsApp Service
```bash
cd whatsapp-service
npm install
npm start
```

### 2. Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 3. Celery Worker
```bash
# Em um novo terminal, na raiz do projeto
celery -A backend.app.celery_app worker --loglevel=info
celery -A backend.app.celery_app beat --loglevel=info
```

### 4. Frontend
```bash
cd frontend
npm install
npm run dev
```

## Funcionalidades Implementadas

- [x] Login/Cadastro com JWT
- [x] Conexão WhatsApp via QR Code
- [x] Listagem de Contatos e Grupos do WhatsApp
- [x] Envio Imediato (delay de 5s)
- [x] Agendamento de Mensagens
- [x] Upload de Múltiplos Arquivos (Imagens, Vídeos, PDF, etc)
- [x] Dashboard de Status dos Agendamentos
- [x] Persistência de Sessão WhatsApp
```
