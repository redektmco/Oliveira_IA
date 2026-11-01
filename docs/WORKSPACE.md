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

## Privacidade, arquivos e validação

Arquivos de até 2 MB ficam no bucket privado `crm-files`, com download autorizado por link de 60 segundos. Links de documentos existentes continuam disponíveis. A exportação de titular inclui cadastro, mensagens, notas, agenda, oportunidades e metadados de arquivos; a exclusão remove os arquivos privados e registros vinculados. Documentos em serviços externos precisam ser excluídos no serviço de origem.

Retenção opcional anonimiza o conteúdo de mensagens antigas e limpa resumos antigos; não apaga cadastro, notas internas ou arquivos. Ative o agendador para executar essa política. O histórico automático pode ser ocultado na atividade da ficha sem destruir as mensagens usadas na Caixa de entrada.

Validação local: TypeScript, build Vite, testes de backend, SQL real em PGlite e navegação em Chromium. Mocks e demonstração não comprovam entrega externa, OAuth aprovado, pagamentos reais ou a reconexão do WhatsApp em produção.
