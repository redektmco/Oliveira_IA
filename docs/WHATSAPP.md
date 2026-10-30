# Ponte WhatsApp / Evolution

Instância de produção: `v4`, em `https://evo.madebyfelipe.agency`. Aplicação: `https://ai.v4oliveira.com.br`. A instância pertence à conta já existente no painel e usa a agente Felipa. A whitelist contém os números autorizados terminados em **8747** e **1111**; o banco também aceita a representação brasileira de cada número sem o nono dígito. O segundo número foi adicionado em 30/10/2026 por instrução do responsável, preservando o primeiro.

Em 30/10/2026, uma entrada real do número autorizado foi salva, respondida pelo Claude e teve envio aceito pela Evolution na primeira tentativa. Remetentes de fora da whitelist permaneceram em atendimento humano. Evidências em [VALIDATION.md](VALIDATION.md).

## Fluxo

1. A Evolution envia `MESSAGES_UPSERT` para `/api/whatsapp-webhook`, com um segredo próprio no cabeçalho `x-oliveira-webhook-secret`.
2. O servidor valida a instância, extrai apenas os dados necessários e grava a mensagem, contato, conversa e tarefa de processamento numa transação Supabase. O identificador externo evita duplicações.
3. Textos de números na whitelist seguem para a Felipa. Outros números, áudios e anexos ficam em atendimento humano. Grupos, status, reações, edições e eventos antigos anteriores à ativação não iniciam respostas.
4. A função de processamento utiliza instruções, conhecimento e histórico da conta. O uso real do Claude é registrado e mantém o limite diário configurado.
5. A resposta gerada é guardada na fila antes de enviar. O banco verifica novamente agente ativo, whitelist e estado da conversa antes da chamada Evolution.
6. A Evolution recebe `/message/sendText/v4`. O identificador devolvido é associado à mensagem no painel. Ecos de mensagens enviadas não acionam a IA.

## Atendimento humano

Na Caixa de entrada, **Assumir como humano** cancela respostas automáticas pendentes. O botão **Enviar pelo WhatsApp** envia o texto ao contato da conversa por uma fila protegida pela sessão do usuário. Pedidos repetidos com o mesmo identificador não criam outro envio. Uma mensagem manual pelo aplicativo WhatsApp também pausa a IA daquela conversa quando o evento é recebido.

**Retomar IA** permite novas mensagens automáticas apenas se o remetente estiver na whitelist e a agente continuar ativa. Conversas encerradas são preservadas; uma nova mensagem do cliente inicia outro atendimento.

A caixa atualiza os dados a cada cinco segundos enquanto estiver visível. Os estados distinguem mensagem na fila, enviando, enviada, falha, cancelamento e envio não confirmado. "Enviado" representa aceite pela Evolution; não é comprovação de leitura pelo cliente. Mensagens já encaminhadas ao provedor podem chegar durante uma mudança para atendimento humano.

## Retentativas e recuperação

A fila `whatsapp_jobs` usa leases e um bloqueio por conversa para impedir processamento concorrente do mesmo atendimento. Mensagens da conversa são processadas em ordem. A função Vercel usa `waitUntil` após guardar o evento; uma execução seguinte é iniciada quando há outras tarefas disponíveis.

O Supabase tem `pg_cron` e `pg_net`. O job `felipa_whatsapp_retry`, a cada minuto, chama a função protegida `/api/whatsapp-worker` apenas quando há tarefas pendentes ou leases expirados. O segredo dessa chamada fica no Supabase Vault, com nome `felipa_whatsapp_worker`, e na variável privada Vercel `WHATSAPP_WORKER_SECRET`. A aplicação funciona sem manter este ambiente Codex aberto.

Falhas anteriores ao envio e recusas temporárias permitem até quatro tentativas com espera crescente. Uma falha de rede durante o envio pode significar que a mensagem já saiu: nesses casos o estado é **envio não confirmado**, sem repetição automática. Um eco posterior pode confirmar o envio. O operador deve conferir o WhatsApp antes de enviar outra mensagem. Falhas definitivas ou envio incerto da IA encaminham a conversa para atendimento humano.

## Configuração e manutenção

Somente servidor:

- `WHATSAPP_EVO_URL`, `WHATSAPP_EVO_INSTANCE` e a chave `WHATSAPP_EVO_TOKEN` ou `WHATSAPP_TOKEN_EVO`.
- `WHATSAPP_WEBHOOK_SECRET`: segredo aleatório exclusivo do webhook.
- `WHATSAPP_WORKER_SECRET`: outro segredo aleatório, usado pelo agendador e operações internas.
- `WHATSAPP_OWNER_USER_ID`: conta autorizada a consultar e operar essa instância.

Não coloque esses segredos em `VITE_*`. Ao girar o segredo de processamento, atualize Vercel e o registro Vault juntos. Ao girar o segredo do webhook, atualize também os headers na Evolution. Repita o deploy após alterar variáveis Vercel.

A migração `202610300002_whatsapp.sql` cria a fila, o vínculo, as threads e as funções transacionais, com RLS e escrita somente pelo servidor. `supabase/whatsapp-scheduler.sql` configura o agendamento depois de o segredo ser armazenado no Vault. O provisionamento deve preservar o proprietário e agente existentes; não escolher outra conta quando houver ambiguidade.

`/api/whatsapp-admin` permite à operação interna inspecionar e configurar o webhook. Por padrão, recusa substituir outro webhook ativo. Uma substituição exige autorização explícita do responsável e `confirmReplace: true` na operação interna; a configuração anterior é preservada antes da troca. Nesta ativação, o responsável autorizou substituir o fluxo n8n pelo painel Felipa. A cópia de rollback em `whatsapp_webhook_backup` não é acessível pelo navegador. As operações com sessão de usuário exigem o proprietário definido no servidor.

Para restaurar o fluxo anterior, um administrador deve recuperar a configuração preservada diretamente no banco, reaplicá-la pela API Evolution e desabilitar `whatsapp_channels.enabled`. Não publique a URL completa ou os headers do backup em logs. O painel não oferece restauração automática.

Para interromper respostas automáticas, pause a agente no painel ou assuma a conversa como humano. Para mudar a whitelist, um operador autorizado deve atualizar `whatsapp_channels.ai_allowlist`; os demais usuários não podem escrever nessa tabela. Não ampliar a whitelist sem instrução do responsável.

## Verificações

`tests/whatsapp-bridge.test.ts` verifica parsing, autenticação, whitelist, deduplicação, intervenção humana, idempotência do envio humano, recuperação de lease, confirmação por eco, isolamento de contas e tratamento de envio incerto. SQL é executado em PGlite; serviços HTTP usam mocks. Os testes reais e o deploy ficam em `VALIDATION.md`.
