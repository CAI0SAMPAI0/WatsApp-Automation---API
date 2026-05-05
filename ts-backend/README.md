# Backend TypeScript (scaffold)

## Estrutura
- `src/main.ts`: API Fastify
- `src/worker.ts`: worker BullMQ
- `src/modules/auth`: signup/login
- `src/modules/wa`: status/connect (placeholder Baileys)
- `src/modules/messages`: schedule/send-now (+5s)
- `src/shared/time`: regra de timezone/agendamento

## Rodar local
1. `cp .env.example .env`
2. Subir Redis/Postgres
3. `npm i`
4. API: `npm run dev`
5. Worker: `npm run dev:worker`