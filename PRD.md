<role>
Você é um Arquiteto de Software Sênior especialista em sistemas SaaS, automação WhatsApp, FastAPI assíncrono, NextJS e integração com Baileys. Sua missão é produzir um PRD técnico, executável e sem ambiguidades para o sistema STUDY PRACTICES.
</role>

<task>
Gerar um PRD completo, técnico e pronto para implementação, em formato Markdown dentro deste XML.
</task>

<project_overview>
<name>Study Practices</name>
<type>SaaS de automação WhatsApp</type>

<stack>
  <frontend>NextJS + Tailwind + Shadcn UI</frontend>
  <backend>FastAPI async (Python)</backend>
  <whatsapp_service>Baileys (TypeScript)</whatsapp_service>
  <database>Supabase (PostgreSQL)</database>
  <queue>Redis + Celery</queue>
</stack>

<description>
Plataforma web onde usuários autenticados conectam seu WhatsApp via QR Code e realizam envios automatizados de mensagens e arquivos para contatos e grupos salvos no WhatsApp, com suporte a envio imediato e agendamento.
</description>
</project_overview>

<functional_requirements>

- Login com email e senha
- Conexão WhatsApp via QR Code
- Persistência de sessão por usuário
- Envio imediato (delay de 5 segundos)
- Agendamento por data/hora (timezone Brasília)
- Envio para:
  - nomes de contatos
  - nomes de grupos
- Upload de múltiplos arquivos:
  - imagens
  - vídeos
  - pdf
  - docx
  - xlsx
- Dashboard "Meus Agendamentos" com status:
  - pendente
  - executando
  - sucesso
  - erro
- Histórico de envios

</functional_requirements>

<architecture>

<services>

<frontend>
NextJS responsável por UI, autenticação client-side e comunicação com backend via API.
</frontend>

<backend>
FastAPI responsável por:
- autenticação JWT
- criação de mensagens
- agendamento
- upload
- controle de status
</backend>

<whatsapp_service>
Serviço separado em TypeScript usando Baileys:
- geração de QR Code
- gerenciamento de sessão por usuário
- envio de mensagens
- resolução de nomes de contatos/grupos para JID
</whatsapp_service>

<worker>
Celery para execução de tarefas agendadas
</worker>

</services>

<flow_auth>
User envia credenciais → Backend valida → retorna JWT → frontend armazena → requests autenticados
</flow_auth>

<flow_whatsapp_connection>
Frontend solicita QR → Backend solicita ao serviço Baileys → Baileys gera QR → usuário escaneia → sessão persistida → usuário conectado
</flow_whatsapp_connection>

<flow_message_send>
Usuário cria envio → Backend salva → envia para fila → Worker processa → Baileys envia → status atualizado
</flow_message_send>

</architecture>

<data_model>

<tables>

<users>
id (uuid)
email (string)
password_hash (string)
created_at (timestamp)
</users>

<whatsapp_sessions>
id (uuid)
user_id (fk)
session_data (jsonb)
is_active (boolean)
updated_at (timestamp)
</whatsapp_sessions>

<messages>
id (uuid)
user_id (fk)
target_name (string)
target_type (enum: contact, group)
message_text (text)
status (enum)
scheduled_at (timestamp)
created_at (timestamp)
</messages>

<message_files>
id (uuid)
message_id (fk)
file_url (string)
</message_files>

</tables>

</data_model>

<endpoint_spec>

<auth>
POST /auth/login
POST /auth/register
</auth>

<whatsapp>
GET /whatsapp/qr
GET /whatsapp/status
</whatsapp>

<messages>
POST /messages/send
POST /messages/schedule
GET /messages
GET /messages/{id}
</messages>

<upload>
POST /upload
</upload>

</endpoint_spec>

<whatsapp_logic>

<contact_resolution>
O sistema NÃO usa número diretamente.

Fluxo:
1. Baileys lista contatos e grupos do usuário
2. Armazena cache no backend
3. Usuário seleciona pelo nome
4. Sistema resolve para JID interno
</contact_resolution>

<message_send>
- text → sendMessage
- media → sendMessage com buffer/file
- múltiplos arquivos → envio sequencial
</message_send>

<session_persistence>
Sessões armazenadas por usuário no Supabase ou filesystem criptografado
Reconexão automática obrigatória
</session_persistence>

</whatsapp_logic>

<non_functional>

- API assíncrona
- tempo de resposta < 300ms
- retry automático (3 tentativas)
- rate limit por usuário
- upload máximo 20MB por arquivo

</non_functional>

<directory_structure>

frontend/
  app/
  components/
  services/

backend/
  app/
    routes/
    models/
    services/

whatsapp-service/
  src/

worker/

</directory_structure>

<env>

DATABASE_URL=
SUPABASE_URL=
SUPABASE_KEY=
JWT_SECRET=
REDIS_URL=
BAILEYS_SESSION_PATH=

</env>

<roadmap>

<mvp>
- autenticação
- QR code
- envio simples
- agendamento
</mvp>

<v1>
- upload múltiplo
- dashboard completo
</v1>

<v2>
- otimização
- logs avançados
</v2>

</roadmap>

<sprints>

<sprint_1>
- setup nextjs
- setup fastapi
- integração supabase
- auth jwt
</sprint_1>

<sprint_2>
- setup baileys
- geração QR
- persistência sessão
</sprint_2>

<sprint_3>
- envio mensagens
- integração backend → baileys
</sprint_3>

<sprint_4>
- celery + redis
- agendamento
</sprint_4>

<sprint_5>
- upload arquivos
- envio com mídia
</sprint_5>

<sprint_6>
- dashboard status
- filtros
</sprint_6>

<sprint_7>
- responsividade total
- ajustes UI premium
</sprint_7>

<sprint_8>
- segurança
- logs
- rate limit
</sprint_8>

</sprints>

<risks>

- bloqueio do WhatsApp → mitigar com limite de envio
- perda de sessão → reconexão automática
- falha no envio → retry automático

</risks>

<final_directive>
Este documento é a única fonte de verdade. Não improvisar. Implementar exatamente como descrito.
</final_directive>