# Clientes da API FamilyHub

A API versão 1 é a interface compartilhada entre o React deste repositório e o futuro Flutter em projeto separado. O Flutter não compartilha storage, código de sessão ou dependências com o navegador.

## Contrato

- OpenAPI em `GET http://localhost:3333/api/v1/openapi.json`; Swagger UI em `/docs`.
- Prefixo estável: `/api/v1`. Corpo e respostas em JSON; datas em ISO-8601 UTC, exceto datas civis explicitamente identificadas.
- Erros: `{ "message": "..." }`; validações podem incluir `fields: [{ path, message }]`.
- Recursos familiares exigem `familyId` e confirmam associação ativa, papel e permissões sensíveis no servidor. O identificador vindo do cliente nunca concede autorização.
- Pesquisa e indicadores agregados são por família; analytics não consulta saúde nem perfis infantis.

## Autenticação móvel

1. `POST /api/v1/auth/login` com `{email,password}` e `X-Client-Type: mobile` devolve `{accessToken,refreshToken,user}`. Com MFA ativo, inclua `otp` de seis dígitos.
2. Envie `Authorization: Bearer <accessToken>` em chamadas autenticadas. O token de acesso expira em 15 minutos.
3. `POST /api/v1/auth/refresh` recebe `{refreshToken}` e devolve novos tokens; cada refresh rotaciona e revoga o token anterior. Guarde o refresh token em armazenamento seguro do sistema móvel. Este repositório não implementa nem escolhe esse armazenamento.
4. `POST /api/v1/auth/logout` revoga a sessão atual; `POST /api/v1/auth/logout-all` encerra todas as sessões.

Cadastro não abre sessão: `POST /api/v1/auth/register` retorna `202` e envia confirmação ao SMTP configurado. O link abre o web app e confirma via `POST /api/v1/auth/verify-email` com `{token}`. Reenvio exige login (`POST /auth/resend-verification`). Recuperação: `/auth/forgot-password` e `/auth/reset-password`.

## Sessão web

O navegador envia `credentials: include`. Login/refresh web usam cookie de acesso e refresh HttpOnly; operações mutáveis também enviam o valor do cookie legível `familyhub_csrf` no header `X-CSRF-Token`. O backend só permite origens definidas em `WEB_ORIGIN`. Tokens de sessão não ficam no `sessionStorage`.

## Áreas

- Identidade e família: `/auth/*`, `/me`, `/families/*`, `/push-devices`.
- Rotina: `/dashboard`, `/analytics/summary`, `/search`, `/tasks`, `/shopping-lists`, `/shopping-items`, `/events`, `/notifications`.
- Módulos restritos: `/children`, `/growth-records`, `/health-records`, `/documents`, `/finance`.
- Privacidade: `/privacy`, `/privacy/consents`, `/privacy/requests`; exclusão/correção exige fluxo manual auditado.
- Push: registre e remova tokens FCM em `/push-devices`; o token fica associado apenas ao usuário autenticado. Envio real exige Firebase Admin configurado no worker.

Para upload de documento, MinIO precisa estar ativo; arquivos são privados, versionados e entregues por URL assinada curta. O mobile deve baixar essa URL sem incorporá-la a logs ou armazenamento permanente.
