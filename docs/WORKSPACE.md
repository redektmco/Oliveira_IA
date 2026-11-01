# Configurações, canais e equipe

Implementação de 31/10/2026 baseada nas dez telas fornecidas: ficha do cliente, Geral, Equipe, Faturamento, WhatsApp, E-mail, Instagram, Widget do site, API/webhooks e Segurança. A ficha e a triagem automática existentes no remoto foram preservadas e ampliadas com responsáveis vinculados à equipe, notas independentes e arquivos privados.

## Preparação

1. Aplique as migrações de `supabase/migrations/` em ordem, incluindo `202610300003_crm_triage.sql` e `202610310003_workspace.sql`. Execute as verificações locais antes de aplicar em produção. A migração adiciona tabelas, índices, políticas e funções; não apaga os dados existentes.
2. Configure as variáveis privadas listadas em `.env.example` na Vercel. `APP_ORIGIN` identifica o domínio do painel. `INTEGRATION_ENCRYPTION_KEY` deve conter 32 bytes aleatórios em hexadecimal. Não copie credenciais para `VITE_*`. Preserve a chave de criptografia: ela protege os refresh tokens e segredos dos webhooks armazenados no banco.
3. Publique o código na Vercel depois da migração. As novas rotas são `/api/workspace`, `/api/oauth`, `/api/public` e `/api/provider-webhook`. O aplicativo continua usando o Supabase e o projeto Vercel existentes.
4. Depois de publicar as funções, aplique `supabase/workspace-scheduler.sql`. Ele usa o segredo `felipa_whatsapp_worker` já armazenado no Vault e não altera o agendador original do WhatsApp. Executa a manutenção e as filas dos novos canais a cada cinco minutos. Se mudar de domínio, ajuste a URL do SQL.
5. Entre na conta, abra Configurações e conecte cada serviço. Enquanto faltarem credenciais ou autorização, os canais permanecem desconectados. A demonstração salva configurações apenas no navegador e não chama serviços externos.

## Equipe e acesso

Cada proprietário mantém o `user_id` original dos seus registros. Convites adicionam membros sem copiar ou mover contatos. Administradores controlam integrações, equipe, segurança e cobrança; gestores acessam a operação compartilhada e podem editar agentes e conhecimento; vendedores acessam somente contatos atribuídos e os registros vinculados. O proprietário não pode ser removido ou rebaixado.

Convites expiram em sete dias e exigem confirmação do e-mail destinatário. O Supabase tenta enviar convite para contas novas; se não aceitar o envio, o painel informa que o link precisa ser compartilhado. A entrega de e-mail depende do SMTP e da configuração Auth. Workspaces disponíveis aparecem no seletor do menu.

O frontend consulta a API autenticada para aplicar mascaramento, IPs, MFA e sessões. As políticas RLS continuam limitando clientes diretos; dados de workspaces com controles sensíveis passam exclusivamente pelo servidor. Sessões encerradas deixam de acessar a aplicação. A revogação é da sessão do painel, não um logout dos serviços Google/Meta.

O rodízio atribui leads qualificados a vendedores ativos, priorizando menor carga e a atribuição mais antiga. Um score que cruza 70 gera uma notificação no painel quando essa opção estiver habilitada. Critérios automáticos continuam baseados nas evidências da triagem existente.

## WhatsApp

A tela consulta a sessão Evolution, o webhook real, o agente e a fila. Gera QR code ou código de pareamento apenas quando a instância está desconectada. Conectar exige acesso ao celular. A restauração do webhook recusa substituir um endpoint de outro sistema. Não altera a whitelist existente.

As preferências controlam respostas automáticas, transferência para humano, horário e atraso de digitação. Mensagens fora do horário são reagendadas sem consumir tentativas de envio. A fila mantém as proteções anteriores contra duplicação e envio incerto.

