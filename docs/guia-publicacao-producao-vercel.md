# FamilyHub: guia simples para publicar em produção

Este guia descreve o que falta para colocar o FamilyHub no ar com segurança. A Vercel pode hospedar o site React, mas a aplicação também precisa de uma API Node.js, banco PostgreSQL, Redis, armazenamento de arquivos e um processo worker para e-mails e tarefas em segundo plano.

## Resumo em uma frase

Vamos publicar o **site e a API na Vercel**, usando funções serverless e serviços gerenciados para PostgreSQL, arquivos e envio de e-mail.

O repositório já contém `vercel.json` e a função `api/[...path].ts` para esse modelo.

Não use os serviços locais do Docker em produção: `localhost`, PostgreSQL do Compose, MinIO local, Redis local e Mailpit existem apenas no computador de desenvolvimento.

## O que precisa existir

| Parte       | Para que serve                                      | O que usar em produção                             |
| ----------- | --------------------------------------------------- | -------------------------------------------------- |
| Site React  | Telas que você e sua esposa usam                    | Vercel                                             |
| API Fastify | Login, famílias, tarefas, agenda e demais operações | Vercel Functions                                   |
| Worker      | Envia e-mails e processa a fila Redis               | Substituído por outbox PostgreSQL + Vercel Cron    |
| Banco       | Guarda contas, famílias e registros                 | PostgreSQL gerenciado com backup                   |
| Fila        | Mantém trabalhos de e-mail e tarefas assíncronas    | Outbox no PostgreSQL, sem worker persistente       |
| Arquivos    | Fotos e documentos privados                         | Armazenamento compatível com S3, bucket privado    |
| E-mail      | Confirmação de conta e recuperação de senha         | SMTP de um provedor real, com remetente autorizado |

O backend foi preparado para ser exposto como uma Vercel Function em `api/[...path].ts`. O worker persistente não deve ser publicado na Vercel: a próxima etapa é substituir BullMQ/Redis por envio HTTP de e-mail e processamento periódico da outbox via Vercel Cron.

## Antes de publicar: segurança

1. **Gere novos segredos de produção.** Não reutilize `JWT_SECRET`, `MFA_ENCRYPTION_KEY`, `INTEGRATION_ENCRYPTION_KEY`, senhas do Docker ou credenciais de desenvolvimento.
2. **Troque o segredo OAuth do Google que foi compartilhado na conversa.** No Google Cloud, crie um novo client secret ou rotacione o atual e guarde o valor somente no painel do serviço da API.
3. Gere `JWT_SECRET`, `MFA_ENCRYPTION_KEY` e `INTEGRATION_ENCRYPTION_KEY` aleatórios e diferentes. Use pelo menos 32 caracteres para cada um.
4. Guarde cópia segura das chaves de criptografia. Se a `INTEGRATION_ENCRYPTION_KEY` mudar, a API não conseguirá descriptografar os tokens Google Agenda já salvos; se a chave de MFA mudar, os segredos MFA existentes podem deixar de funcionar.
5. Nunca coloque segredos em `VITE_*`: variáveis `VITE_` são incluídas no JavaScript entregue ao navegador. Também não publique arquivos `.env` no GitHub.

## Etapa 1 — Escolher domínio e serviços

Escolha um domínio próprio, por exemplo `meufamilyhub.com`, e configure:

- `app.meufamilyhub.com` → site na Vercel;
- `api.meufamilyhub.com` → API no host de backend.

É recomendável usar os dois subdomínios do mesmo domínio. O login web usa cookies `HttpOnly` com `SameSite=Lax`; se site e API estiverem em domínios não relacionados, os navegadores podem não enviar esses cookies em chamadas da API. Evite depender de `*.vercel.app` para o site e de outro domínio sem antes ajustar e testar a política de cookies.

Contrate/crie os serviços gerenciados para PostgreSQL, Redis e arquivos. Escolha regiões próximas entre si para reduzir latência. Confirme que o armazenamento de arquivos permite bucket privado e links assinados temporários.

## Etapa 2 — Preparar o banco

1. Crie um PostgreSQL **de produção**, separado do banco local.
2. Copie a URL de conexão TLS fornecida pelo provedor. Ela será o valor de `DATABASE_URL` na API.
3. Restrinja o acesso ao banco à API e à ferramenta usada para migrações, quando o provedor permitir.
4. Confirme backups automáticos e retenção. Faça um teste de restauração antes de guardar dados reais.
5. Antes do primeiro deploy, aplique as migrations existentes usando `prisma migrate deploy` (no repositório, `npm run db:deploy`). Faça isso com a URL de produção e confirme o resultado antes de abrir o site para uso.

