# Implantação na Vercel

## Contas e requisitos

Vercel, Supabase e uma chamada real da API Anthropic foram ativados e verificados em 30/10/2026 em **https://ai.v4oliveira.com.br**. Este guia documenta a configuração para manutenção ou outro destino; não envie chaves pelo chat. A evidência dos testes está em [VALIDATION.md](VALIDATION.md).

| Serviço | O que configurar | Uso |
| --- | --- | --- |
| Vercel | Projeto com Node 24 e acesso para deploy | Frontend e funções `/api` |
| Supabase | Projeto PostgreSQL, migração e Auth por e-mail/senha | Login, contatos, mensagens, agentes, agenda e consumo |
| Anthropic | Chave da API, créditos e modelo habilitado | Respostas reais de IA |
| WhatsApp / Evolution | Sessão `v4`, webhook protegido, conta/agente e whitelist | Recebimento, respostas de texto e atendimento humano |

As credenciais privadas **não foram incluídas no código**. Uma assinatura Claude não substitui créditos da API; seus créditos Anthropic podem ser usados aqui. Vercel, Supabase e Anthropic possuem planos e limites próprios. Confira os custos nas suas contas; o consumo da IA varia por modelo, tamanho do contexto e volume de mensagens. Haiku 4.5 é o padrão inicial para reduzir custo. Configure um limite de gasto na Anthropic.

### Projeto Supabase conectado

Foi encontrado e reutilizado o projeto existente **Felipa IA**, referência `mdzflolthybnzewhpxno`, região `us-east-2`, que estava sem tabelas públicas e sem usuários Auth. A migração foi aplicada, RLS/funções verificadas e cinco variáveis Supabase cadastradas em Production no projeto Vercel `swift-coral-qbz2f6f`. O projeto separado Lanna IA SDR foi preservado. Não é necessário criar outro projeto.

O token de gerenciamento foi corrigido pelo usuário e aceito pela API. A automação de manutenção está descrita em [ACTIVATION.md](ACTIVATION.md); use `SUPABASE_PROJECT_REF=mdzflolthybnzewhpxno` para selecionar esse projeto explicitamente.

O requisito seguro `SUPABASE_ACCESS_TOKEN`, com destino `api.supabase.com`, está ativo no ambiente. O token pessoal vem de Account → Access Tokens, serve ao gerenciamento e não deve ir para a Vercel, frontend ou código. Salvar instruções/variáveis no rascunho do ambiente Codex não publica automaticamente esse ambiente.

## 1. Preparar o Supabase

1. Abra o SQL Editor do projeto Supabase correto.
2. Execute os arquivos de `supabase/migrations/` em ordem: `202610200001_initial.sql`, `202610300002_whatsapp.sql`, `202610300003_crm_triage.sql`, `202610310003_workspace.sql`, `202611010004_sales_automation.sql`, `202611020005_opportunities.sql`, `202611030006_whatsapp_signature.sql`, `202611040007_assistant.sql` (histórico do assistente; opcional) e `202611050008_workflows.sql` (automações). Para as automações agendadas e com espera, aplique também `supabase/workflows-scheduler.sql` (pg_cron/pg_net, reutiliza o segredo `felipa_whatsapp_worker` do Vault). Eles criam tabelas, índices, RLS, funções de quota/gravação e a fila WhatsApp. As migrações podem ser reaplicadas neste esquema. Para verificar as regras em um banco descartável, veja `supabase/tests/security.sql` e as instruções em `supabase/README.md`; o teste usa transação e rollback.
3. Em Authentication, habilite e-mail/senha e configure confirmação de e-mail. Crie sua conta e confirme o endereço.
4. Para piloto privado, desabilite novas inscrições públicas após criar/convidar as contas autorizadas. O limite de IA é por usuário; abrir cadastros para qualquer pessoa exige controle adicional de convites, abuso e orçamento global.
5. Defina **Site URL** para o domínio final da Vercel e adicione esse domínio nas **Redirect URLs** do Auth. Para desenvolvimento, adicione também o endereço local da aplicação na porta 5173. Adicione domínios de preview somente quando necessário.
6. Para e-mails em produção, configure SMTP no Supabase conforme os limites da sua conta. Sem isso, confirmação e recuperação podem ser restringidas pelo serviço padrão.

As tabelas são isoladas por `auth.uid()`. O frontend recebe apenas a chave pública `anon`/publishable. A chave `service_role`/secret é exclusiva do servidor. Contatos e agentes vinculados não podem ser excluídos até os vínculos serem removidos; excluir uma conversa remove suas mensagens.