Diagnóstico somente de leitura em 31/10/2026: vínculo e agente habilitados, webhook marcado como verificado, cron ativo, nenhuma tarefa pendente e últimos envios aceitos pela Evolution. Último evento às 21:02:57 de 30/10, com processamento concluído às 21:03:01, em Brasília. O último worker registrado retornou 202. Isso não confirma a sessão atual da Evolution nem comprova recebimento de novas mensagens. A verificação direta do provedor e do deploy depende de restabelecer o acesso Vercel e a rede do ambiente.

## Google Workspace

Crie um cliente OAuth Web no Google Cloud, habilite Gmail API e cadastre exatamente:

`https://ai.v4oliveira.com.br/api/oauth?provider=google`

Configure `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`. Autorize Gmail readonly e send. Publicação do aplicativo e eventuais verificações de escopos dependem do Google. O callback usa estado de uso único e cookie HttpOnly; o refresh token é criptografado e nunca retorna ao navegador.

A sincronização importa texto das mensagens recebidas, cria contatos e conversas, deduplica por ID do Gmail e mantém paginação quando há mais de 25 mensagens. O botão permite consultar novamente; o agendador também sincroniza. SPF, DKIM no seletor `google` e DMARC são consultados no DNS; presença de registros não garante entregabilidade. Se usar outro seletor DKIM, confira no Google Admin.

Respostas humanas e acompanhamentos usam uma fila persistida, janela de envio e limite diário. Acompanhamentos são opcionais, após 24 horas sem resposta, apenas para conversas posteriores à ativação da opção e contatos com e-mail. A resposta do cliente cancela pendências quando a pausa estiver habilitada. O resumo diário é enfileirado entre 08h e 10h no fuso do workspace. Envios interrompidos em fase externa ficam incertos e não são repetidos automaticamente. Conteúdo e mídia completos de e-mails não substituem a caixa Gmail; anexos de e-mail não são importados.

## Instagram / Meta

Configure um aplicativo Meta com acesso às permissões da API Instagram com Facebook Login, mensagens, comentários e páginas. Cadastre:

- OAuth: `https://ai.v4oliveira.com.br/api/oauth?provider=instagram`
- Webhook: `https://ai.v4oliveira.com.br/api/provider-webhook?provider=instagram`

Preencha `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` e a versão suportada em `META_API_VERSION`. Autorize uma única página vinculada à conta Business/Creator desejada. Assine os eventos de mensagens e comentários correspondentes no painel Meta. Permissões avançadas, modo de publicação, revisão do aplicativo e janelas de mensagens são controlados pela Meta.

O webhook verifica assinatura antes de aceitar eventos. Textos de DM seguem para IA quando habilitada; mídias ficam para humano. Respostas e menções de Stories respeitam a preferência. Referências de anúncios são registradas quando presentes. Comentários podem receber um convite estático para o Direct, se a opção e as permissões estiverem habilitadas. Não é afirmada conexão antes do OAuth real.

## Widget

Escolha agente ativo, origens HTTPS autorizadas e aparência; salve e ative o widget. Copie o snippet da tela para o site. O script carrega uma página isolada, com política própria de incorporação. O painel principal mantém bloqueio de iframe.

Nome, WhatsApp e consentimento são coletados conforme as preferências. O chat cria contato e conversa reais, armazena mensagens e usa o agente/base da conta. Sessões do widget expiram em 24 horas. Há limites persistidos por IP, por workspace e de chamadas de IA. Atendimento humano é possível pela Caixa de entrada. A prévia na tela de configurações mostra apenas a aparência.

## Stripe

Configure os preços recorrentes `STRIPE_PRICE_ESSENTIAL` e `STRIPE_PRICE_GROWTH`, chave privada, Customer Portal e segredo do webhook. Registre:

`https://ai.v4oliveira.com.br/api/provider-webhook?provider=stripe`

