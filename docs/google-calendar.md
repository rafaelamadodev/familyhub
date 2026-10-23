# Google Agenda (desenvolvimento)

A primeira versão envia eventos do FamilyHub para um calendário Google escolhido pelo administrador da família. Criar ou editar um evento tenta sincronizá-lo imediatamente; “Sincronizar agora” reprocessa até 200 eventos. Cancelar um compromisso remove sua cópia vinculada do Google. Mudanças feitas no Google não retornam ao FamilyHub nesta versão.

Os tokens OAuth são criptografados com AES-256-GCM antes de serem gravados. Não compartilhe nem versiona o `.env`; mantenha o segredo de criptografia estável e faça backup seguro. Se ele for perdido, será necessário reconectar as contas Google.

## Configuração Google Cloud

1. Crie ou selecione um projeto no Google Cloud Console e habilite **Google Calendar API**.
2. Configure a tela de consentimento OAuth. Enquanto o aplicativo estiver em modo de teste, adicione a conta que fará a conexão como usuário de teste.
3. Crie um OAuth Client ID do tipo **Web application**.
4. Cadastre `http://localhost:3333/api/v1/integrations/google-calendar/callback` como Authorized redirect URI. Precisa ser idêntico a `GOOGLE_REDIRECT_URI`.
5. Copie o Client ID e o Client Secret para `apps/api/.env`. Gere um segredo distinto para criptografia, por exemplo no PowerShell:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```

6. Preencha as variáveis no `apps/api/.env`:

   ```dotenv
   GOOGLE_CLIENT_ID=seu-client-id
   GOOGLE_CLIENT_SECRET=seu-client-secret
   GOOGLE_REDIRECT_URI=http://localhost:3333/api/v1/integrations/google-calendar/callback
   INTEGRATION_ENCRYPTION_KEY=resultado-aleatorio-gerado-acima
   APP_URL=http://localhost:5173
   ```

7. Aplique a migration e gere o cliente Prisma:

   ```powershell
   npm run db:deploy
   npm run db:generate
   ```

8. Reinicie a API e o web, entre com um administrador da família e abra **Família → Google Agenda**. Autorize a conta Google, escolha um calendário gravável e sincronize.

O consentimento pede apenas `calendar.events` e `calendar.calendarlist.readonly`. A integração não lê nem importa eventos do Google. Títulos, descrições, locais e horários dos compromissos da família serão enviados ao provedor Google escolhido.

## Contrato API

- `GET /api/v1/integrations/google-calendar?familyId=...`: configuração e estado da conexão.
- `GET /api/v1/integrations/google-calendar/connect?familyId=...`: início OAuth; exige sessão web e administrador.
- `GET /api/v1/integrations/google-calendar/callback`: callback OAuth, protegido por `state` aleatório de uso único e validade de dez minutos.
- `GET /api/v1/integrations/google-calendar/calendars?familyId=...`: calendários em que a conta conectada pode gravar.
- `PUT /api/v1/integrations/google-calendar/calendar`: escolhe o calendário de destino.
- `POST /api/v1/integrations/google-calendar/sync`: reprocessamento manual (máximo 200 eventos por chamada).
- `DELETE /api/v1/integrations/google-calendar?familyId=...`: desconecta e apaga tokens locais; cópias externas existentes permanecem no Google.

Todos os endpoints de gerenciamento exigem administrador da família. A sincronização bidirecional com notificações push/webhooks fica para etapa posterior: ela exige uma URL HTTPS pública, renovação de canais e cursores incrementais de sincronização.
