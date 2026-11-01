# API e banco

O backend roda como funções Node da Vercel. Em desenvolvimento, `npm run dev` inicia a mesma lógica na porta interna `3001`; o Vite encaminha `/api` para ela. `server/dev.ts` lê `.env.local` e `.env` sem substituir bindings já fornecidos pelo processo.

## Configuração

Configure estas variáveis somente no servidor/local e nas configurações do projeto Vercel:

- `SUPABASE_URL` e `SUPABASE_ANON_KEY`: projeto e chave pública Supabase. Se omitidas, o servidor reutiliza `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
- `SUPABASE_SERVICE_ROLE_KEY`: chave secreta do backend para reservar uso e gravar respostas. Nunca prefixe com `VITE_`.
- `ANTHROPIC_API_KEY` ou `AI_SECRET_CLAUDE`: chave da API criada no console Anthropic com créditos disponíveis. O nome padrão tem precedência se ambos existirem. O alias preserva o nome já cadastrado pelo usuário. Assinatura do aplicativo Claude não substitui créditos da API.
- `AI_CHAT_WINDOW_USD` / `AI_CHAT_DAILY_USD`: limite do chat de IA (Assistente e Playground) por pessoa, em US$ equivalentes ao preço público por token; padrão `1` por sessão de 5 horas e `3` por dia (fuso do workspace). O SDR IA, automações e resumos não têm limite. A agência pode personalizar por cliente.
- `AI_DAILY_REQUEST_LIMIT`: legado, usado só enquanto a migração `202611070010_platform_limits.sql` não for aplicada.
- `PLATFORM_ADMIN_EMAILS`: e-mails confirmados da equipe da agência; libera o painel de clientes.
- `ANTHROPIC_MODEL`: fallback opcional caso um agente não defina modelo. O padrão é `claude-haiku-5-5` (Claude Haiku 5.5). Agentes salvos com Haiku 4.5 passam a usar Haiku 5.5.
- `WHATSAPP_EVO_URL`, `WHATSAPP_EVO_INSTANCE` e `WHATSAPP_EVO_TOKEN` (ou alias `WHATSAPP_TOKEN_EVO`): configuração privada de servidor para consultar e enviar pela instância Evolution. Nenhuma dessas variáveis deve usar prefixo `VITE_`.
- `WHATSAPP_WEBHOOK_SECRET`: proteção da entrada Evolution por cabeçalho próprio.
- `WHATSAPP_WORKER_SECRET`: proteção do processamento agendado e operações internas; deve coincidir com o segredo `felipa_whatsapp_worker` no Supabase Vault.
- `WHATSAPP_OWNER_USER_ID`: UUID da conta proprietária autorizada a operar a instância.

Modelos aceitos: `claude-haiku-5-5` e `claude-sonnet-4-6`. As chamadas não enviam `temperature` (Haiku 5.5 recusa valores fora do padrão), usam `output_config.effort: "medium"` e `max_tokens` 8.192 para deixar espaço ao raciocínio (thinking adaptativo, ligado por padrão no Haiku 5.5). Exige `supabase/migrations/202611080011_haiku_5_5.sql` (`npm run haiku:migrate`). O modelo escolhido precisa estar disponível na conta Anthropic; nenhum acesso externo foi pressuposto ou validado sem as credenciais.

Aplique os arquivos de `supabase/migrations/` em ordem antes de usar a aplicação autenticada. Cada conta tem um workspace privado; compartilhamento de equipe ainda não foi implementado. Excluir contato ou agente com referências é bloqueado; desvincule/exclua os dependentes primeiro.

Para um piloto privado, desabilite cadastro público no Supabase após criar/convidar as contas autorizadas. Um limite por conta não limita o número de contas. Configure também um limite de gastos no console Anthropic: a quota de chamadas não é um orçamento financeiro.

## Contratos

`GET /api/health` retorna apenas presença de configuração e canais implementados:

```json
{
  "status": "configuration_required",
  "configured": { "supabase": false, "database": false, "anthropic": false },
  "verified": false,
  "channels": { "web": true, "whatsapp": false }
}
```

O exemplo representa ausência de configuração. `configured` e `channels.whatsapp` não significam que a credencial funciona ou que o canal está ativo: indicam presença das variáveis. A verificação externa exige login, consulta ao banco, resposta de um agente e, no WhatsApp, inspeção do webhook e troca real de mensagens.

`POST /api/chat` exige `Content-Type: application/json` e `Authorization: Bearer <access_token Supabase>`. O backend valida a sessão com Supabase; não aceita identidade informada pelo navegador.

```json
{
  "agentId": "UUID do agente",
  "message": "Gostaria de conhecer os serviços",
  "history": [
    { "role": "user", "content": "Olá" },
    { "role": "assistant", "content": "Como posso ajudar?" }
  ]
}
```

Para conversa persistida, envie `conversationId` e omita `history`; o backend consulta o histórico do dono no banco. O agente precisa estar ativo, pertencer à conta e ser o agente da conversa. A conversa precisa usar canal `web` e status `ai`. Resposta:

```json
{
  "text": "Resposta do Claude",
  "usage": { "input_tokens": 123, "output_tokens": 45 },
  "conversationId": "UUID, quando fornecido"
}
```

Erros usam `{ "error": "mensagem pública" }`. Credenciais, conteúdo das requisições e mensagens internas do provedor não são devolvidos nem registrados em logs pela implementação. HTTP `401` indica sessão ausente/expirada; `400` dados inválidos; `409` agente/conversa indisponível; `429` quota ou limite temporário do provedor; `503` configuração/banco indisponível; `502/504` falha/timeout do provedor.

Limites: corpo de até 64 KiB; mensagem atual de até 4.000 caracteres; Playground com até 20 mensagens de histórico, 4.000 caracteres cada e 24.000 no total. O servidor usa até 40 mensagens recentes de conversas e limita o contexto a 24.000 caracteres. A base usa os 30 documentos mais recentes, até 10.000 caracteres de cada e 32.000 no conjunto; a interface deve manter o conteúdo relevante conciso. Não há busca vetorial, processamento de PDF nem leitura automática de URLs. Respostas têm `max_tokens = 1024`, timeout de 35 segundos e nenhum retry automático que pudesse multiplicar cobrança.

A quota é reservada atomicamente no PostgreSQL antes de chamar a Anthropic, com bloqueio transacional por usuário. O banco contabiliza a tentativa mesmo se a API falhar. Em conversas web, o par usuário/assistente só é gravado depois da resposta e em uma transação; uma falha do provedor não deixa meia conversa nem duplica a mensagem em uma nova tentativa. A RPC verifica novamente o estado de intervenção humana sob bloqueio antes de gravar. Chamadas web concorrentes para uma mesma conversa ainda podem responder com o mesmo histórico; o frontend desabilita envios enquanto aguarda. No WhatsApp, o recebimento é salvo antes da IA e o processamento usa fila com bloqueio por chat.

As respostas da IA auxiliam o atendimento. Pontuação de leads e agendamentos são registrados pela equipe; o modelo não possui ferramentas para alterar CRM, iniciar campanhas ou confirmar calendário. O servidor entrega a resposta pelo canal da conversa, inclusive WhatsApp quando o remetente está autorizado.

`GET /api/whatsapp-status` exige `Authorization: Bearer <access_token Supabase>` e retorna uma consulta real da conexão Evolution, com `Cache-Control: private, no-store`:

```json
{
  "provider": "evolution",
  "instance": "v4",
  "state": "open",
  "connected": true,
  "messagingEnabled": true
}
```

O JSON acima ilustra o contrato. Estados aceitos: `open`, `close` e `connecting`. A consulta exige a conta proprietária, usa o endpoint fixado pela configuração do servidor, não aceita destinos do navegador, não segue redirecionamentos e nunca retorna o payload bruto do provedor. `connected` descreve a sessão do número; `messagingEnabled` considera o vínculo habilitado e o webhook verificado no banco. HTTP 401 representa sessão Supabase ausente/expirada, 403 outra conta, 503 configuração incompleta e 502 falha na consulta Evolution. A UI oferece essa verificação somente fora da demonstração.

## API WhatsApp

- `POST /api/whatsapp-webhook`: exige `x-oliveira-webhook-secret`; aceita eventos da instância configurada, grava a entrada e fila atomicamente e confirma duplicados sem criar outra tarefa. Responde 503 se a gravação falhar, permitindo retentativa pelo provedor.
- `POST /api/whatsapp-worker`: exige Bearer `WHATSAPP_WORKER_SECRET`; responde 202 e processa uma tarefa em segundo plano. É chamado após receber uma entrada, ao encadear tarefas e pelo agendador Supabase.
- `POST /api/whatsapp-send`: exige sessão Supabase e conversa WhatsApp própria em atendimento humano. Corpo `{ "conversationId": "UUID", "requestId": "UUID estável por envio", "text": "Até 4.000 caracteres" }`. Responde 202 com `{ "queued": true, "id": "UUID da tarefa" }`; repetir o mesmo identificador não duplica o envio.
- `GET /api/whatsapp-admin`: inspeção filtrada para a conta proprietária ou operação interna. Não devolve chave, URL privada de backup nem telefone completo.
- `POST /api/whatsapp-admin`: somente operação interna. `operation: "configure"` preserva o webhook anterior e confere a configuração aplicada. Substituir outro destino ativo exige autorização e `confirmReplace: true`. `operation: "test"` destina-se a envio de teste previamente autorizado, não a campanhas.

O webhook aceita conversas individuais e textos. Mídia segue para humano, sem baixar anexos. A whitelist é checada antes da IA e novamente antes do envio. A fila distingue aceite pelo provedor, falha e envio incerto; não repete automaticamente um envio ambíguo. Detalhes de operação e recuperação em [WHATSAPP.md](WHATSAPP.md).

## Validação executada

`tests/backend.test.ts` executa testes de validação, autenticação, filtros de dono na camada Supabase, histórico, modelos permitidos, intervenção humana, limites de quota, consumo retornado pelo provedor, falhas e mensagens públicas seguras. Dependências externas são simuladas nesses testes; eles não representam chamadas reais à Anthropic ou ao Supabase.

`tests/database.test.ts`, incluído em `npm test`, inicia PostgreSQL WASM (PGlite 0.5.10), aplica a migração duas vezes e executa `supabase/tests/security.sql`, com infraestrutura `auth` simulada. A migração e as assertivas passaram. Isso não substitui aplicar a migração e testar login/RLS no projeto Supabase de destino, nem valida concorrência entre conexões ou entrega a serviços externos.

`tests/evolution.test.ts` valida o destino HTTPS, alias da chave, consulta somente de leitura, bloqueio de redirecionamentos, respostas filtradas, erros sem credenciais e autenticação antes do acesso ao provedor. Os testes usam respostas simuladas; o resultado real fica em `VALIDATION.md`.


## Ficha CRM e triagem automática

Web e WhatsApp usam saída JSON estruturada do Claude para resposta e triagem, validada antes de persistir. O servidor calcula a média dos quatro critérios; desconhecidos contribuem zero e impedem qualificação até que todos sejam conhecidos. A classificação respeita o limiar do agente. Contexto: resumo anterior, até 80 mensagens recentes do contato (18 mil caracteres) e conversa atual. Mensagens com envio pendente, falho, incerto ou cancelado não entram no contexto consolidado.

`append_triaged_turn` salva o turno Web e a ficha atomicamente. `whatsapp_save_triaged_reply` preserva leases, deduplicação, whitelist, handoff e fila existentes; o resumo nunca é enviado ao cliente. Versão otimista `crm_revision` impede sobrescrita por análise antiga; mudanças de texto ou cadastro invalidam análises em andamento. A conta autenticada não pode forjar campos de proveniência da IA.

O Playground sem conversa e a demonstração não atualizam a ficha por IA. Conversas em atendimento humano continuam sob controle da equipe. A ficha consulta atualizações a cada oito segundos enquanto visível. Documentos são links HTTPS cujo acesso é controlado pelo serviço de origem.