O checkout confirma a contratação na Stripe. O portal gerencia assinatura, cartão e dados da empresa. Valores, estado da assinatura e PDFs vêm da API Stripe. O painel não armazena dados completos de cartão, não inventa assinaturas e evita abrir um segundo checkout quando já existe assinatura. Os nomes Essencial/Crescimento são identificadores de configuração; produtos, valores e limites comerciais precisam ser definidos pelo responsável na Stripe. Esta implementação não presume uma política de bloqueio por quota comercial dos planos.

## API e webhooks

Chaves de API são exibidas uma única vez, guardadas por hash e podem ser revogadas. A API autenticada lista contatos com cursor e cria contatos. A documentação está na tela API e webhooks.

Endpoints recebem eventos persistidos. Cada entrega inclui ID, timestamp e HMAC-SHA256 do corpo original. O destino deve deduplicar IDs e validar assinatura/timestamp. Há até quatro tentativas com espera crescente. URLs públicas HTTPS são validadas, os endereços DNS são verificados e o envio é fixado no IP verificado, sem seguir redirecionamentos. O agendador precisa estar ativo para executar a fila.

## Agenda e pipeline automáticos

Implementado em 01/11/2026. Configure em **Configurações → Agenda e pipeline**.

- **Oportunidade automática.** Na primeira mensagem de um lead (WhatsApp, e-mail, Instagram ou widget), uma oportunidade é criada em **Novo lead** no Kanban, mesmo que um humano atenda. A cada resposta da IA, a etapa avança para **Em qualificação**, **Qualificado** e **Reunião agendada** conforme a triagem. A automação nunca volta etapas e não mexe em Proposta, Ganho ou Perdido. Oportunidade já encerrada não é reaberta automaticamente.
- **Reunião marcada pela IA.** A IA recebe até nove horários livres do SDR responsável pelo lead (`assigned_to`; sem responsável, o dono do workspace), dentro do horário configurado, com antecedência mínima e no máximo três por dia. Ela oferece 2–3 opções e só confirma quando o cliente escolhe um horário da lista. O servidor revalida o horário antes de gravar: horário inventado ou ocupado nunca é confirmado; o cliente recebe as alternativas. A reunião aparece em **Reuniões**, na ficha e move a oportunidade para **Reunião agendada**. Tarefas repetidas da fila não duplicam a reunião.
- **Google Calendar do SDR.** Cada pessoa conecta a própria agenda em **Reuniões → Conectar Google Calendar** (qualquer função). Com agenda conectada, os horários ocupados nela não são oferecidos e o evento é criado nela, com link do Google Meet (opcional) e convite ao lead que tiver e-mail. Sem agenda, a IA usa o horário configurado e as reuniões já cadastradas no painel.
- Falhas de agenda, Google ou pipeline nunca bloqueiam a resposta no WhatsApp.

Ativação:

1. Aplique `supabase/migrations/202611010004_sales_automation.sql`. Antes disso, oportunidades e reuniões já funcionam, mas salvar a aba **Agenda e pipeline** e conectar agendas ficam indisponíveis.
2. No Google Cloud, habilite a **Google Calendar API** no mesmo cliente OAuth do Gmail e cadastre o endereço de retorno `https://ai.v4oliveira.com.br/api/oauth?provider=google_calendar`. Escopos solicitados: `openid`, `email`, `calendar.events` e `calendar.freebusy`.
3. Na Vercel, configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `INTEGRATION_ENCRYPTION_KEY` (32 bytes em hexadecimal) e `APP_ORIGIN`, e publique novamente.
4. Cada SDR entra no painel, abre **Reuniões** e conecta a própria agenda.

Os testes `tests/sales-automation.test.ts` cobrem etapas, horários livres, reservas idempotentes, recusa de horários fora da lista, dupla reserva e a migração em PGlite. A chamada real à API Google depende das credenciais acima e não foi validada neste ambiente.

## Assistente de IA (tela inicial)

Implementado em 04/11/2026. A **Visão geral** é uma conversa com o Claude, no formato de busca/chat: campo central com sugestões e, ao enviar a primeira mensagem, a tela vira a conversa. As conversas ficam no **Histórico**.

