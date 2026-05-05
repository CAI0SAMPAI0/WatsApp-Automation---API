# Plano de Migração para TypeScript (Next.js + Backend WS com Baileys)

## Objetivo
Migrar o backend atual em Python para TypeScript mantendo:
- login por usuário/senha;
- sessão WhatsApp persistente por usuário;
- agendamento no fuso `America/Sao_Paulo`;
- envio individual e em lote (mensagem, arquivo ou ambos);
- regra de segurança: envio "agora" vira `agora + 5 segundos`.

## Stack recomendada
- **Frontend:** Next.js (Vercel)
- **Backend API:** NestJS ou Fastify + TypeScript (Railway)
- **Fila/agendamento:** BullMQ + Redis
- **Banco:** Postgres (Railway)
- **WhatsApp:** Baileys (socket por usuário)
- **Auth:** JWT + refresh token + senha com bcrypt/argon2

## Modelagem mínima

### users
- id (uuid)
- username (unique)
- password_hash
- created_at

### wa_sessions
- id (uuid)
- user_id (fk)
- session_key (unique)
- auth_state_json (criptografado)
- is_connected
- last_seen_at

### scheduled_messages
- id (uuid)
- user_id (fk)
- session_id (fk)
- target_jid
- mode (`text` | `file` | `file_text`)
- message
- file_url
- file_name
- scheduled_at_tz (timestamptz)
- timezone (`America/Sao_Paulo`)
- status (`pending` | `running` | `sent` | `failed`)
- batch_id (nullable)
- error_message (nullable)
- created_at
- sent_at

## Fluxo Baileys por usuário
1. Usuário loga no sistema.
2. Backend cria/recupera `wa_session` do usuário.
3. Backend abre socket Baileys e expõe QR via WebSocket (`/ws/wa/:userId`).
4. Usuário escaneia QR e sessão fica persistida.
5. Reconexão automática em restart do serviço.

## Regras de agendamento (obrigatórias)
- Toda entrada de data deve ser normalizada para `America/Sao_Paulo`.
- Se `scheduled_at < now + 5s`, ajustar para `now + 5s`.
- Endpoint de “enviar agora” deve internamente criar job para `now + 5s`.

## Endpoints sugeridos
- `POST /auth/signup`
- `POST /auth/login`
- `POST /wa/connect`
- `GET /wa/status`
- `POST /messages/schedule`
- `POST /messages/send-now` (normaliza para +5s)
- `POST /messages/batch`
- `GET /messages`
- `DELETE /messages/:id`

## Execução local
- `docker compose up -d postgres redis`
- `pnpm dev` (API TS)
- `pnpm dev` (Next.js)
- configurar `.env.local` e `.env` com Railway/Vercel vars equivalentes.

## Deploy
- **Railway (backend):** API + worker em serviços separados (mesma base de código).
- **Vercel (frontend):** Next.js com `NEXT_PUBLIC_API_URL`.
- **Redis/Postgres:** Railway plugins/serviços dedicados.

## Checklist de migração incremental
1. Criar backend TS só com auth + status.
2. Integrar Baileys com persistência de sessão por usuário.
3. Implementar fila BullMQ + worker de envio.
4. Migrar rotas de agendamento e lote.
5. Trocar frontend para consumir API TS.
6. Desligar backend Python após validação completa.