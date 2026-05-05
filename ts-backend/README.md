# Automação Nova - Backend TypeScript

Migração do backend Python para TypeScript com Fastify, Baileys e BullMQ.

## Requisitos
- Node.js 20+
- PostgreSQL
- Redis (para fila BullMQ)

## Como testar localmente

### 1. Preparar o ambiente
```bash
cd ts-backend
npm install
# ou pnpm install
```

### 2. Configurar o banco de dados
Edite o arquivo `.env` com suas credenciais do Postgres e Redis.
```bash
npx prisma migrate dev --name init
```

### 3. Rodar o servidor
```bash
npm run dev
```

### 4. Fluxo de Teste
1. **Criar Usuário:** `POST /auth/signup` com `username` e `password`.
2. **Login:** `POST /auth/login` para obter o `token`.
3. **Conectar WhatsApp:**
   - Use um cliente WebSocket (como Postman ou script simples) em `ws://localhost:3333/wa/connect`.
   - Envie o header `Authorization: Bearer <seu_token>`.
   - Você receberá um JSON do tipo `qr`. Escaneie com o celular.
4. **Agendar Mensagem:**
   - `POST /messages/schedule` com o token no header.
   - Body: `{ "targetJid": "55119... @s.whatsapp.net", "mode": "text", "message": "Olá!", "scheduledAt": "2026-05-05T..." }`.
5. **Enviar Agora:**
   - `POST /messages/send-now` (será agendado automaticamente para +5s).

## Estrutura
- `src/modules/auth`: Login/Cadastro JWT.
- `src/modules/wa`: Gerenciamento Baileys e Fila BullMQ.
- `src/modules/messages`: CRUD de mensagens e agendamento.
