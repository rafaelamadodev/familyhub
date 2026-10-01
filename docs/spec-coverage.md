# Cobertura das seções 3 e 4

Este mapa acompanha o escopo de produto da especificação. “Implementado” significa que existe fluxo na aplicação ou API; “configuração necessária” depende de um serviço externo local ou credencial; “pendente” não deve ser tratado como entregue.

## Seção 3 — escopo

| Área                                                                                     | Cobertura atual                                                                                                                                      |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| MVP: autenticação, família/onboarding, dashboard, tarefas, compras, calendário e membros | Implementado nos módulos React e API.                                                                                                                |
| Notificações do aplicativo                                                               | Caixa persistente, preferências, agendamento e worker implementados. Push requer Firebase/FCM e clientes móveis registrados.                         |
| Crianças, crescimento, saúde, documentos, finanças e histórico                           | Módulos implementados com autorização familiar, restrições por perfil infantil e auditoria. Documentos exigem MinIO ativo.                           |
| Compartilhamento seletivo                                                                | Papéis e permissões por módulo sensível implementados; restrições dos perfis infantis aplicadas.                                                     |
| Recorrência simples                                                                      | Tarefas diária/semanal/mensal após conclusão e contas mensais após quitação. Recorrência complexa de eventos permanece fora do MVP.                  |
| MFA, pesquisa global avançada, importação/exportação avançada e análises                 | Roadmap; ainda não implementados. Exportações de privacidade/financeiro são limitadas ao escopo explícito solicitado.                                |
| Fora de escopo                                                                           | Não há aconselhamento/diagnóstico médico, processamento de pagamentos, marketplace, anúncios direcionados a crianças nem integração bancária aberta. |

## Seção 4 — requisitos funcionais

| Requisitos          | Estado                                      | Implementação / observação                                                                                                                                                                                                                                                                                                       |
| ------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AUTH001–AUTH007     | Implementado                                | Cadastro e limite por IP/e-mail; e-mail verificado para operações sensíveis; links únicos e expirantes; encerramento de sessão individual/global; lista e revogação de sessões. MFA fica para fase futura.                                                                                                                       |
| FAM001–FAM006       | Implementado                                | Família com nome/avatar/fuso IANA; criador administrador; convite por e-mail ou código/link único, expirante e revogável; papéis e preferências. E-mail depende de SMTP/worker.                                                                                                                                                  |
| DASH001–DASH006     | Implementado                                | Endpoint agregado por família, indicadores, próximas tarefas/eventos/compras, ações rápidas e estados vazios.                                                                                                                                                                                                                    |
| TASK001–TASK006     | Implementado                                | CRUD, filtros, responsáveis da mesma família, conclusão/reabertura, recorrência diária/semanal/mensal, proteção contra duplicação concorrente e histórico.                                                                                                                                                                       |
| SHOP001–SHOP006     | Implementado                                | Listas ativas/arquivadas e itens com quantidade, unidade, nota, prioridade, edição, remoção e atualização idempotente de comprado.                                                                                                                                                                                               |
| EVENT001–EVENT006   | Parcial                                     | Agenda e visão mensal, participantes da família, fuso, dia inteiro, lembrete e cancelar/restaurar. Eventos recorrentes e entrega efetiva de lembretes push exigem trabalho adicional/configuração.                                                                                                                               |
| CHILD001–CHILD004   | Implementado                                | Perfil infantil e medidas de crescimento independentes; bloqueios por módulo e autorização/auditoria.                                                                                                                                                                                                                            |
| HEALTH001–HEALTH006 | Implementado                                | Vacinas, consultas, medicação planejada e conclusão de dose; avisos informativos e permissões reforçadas. Sem diagnóstico ou recomendação clínica.                                                                                                                                                                               |
| DOC001–DOC005       | Código implementado; serviço local pendente | MIME/extensão/assinatura e limite validados; bucket privado, URL assinada, versões, metadados e exclusão assíncrona. MinIO e scanner não puderam ser verificados nesta sessão.                                                                                                                                                   |
| FIN001–FIN005       | Implementado                                | Contas/despesas por competência, categorias, totais, recorrência mensal e exportação CSV/JSON com reautenticação. Nenhum dado de cartão.                                                                                                                                                                                         |
| NOTIF001–NOTIF005   | Parcial                                     | Inbox persistente, preferências, deduplicação, fila e integração FCM no worker. A aplicação Flutter/cliente móvel, credenciais Firebase e teste de entrega real ainda não existem.                                                                                                                                               |
| PRIV001–PRIV007     | Parcial                                     | Página de privacidade, categorias, contato configurável, exportação por escopo, correção/exclusão como solicitações acompanháveis, consentimento e auditoria. As solicitações de correção/exclusão são registradas para processamento; o processamento administrativo final e política de retenção ainda precisam ser definidos. |

## Rotas da API

Rotas versionadas em `/api/v1` e implementadas por módulos Fastify:

- Auth: registro, login, refresh, logout, logout-all, recuperação e redefinição de senha, verificação/reenvio de e-mail e sessões.
- Perfil: `/me`, edição de dados pessoais, senha e foto.
- Famílias: listagem/criação/edição, membros, convites, entrada por código e permissões.
- Operação: dashboard, tarefas/histórico, listas/itens de compras e eventos.
- Dados sensíveis: crianças/crescimento, saúde, documentos/versões/download assinado e financeiro/exportação.
- Privacidade/notificações: pedidos/consentimentos, inbox, preferências e registro/remoção de dispositivo push.
- Saúde operacional: `/health` e `/health/ready`.

Validações Zod, autenticação por JWT curto associado a sessão persistida, refresh token guardado por hash, isolamento por família e respostas de erro uniformes são aplicados na API. Os testes de integração usam schema PostgreSQL temporário; não compartilham dados com a base de desenvolvimento.

## Estado do ambiente verificado

Na última tentativa, PostgreSQL, MinIO, Mailpit e as portas da aplicação não estavam acessíveis. Por isso, as migrations e a suíte de integração não puderam ser confirmadas nessa tentativa. O typecheck TypeScript passou e o build de produção do front-end e da API passou antes dessa interrupção. Para concluir a validação operacional, inicie o Docker Desktop, execute `docker compose up -d` e depois `docker compose --profile storage up -d --build`; então rode `npm run db:deploy`, `npm test` e `npm run dev`.
