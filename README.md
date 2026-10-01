# FamilyHub

Aplicação familiar em monorepo com React, TypeScript, React Query, Fastify, Prisma e PostgreSQL.

## Desenvolvimento local

Pré-requisitos: Node.js 22+, npm e Docker Desktop em execução.

```powershell
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env
docker compose up -d
npm install
npm run db:generate
npm run db:deploy
npm run dev
```

O Compose inicia PostgreSQL, Mailpit e Redis. Ative também MinIO para testar arquivos privados:

```powershell
docker compose --profile storage up -d --build
```

Endereços locais:

- Aplicação React: http://localhost:5173
- API Fastify: http://localhost:3333
- Prontidão da API e banco: http://localhost:3333/health/ready
- Mailpit: http://localhost:8025
- Redis: localhost:6379
- Console MinIO: http://localhost:9001 (com perfil storage)

Use `npm run db:deploy` para aplicar migrations existentes. Durante desenvolvimento de schema, use `npm run db:migrate --workspace @familyhub/api -- --name nome-da-migration` e regenere o cliente com `npm run db:generate`.

Não há seed automático. Cadastre a primeira conta pela interface, confirme o e-mail no Mailpit e crie ou aceite uma família no onboarding. Arquivos exigem que MinIO esteja ativo. O envio de push requer configuração Firebase/FCM; sem ela, a caixa de notificações no aplicativo continua disponível.

## Validação e ferramentas

```powershell
npm run typecheck
npm run lint
npm run format:check
npm run build
npm test
```

Os testes de integração criam um schema PostgreSQL temporário `familyhub_test_*`, executam as migrations ali e o removem ao final. Não inserem registros de teste no schema de desenvolvimento.

Veja [docs/spec-coverage.md](docs/spec-coverage.md) para a implementação das seções 3 e 4 da especificação e limitações de integrações externas.

A API móvel e web está descrita em [docs/api-clients.md](docs/api-clients.md) e publicada em `/api/v1/openapi.json`; métricas Prometheus em `/metrics`. `npm run backup` salva dump PostgreSQL e objetos MinIO em `backups/` (fora do Git). O restore é deliberadamente explícito e substitui o banco atual: `npm run restore -- <pasta-do-backup> --confirm-replace-familyhub`. Faça um backup antes de restaurar e valide os serviços Docker ativos.

Pedidos de correção/exclusão são operados manualmente. Configure IDs autorizados fora do repositório em `FAMILYHUB_OPERATOR_IDS`, depois use `npm run privacy:review -- <requestId> IN_REVIEW <operatorUserId> "motivo"` e, em seguida, `COMPLETED` ou `REJECTED`. `COMPLETED` fecha e audita a análise; não apaga registros compartilhados nem executa purge.