- **O que a IA faz sozinha.** Lê o workspace (resumo, contatos, oportunidades, tarefas, reuniões, caixa de entrada) e executa, sem pedir confirmação: criar e editar contatos, criar e editar oportunidades (etapa, valor, previsão), notas, tarefas, reuniões no painel e **enviar WhatsApp**. Cada ação aparece como cartão no chat, com link para o registro; falhas aparecem em vermelho com o motivo.
- **O que ela não faz.** Não existe ferramenta de exclusão (contatos, oportunidades, conversas). Não cria evento no Google Calendar: a reunião fica no painel.
- **WhatsApp.** O envio usa a mesma fila de `whatsapp.start` (contato precisa de telefone válido), com o nome de quem está logado na assinatura. Máximo de 5 envios por pedido; o prompt só permite enviar quando a pessoa pede explicitamente. Fila aceita não prova entrega ou leitura.
- **Escopo e segurança.** Roda em `/api/workspace` (`assistant.chat`, `assistant.threads`, `assistant.thread`, `assistant.delete`), sempre com o escopo do workspace autenticado e as mesmas validações do painel (`writeData`). Vendedores não usam o assistente (usam a IA nas conversas atribuídas). Conteúdo de clientes é tratado como dado, não instrução. Cada escrita entra na auditoria como "Assistente de IA: …". Cada pedido conta como uma chamada no limite diário (`AI_DAILY_REQUEST_LIMIT`), mesmo com vários passos de ferramenta (máx. 8, cerca de 38 s).
- **Modelo.** `ANTHROPIC_MODEL` (padrão Haiku 4.5; Sonnet 4.6 também é aceito). Para pedidos com vários passos, Sonnet 4.6 tende a acertar mais.
- **Histórico.** Exige `supabase/migrations/202611040007_assistant.sql` (tabelas `assistant_threads` e `assistant_messages`, RLS forçada, só o servidor acessa). Aplique no SQL Editor do Supabase; é aditiva e repetível. Sem ela, o chat funciona normalmente, mas a conversa não é salva e a tela avisa. Cada pessoa vê apenas as próprias conversas.
- **Demonstração.** O modo demonstração não chama a IA e mostra o campo desativado.

Validação local: testes em `tests/assistant.test.ts` (laço de ferramentas com modelo simulado, isolamento por workspace, fuso das reuniões, limite de envios, ausência de exclusão e a migração em PGlite) e a navegação em Chromium com respostas simuladas para conferir o layout. Uma chamada real à API Anthropic e um envio real de WhatsApp pelo assistente **não foram validados neste ambiente**: dependem das chaves e da Evolution em produção.

## Automações (estilo Twenty CRM)

Implementado em 01/11/2026. Menu **Operação comercial → Automações** (`#workflows`). Cada automação é um **gatilho** e uma lista de **passos** executados em ordem no servidor, com histórico de execuções por passo.