Use `migrate deploy` em produção. **Não use `prisma migrate dev` nem `db push` no banco de produção.** Antes de qualquer migration futura, faça backup; depois do deploy, valide o estado do banco e os fluxos principais.

## Etapa 3 — Configurar o armazenamento de arquivos

O código usa uma interface S3, mas os valores atuais apontam para MinIO local. Crie um bucket privado no provedor escolhido e configure na API:

- `MINIO_ENDPOINT`: endpoint S3 HTTPS fornecido pelo provedor;
- `MINIO_ACCESS_KEY` e `MINIO_SECRET_KEY`: credenciais com acesso apenas ao bucket do FamilyHub;
- `MINIO_BUCKET`: nome do bucket privado.

Apesar dos nomes `MINIO_*`, os valores podem apontar para armazenamento compatível com S3. Não torne o bucket público. Configure CORS do bucket para o domínio exato do site se o navegador precisar baixar os links assinados. Teste upload, leitura por link assinado expirável e exclusão.

## Etapa 4 — E-mail e tarefas assíncronas

Como o produto usará somente Google OAuth, não é necessário contratar SMTP nem configurar e-mails de confirmação ou recuperação de senha.

Não publique `start:worker` e não configure Redis/BullMQ na Vercel. A limpeza de arquivos pendentes é executada pela rota `/api/cron/maintenance` a cada 15 minutos.

## Etapa 5 — Variáveis de ambiente

Cadastre estas variáveis **no ambiente de produção do serviço da API**, não em um `.env` enviado ao GitHub:

```env
NODE_ENV=production
DATABASE_URL=<URL TLS do PostgreSQL de produção>
JWT_SECRET=<segredo aleatório novo>
MFA_ENCRYPTION_KEY=<outro segredo aleatório novo>
INTEGRATION_ENCRYPTION_KEY=<outro segredo aleatório novo, mínimo 32 caracteres>

APP_URL=https://app.meufamilyhub.com
WEB_ORIGIN=https://app.meufamilyhub.com
PORT=<normalmente definido automaticamente pelo host>

MINIO_ENDPOINT=<endpoint HTTPS S3>
MINIO_ACCESS_KEY=<chave restrita ao bucket>
MINIO_SECRET_KEY=<segredo da chave S3>
MINIO_BUCKET=<bucket privado>

GOOGLE_CLIENT_ID=<client ID OAuth>
GOOGLE_CLIENT_SECRET=<client secret novo>
GOOGLE_AUTH_REDIRECT_URI=https://api.meufamilyhub.com/api/v1/auth/google/callback
GOOGLE_REDIRECT_URI=https://api.meufamilyhub.com/api/v1/integrations/google-calendar/callback

FCM_ENABLED=false
CRON_SECRET=<segredo aleatório para o cron, opcional>
PRIVACY_CONTACT=<seu e-mail de contato>
```

Observações:

- Se o host define `PORT` automaticamente, não force uma porta fixa.
- `WEB_ORIGIN` deve conter as origens exatas do navegador, sem barra no final. Se usar outro domínio legítimo para o site, liste-o explicitamente separado por vírgula.
- Não defina `FCM_ENABLED=true` sem as credenciais do Firebase e sem testar o worker. O Flutter ainda é um projeto separado.
- `FILE_SCANNER_URL` é opcional no código; decida se documentos devem ser aceitos sem antivírus antes de habilitar uploads em produção.
- A Vercel precisa de apenas esta variável pública para o site:

```env
VITE_API_URL=https://api.meufamilyhub.com
```

Cadastre variáveis separadamente nos ambientes Preview e Production. Preview deve usar serviços e contas de teste, não os dados reais da família. Uma alteração de variável só vale em um novo deploy da Vercel.

## Etapa 6 — Configurar Google OAuth

No Google Cloud, no cliente OAuth do tipo aplicação Web:

1. Em **Authorized JavaScript origins**, adicione `https://app.meufamilyhub.com`.
2. Em **Authorized redirect URIs**, adicione exatamente:
   - `https://api.meufamilyhub.com/api/v1/auth/google/callback` (login/cadastro);
   - `https://api.meufamilyhub.com/api/v1/integrations/google-calendar/callback` (Google Agenda).
3. Mantenha os endereços `localhost` existentes apenas para desenvolvimento. Não use o domínio de Preview como URL de produção.
4. Revise os escopos solicitados e mantenha somente os necessários.
5. Configure a tela de consentimento com o nome, e-mail de suporte, domínio e links públicos de privacidade/termos que forem exigidos pelo Google.