## 2. Configurar variáveis na Vercel

Em **Project → Settings → Environment Variables**, adicione as variáveis para os ambientes desejados (Production e, se necessário, Preview):

| Variável | Tipo | Valor/origem |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Pública, usada no build | URL `https://SEU-PROJETO.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Pública, usada no build | Chave anon/publishable do Supabase |
| `SUPABASE_URL` | Servidor | A mesma URL do projeto; opcional se `VITE_SUPABASE_URL` existir no servidor |
| `SUPABASE_ANON_KEY` | Servidor | A mesma chave pública; opcional se `VITE_SUPABASE_ANON_KEY` existir |
| `SUPABASE_SERVICE_ROLE_KEY` | **Privada / Sensitive** | Chave de serviço do mesmo projeto Supabase |
| `ANTHROPIC_API_KEY` | **Privada / Sensitive** | Chave do console Anthropic com créditos |
| `AI_SECRET_CLAUDE` | **Privada / Sensitive**, alternativa | Alias aceito se você usa esse nome; não é necessário preencher os dois |
| `AI_DAILY_REQUEST_LIMIT` | Servidor, opcional | Usado só enquanto a migração `202611070010_platform_limits.sql` não for aplicada |
| `AI_CHAT_WINDOW_USD` | Servidor, opcional | `1` — limite do chat de IA por pessoa em cada sessão de 5 horas (US$ equivalentes) |
| `AI_CHAT_DAILY_USD` | Servidor, opcional | `3` — limite diário do chat de IA por pessoa |
| `PLATFORM_ADMIN_EMAILS` | Servidor | E-mails da equipe da agência, separados por vírgula. Libera o painel **Clientes (agência)** |
| `ANTHROPIC_MODEL` | Servidor, opcional | `claude-haiku-4-5-20251001`; o modelo salvo no agente tem precedência |
| `WHATSAPP_EVO_URL` | Servidor | `https://evo.madebyfelipe.agency` |
| `WHATSAPP_EVO_INSTANCE` | Servidor | `v4`, nome real em minúsculas |
| `WHATSAPP_EVO_TOKEN` ou `WHATSAPP_TOKEN_EVO` | **Privada / Sensitive** | Chave Evolution; o primeiro nome tem precedência |
| `WHATSAPP_WEBHOOK_SECRET` | **Privada / Sensitive** | Segredo aleatório do cabeçalho de entrada, também configurado na Evolution |
| `WHATSAPP_WORKER_SECRET` | **Privada / Sensitive** | Outro segredo aleatório, também salvo no Supabase Vault como `felipa_whatsapp_worker` |
| `WHATSAPP_OWNER_USER_ID` | Servidor | UUID da conta dona da instância no painel |

Nunca use o prefixo `VITE_` para chaves privadas ou segredos. As variáveis Vite são incorporadas ao JavaScript entregue ao navegador; alterações exigem novo build/deploy. Não coloque as chaves em comandos de terminal, arquivos versionados ou capturas de tela. Configure apenas variáveis correspondentes ao projeto de destino.

## 3. Publicar

O repositório local é `/workspace/Oliveira_IA`. `vercel.json` seleciona Vite, saída `dist`, funções Node e limite de 60 segundos para IA e processamento WhatsApp. O plano Vercel utilizado precisa suportar essa duração e o uso comercial pretendido.

Pelo terminal autenticado, na raiz do projeto:

```sh
npm ci
npm test
npm run build
npx vercel login
npm run deploy:preview
```

Selecione seu time e o projeto desejado. O deploy por CLI não exige publicar o código no GitHub. Se preferir integração Git, publique o código neste repositório e importe-o na Vercel: Framework Vite, comando `npm run build`, diretório `dist`, Node 24.x. O checkout originalmente estava sem commits; nenhum push é pressuposto por este guia.

Depois de validar o preview e configurar as variáveis de Production:

```sh
npm run deploy:production
```

Se a Vercel estiver acessível e for usado um deploy temporário sem login, será necessário reivindicá-lo na sua conta pelo link fornecido pela própria Vercel, configurar as variáveis e refazer o deploy. Um preview de demonstração não equivale a um projeto de produção conectado.

## 4. Verificar o funcionamento real