- **Gatilhos.** Registro criado ou atualizado (contato, oportunidade, reunião, tarefa; em "atualizado" dá para limitar a campos, ex.: só quando a etapa muda), mensagem recebida (por canal), agendado (a cada hora, todo dia ou toda semana, no fuso do workspace; com objeto + condições roda para cada registro que atende, até 100 por disparo, ex.: oportunidades paradas há 7 dias) e manual. Condições opcionais: é igual, diferente, contém, maior/menor, vazio, preenchido, mudou, há mais/menos de N dias.
- **Passos.** Condição (para o fluxo se não atender), aguardar (minutos a 30 dias), atualizar registro (do gatilho, contato ou oportunidade relacionados), criar registro (contato, oportunidade, tarefa com vencimento em N dias, notas), etiquetas do contato, enviar WhatsApp (fila existente, assinatura "Equipe"), enviar e-mail (fila de e-mail da conta Google conectada, respeitando horário e limite diário), requisição HTTP (HTTPS público, mesma proteção SSRF dos webhooks), gerar com IA (Claude; o texto fica em `{{steps.<id>.text}}`; conta no limite diário de IA) e notificar a equipe (sino).
- **Variáveis.** `{{record.campo}}`, `{{contact.name}}`, `{{contact.email}}`, `{{deal.title}}`, `{{deal.value}}`, `{{steps.s2.text}}`, `{{steps.s3.body.campo}}`, `{{today}}`, `{{now}}`. "Contato" e "oportunidade" são os relacionados ao registro do gatilho.
- **Status.** Toda automação nasce como **rascunho**; só roda depois de **Ativar**. Pausar interrompe novos disparos (execuções na fila também param). "Executar" roda uma vez agora, com ações reais, e serve para testar um rascunho.
- **Assistente da tela inicial.** O chat cria, edita, pausa, executa e diagnostica automações (`create_automation`, `update_automation`, `activate_automation`, `pause_automation`, `run_automation`, `list_automation_runs`). Ele sempre cria como rascunho, mostra o resumo ("Quando… Se… Então…") e pergunta **"Posso ativar?"**. O servidor recusa ativar ou executar uma automação criada ou alterada na mesma resposta, então a ativação só acontece depois que a pessoa confirma em uma nova mensagem. Alterar uma automação ativa também exige confirmação. O chat não exclui automações.
- **Como roda.** Gatilhos no banco (`workflow_capture`) gravam eventos em `workflow_events` somente quando há automação ativa para aquele objeto e nunca bloqueiam a gravação original. O servidor transforma eventos em execuções (`workflow_runs`) e executa os passos: logo após gravações no painel/assistente e pelo agendador dedicado `supabase/workflows-scheduler.sql` (pg_cron a cada minuto, só chama o servidor quando há trabalho). "Aguardar" e "Agendado" dependem desse agendador.
- **Proteções.** Até 5 execuções por automação e registro por hora (evita laço quando uma automação altera o próprio registro) e 1.000 por automação por dia; o motivo aparece como execução "Parada". Passos de atualização que não mudam nada não gravam. Envios externos usam chaves determinísticas (WhatsApp e e-mail não duplicam em nova tentativa) e uma requisição HTTP interrompida não é repetida. Somente administradores e gestores acessam; tudo fica na auditoria. Excluir dados de um titular remove as execuções desse contato.
- **Banco.** Exige `supabase/migrations/202611050008_workflows.sql` (tabelas com RLS forçada, só o servidor acessa) e `supabase/workflows-scheduler.sql`. Aplique com `SUPABASE_PROJECT_REF=mdzflolthybnzewhpxno npm run workflows:migrate` (inclui também `202611040007_assistant.sql`) e confira com `npm run workflows:check`. Sem a migração, a tela avisa e nada é executado.
- **Demonstração.** Monta e salva automações no navegador, mas não ativa nem executa.

Validação local: `tests/workflows.test.ts` (validação, variáveis, condições, fuso dos agendamentos, execução passo a passo com espera e retomada, falhas, fila de e-mail, HTTP interrompido, regras do assistente, fan-out de eventos com limite por registro, migração e agendador em PGlite) e navegação em Chromium no modo demonstração. Envio real de WhatsApp/e-mail/HTTP e uma chamada real ao Claude por uma automação **não foram validados neste ambiente**.

## Privacidade, arquivos e validação

Arquivos de até 2 MB ficam no bucket privado `crm-files`, com download autorizado por link de 60 segundos. Links de documentos existentes continuam disponíveis. A exportação de titular inclui cadastro, mensagens, notas, agenda, oportunidades e metadados de arquivos; a exclusão remove os arquivos privados e registros vinculados. Documentos em serviços externos precisam ser excluídos no serviço de origem.

Retenção opcional anonimiza o conteúdo de mensagens antigas e limpa resumos antigos; não apaga cadastro, notas internas ou arquivos. Ative o agendador para executar essa política. O histórico automático pode ser ocultado na atividade da ficha sem destruir as mensagens usadas na Caixa de entrada.