**Atenção ao modo “Testing”:** o Google informa que autorizações de testadores para escopos além de nome/e-mail/perfil expiram em sete dias. Como o Google Agenda usa escopo adicional, a conexão da agenda pode precisar ser refeita semanalmente enquanto o projeto OAuth estiver em Testing. O login básico Google é uma autorização diferente. Para uso prolongado da agenda, avalie publicar/verificar o app conforme os requisitos do Google; o fato de o FamilyHub ser usado por duas pessoas não remove automaticamente as regras do escopo de Agenda.

## Etapa 7 — Configurar o projeto único na Vercel

Importe o repositório do GitHub como um projeto Vercel e configure o monorepo assim:

- **Root Directory:** raiz do repositório (`.`), para que a instalação veja os workspaces npm;
- **Install Command:** `npm install`;
- **Build Command:** `npm run build --workspace @familyhub/web`;
- **Output Directory:** `apps/web/dist`;
- **Environment Variable de Production:** nenhuma para o frontend; a API é same-origin em `/api`.

No Google Cloud, cadastre como callback exatamente:

- `https://SEU-DOMINIO.vercel.app/api/v1/auth/google/callback`;
- o mesmo caminho no domínio próprio, se você configurar um.

Adicione `app.meufamilyhub.com` em **Settings → Domains** e configure no DNS os registros que a Vercel indicar. Depois do primeiro deploy, abra o domínio HTTPS e confirme que o certificado foi emitido.

Se as rotas do React forem servidas como aplicação de página única, teste também recarregar diretamente cada tela e o endereço raiz. Se alguma rota der 404 ao recarregar, será necessário adicionar uma regra de rewrite para servir `index.html`.

## Etapa 8 — Checklist antes de convidar sua esposa

- [ ] `https://api.meufamilyhub.com/health` responde com sucesso.
- [ ] `https://api.meufamilyhub.com/health/ready` confirma banco e Redis disponíveis.
- [ ] Site e API usam HTTPS e os domínios configurados em `WEB_ORIGIN`/`APP_URL` são exatos.
- [ ] Cadastro por e-mail envia mensagem real; link confirma o e-mail e login funciona.
- [ ] Login Google, logout, atualização de sessão e recuperação de senha funcionam em produção.
- [ ] As duas URLs de callback Google são exatamente iguais às cadastradas no Google Cloud.
- [ ] Sua esposa consegue entrar/criar conta, aceitar convite e acessar somente a família autorizada.
- [ ] Criar, editar e excluir tarefas, compras e eventos funciona após atualizar a página.
- [ ] Evento de saúde só envia ao Google Agenda o título, data e horário; não incluir detalhes sensíveis.
- [ ] Upload de foto/documento e download assinado funcionam; bucket continua privado.
- [ ] Worker está ligado; fila não acumula e falhas aparecem nos logs.
- [ ] Testou um backup e a restauração do PostgreSQL; documentos também têm política de backup.
- [ ] Logs não exibem senha, tokens OAuth, cookies, conteúdo de saúde nem documentos.
- [ ] Revise `/docs` e `/metrics`: a API atual registra documentação Swagger e métricas. Antes de abrir a API publicamente, decida se serão protegidas, restritas ou desativadas em produção.
- [ ] Confirme que não há contas, tarefas ou documentos de demonstração no banco de produção.

Faça primeiro um deploy Preview com dados de teste. Só depois, configure as variáveis Production e conecte o domínio final. Ao terminar, crie uma família real e convide sua esposa por um código/link novo.

## Custos e manutenção

Mesmo com somente duas pessoas, a Vercel não substitui banco, API, Redis, worker, e-mail e armazenamento. Alguns provedores oferecem cotas gratuitas, mas limites e preços mudam; verifique custos, suspensão por inatividade, limites de tráfego, retenção de backups e cobrança por armazenamento antes de escolher. Para fotos e documentos pessoais, não escolha um plano sem backup/recuperação que você aceite.

Mantenha pelo menos um backup periódico fora do serviço principal e teste uma restauração. Atualize segredos e dependências com cuidado. Se trocar uma chave que criptografa dados já salvos, planeje uma migração; não substitua a chave às pressas.

## Referências oficiais

- [Vercel: configurar builds e pastas de monorepo](https://vercel.com/docs/builds/configure-a-build)
- [Vercel: variáveis de ambiente](https://vercel.com/docs/environment-variables)
- [Vercel: ambientes Local, Preview e Production](https://vercel.com/docs/deployments/environments)
- [Vercel: duração máxima de Functions](https://vercel.com/docs/functions/configuring-functions/duration)
- [Google: OAuth 2.0 para aplicações web no servidor](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Google Cloud: modo Testing e lista de testadores](https://support.google.com/cloud/answer/15549945?hl=pt-BR)