1. Acesse o domínio da Vercel. Confira `/api/health`: os três campos de configuração devem ser verdadeiros. Esse endpoint verifica presença, não validade de credenciais.
2. Crie/entre na sua conta, confirme o e-mail e cadastre um contato. Recarregue: o contato precisa continuar disponível.
3. Crie um agente ativo; configure empresa, instruções e modelo. Adicione uma FAQ curta na base de conhecimento.
4. No Playground, envie uma pergunta que dependa da FAQ. A resposta precisa vir do Claude e apresentar uso de tokens; confira o registro em **Uso da IA**.
5. Na Caixa de entrada, crie uma conversa interna com contato e agente. Envie uma mensagem; o histórico precisa continuar após recarregar. Assuma como humano: a IA deve parar de responder. Retome a IA e teste novamente.
6. Crie uma oportunidade e altere a etapa. Agende uma reunião, exporte o ICS e confira o horário na sua agenda.
7. Crie uma segunda conta de teste. Ela não deve ver os dados da primeira. Não use a chave service role no navegador para fazer esse teste.

O teste remoto de 30/10/2026 confirmou login, persistência, isolamento entre contas e resposta real do Claude com conhecimento e conversa persistida. Confira [VALIDATION.md](VALIDATION.md). Confirmação/recuperação por e-mail e SMTP precisam de uma validação própria de entrega. Em qualquer novo destino, repita as verificações; testes com mocks ou a demonstração não comprovam conexão externa.

## WhatsApp e próximas etapas

A ponte está ativa em produção. A instância `v4` envia `MESSAGES_UPSERT` para `https://ai.v4oliveira.com.br/api/whatsapp-webhook`, com cabeçalho secreto. O webhook anterior do n8n foi substituído após autorização explícita e preservado para restauração numa tabela privada. A fila e o agendador funcionam sem este ambiente Codex aberto.

Para outro destino, vincule uma conta e agente existentes em `whatsapp_channels`, defina a whitelist autorizada, salve o segredo do worker no Vault e aplique `supabase/whatsapp-scheduler.sql`. O SQL do agendador e o servidor contêm a URL desta produção; ajuste-os se mudar de domínio. Só depois ative e confira o webhook na Evolution. Consulte [WHATSAPP.md](WHATSAPP.md) para manutenção e intervenção humana.

Os números terminados em **8747** e **1111**, nas duas representações brasileiras de cada número, podem acionar a IA. Outros remetentes e mídia ficam para atendimento humano. O fluxo completo foi confirmado com uma mensagem real do número terminado em **8747** para a linha conectada terminada em **0188**, geração Claude e aceite da resposta pela Evolution. Para repetir a conferência, envie um texto de um número autorizado e confira histórico e consumo no painel. Um envio aceito pelo provedor não comprova entrega ou leitura pelo destinatário.

Google Calendar, integrações com CRM externo, automações de follow-up, documentos PDF/RAG vetorial, compartilhamento entre vendedores e gestão de clientes/cobrança são expansões separadas. A qualificação é automática nas conversas atendidas pela IA (Web e WhatsApp). A migração `202610300003_crm_triage.sql` deve ser aplicada antes do deploy. A análise e a resposta são geradas na mesma chamada; só o texto de resposta entra na fila de envio. Notas e documentos não disparam mensagens externas.

## Rede do ambiente Codex

Para instalação, os registries de pacotes são suficientes. Para publicar ou validar integrações, libere `api.vercel.com`, `vercel.com`, os domínios do deploy `*.vercel.app`, `api.anthropic.com` e o hostname exato do projeto Supabase. O rascunho de configuração da nuvem contém as adições conhecidas de Vercel/Anthropic. Salvar o rascunho não aplica a rede nem publica este projeto na Vercel.


### Atualização CRM (ordem de publicação)

1. `SUPABASE_PROJECT_REF=mdzflolthybnzewhpxno npm run crm:migrate` aplica somente a migração aditiva CRM e confere colunas, funções e RLS. O token de gerenciamento deve estar no vínculo seguro existente.
2. Rode `npm run typecheck`, `npm test`, `npm run build` e `npm run test:e2e`.
3. Faça push na `main`, conectada ao deploy automático, e confira o status Vercel do commit.
4. Abra `https://ai.v4oliveira.com.br/#contacts`, entre na conta e escolha **Abrir ficha**. Uma próxima mensagem autorizada atendida pela IA deve atualizar resumo e critérios.

Não publique o backend CRM antes de o comando de migração confirmar `crmReady: true`. A rotina não altera webhook, whitelist, Auth, variáveis Vercel ou conteúdo comercial existente.