Validação local: TypeScript, build Vite, testes de backend, SQL real em PGlite e navegação em Chromium. Mocks e demonstração não comprovam entrega externa, OAuth aprovado, pagamentos reais ou a reconexão do WhatsApp em produção.

## Workspaces de clientes e limite do chat de IA

Implementado em 01/11/2026. Exige `supabase/migrations/202611070010_platform_limits.sql` (aditiva e idempotente): `SUPABASE_PROJECT_REF=mdzflolthybnzewhpxno npm run platform:migrate`, conferir com `npm run platform:check`.

**Separação por workspace.** Cada cliente é dono do próprio workspace; contatos, conversas, agentes, equipe, configurações e uso ficam isolados pelas políticas RLS existentes. O cliente só vê os workspaces dos quais participa, então não enxerga a agência nem outros clientes.

- **Painel da agência** (menu **Clientes (agência)**, `#agency`): aparece só para os e-mails listados em `PLATFORM_ADMIN_EMAILS` na Vercel (e-mail confirmado). Ali a agência cria o workspace do cliente (nome da empresa + e-mail), adiciona contas que já existiam, entra em qualquer cliente, gera link de acesso e ajusta os limites do chat.
- **Novo cliente.** O servidor cria a conta pelo convite do Supabase Auth. Se o e-mail não puder ser enviado (limite de SMTP), a tela mostra um link de uso único para mandar ao cliente. Ao abrir, o cliente define a senha e entra no workspace dele.
- **Acesso oculto.** A agência entra como administradora com `hidden = true`: não aparece em Equipe, na lista de responsáveis nem no resumo diário, e o cliente não consegue alterá-la ou removê-la. Na auditoria do cliente as ações aparecem como "Agência". Se um e-mail sair de `PLATFORM_ADMIN_EMAILS`, o acesso oculto deixa de valer.
- **Cadastro público fechado.** A tela de login não oferece mais "Criar conta". Para bloquear também pela API, desative **Authentication → Sign In / Providers → Allow new users to sign up** no Supabase (o convite da agência continua funcionando, pois usa a API administrativa).

**Limite do chat de IA (estilo Claude).** Vale para o Assistente da tela inicial e o Playground, por pessoa em cada workspace:

- **Sessão de 5 horas:** começa na primeira mensagem e reinicia 5 horas depois. **Limite diário:** zera à meia-noite no fuso do workspace.
- O consumo é medido em custo equivalente de tokens (Haiku 4.5: US$ 1/5 por milhão de tokens de entrada/saída; Sonnet 4.6: US$ 3/15). Padrões: US$ 1 por sessão e US$ 3 por dia (`AI_CHAT_WINDOW_USD`, `AI_CHAT_DAILY_USD`). A agência pode personalizar por cliente.
- O cliente vê só a porcentagem: barra abaixo do campo do assistente e do Playground ("Sessão: 34% usada · reinicia em 2 h 13 min") e o quadro completo em **Uso da IA**. Ao chegar em 100%, a mensagem informa o horário de retorno.
- **SDR IA sem limite:** respostas automáticas no WhatsApp, widget, e-mail e Instagram, conversas de teste da Caixa de entrada, automações ("Gerar com IA") e resumos não são bloqueados. Cada chamada é registrada com o tipo em **Uso da IA**.
- No máximo duas respostas do chat em andamento por pessoa. Sem a migração, o servidor usa o limite diário antigo (`AI_DAILY_REQUEST_LIMIT`) e o medidor não aparece.

Validação local: `tests/platform-limits.test.ts` (janela de 5h, teto diário, pessoas independentes, SDR sem limite, chamadas simultâneas, RLS das novas tabelas em PGlite, mensagens, admins da agência e criação do workspace com Supabase simulado). Convite por e-mail real e o painel em produção **não foram validados neste ambiente**.
