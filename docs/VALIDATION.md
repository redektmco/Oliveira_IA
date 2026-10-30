# Verificação desta implementação

Verificado em 30/10/2026, no checkout `/workspace/Oliveira_IA`, com Node 24 e dependências do `package-lock.json`.

## Verificação local

- `npm ci --no-audit --no-fund`: instalação limpa concluída, sem alterar o lockfile.
- `npm run typecheck`: aprovado.
- `npm test`: 44 testes aprovados, nenhum ignorado. Inclui backend com Supabase/Claude simulados, Evolution, autenticação, automação de provisionamento e migrações/regras SQL em PGlite com Auth simulado. A ponte WhatsApp cobre whitelist, deduplicação, handoff, idempotência humana, leases, ecos, RLS e envio incerto.
- `npm run build`: aprovado; build Vite de produção gerado.
- `npm run test:e2e`: seis testes aprovados em Chromium, servindo build de produção. Cobrem a agente padrão Felipa preservando agentes personalizados, contatos/pipeline e recarga, CSV, agentes/conhecimento e recarga, bloqueio de Claude em demonstração, reuniões/ICS, menu móvel e atendimento humano.
- Capturas desktop e celular inspecionadas; sem transbordamento horizontal da página. Tabelas largas têm rolagem interna.

## Produção e integrações reais

Projeto Vercel principal `swift-coral-qbz2f6f`, escopo `redektmco-3675s-projects`, deploy atual `dpl_8an5ZTYyffAHsvhNdxoGVWa7ZvhD`, estado `READY`:

- `https://ai.v4oliveira.com.br` respondeu por HTTPS com certificado validado.
- Configuração Vercel do domínio: registro A `216.198.79.1`, `misconfigured: false`, sem conflitos.
- `/api/health` respondeu HTTP 200 com Supabase, banco e Anthropic configurados. O campo `verified: false` indica que esse endpoint somente verifica presença de variáveis.
- Na conferência final, `channels.whatsapp` indicou configuração presente. Status, webhook e worker recusaram chamadas sem autenticação com HTTP 401. Um evento autenticado de tipo não utilizado foi ignorado com HTTP 200, sem criar mensagem ou iniciar resposta.
- O JavaScript público contém a referência do projeto correto e não contém a chave de serviço Supabase, conforme inspeção automatizada sem impressão das chaves.

Foi reutilizado o projeto **Felipa IA** (`mdzflolthybnzewhpxno`, `us-east-2`), que estava sem tabelas públicas/usuários antes da preparação. Migração aplicada e oito tabelas com RLS e duas funções de IA verificadas. O projeto Lanna IA SDR foi preservado.

O comando remoto `SUPABASE_PROJECT_REF=mdzflolthybnzewhpxno npm run cloud:smoke -- --ai` terminou com código zero e confirmou:

- Login por e-mail/senha e persistência após logout/novo login.
- Criação/alteração de contatos e oportunidades, mudança de etapa, agentes, conhecimento, reuniões, conversas e mensagem humana.
- Segunda conta sem acesso ao contato da primeira, bloqueio de vínculos entre contas e de gravação/reserva de consumo pelo usuário.
- Chamada real ao Claude pela API de produção, usando uma FAQ da base de conhecimento, com resposta correta e mensagem persistida.
- Uso retornado: 408 tokens de entrada e 31 de saída.
- Remoção das duas contas temporárias e dos seus dados.

Esse teste remoto de CRM/Claude não valida entrega de e-mail de confirmação/recuperação, compartilhamento de equipe ou integrações externas de agenda/CRM. O teste Auth confirma contas administrativamente sem enviar e-mails. A verificação WhatsApp separada está abaixo.

## Cópia reivindicada

Foi publicado separadamente `https://swift-orbit-3oo3d8l.tmp.now`, deploy `dpl_F9hMPBoU5utvgHZVcQDC6QnPG8tG`, para entregar um novo claim link solicitado pelo usuário. A cópia foi reivindicada no mesmo time e recebeu a correção do formulário no deploy `dpl_H1GWWJdePeGv2C67hdvKZHqLnmdP`, estado READY. URL de produção: `https://swift-orbit-3oo3d8l-redektmco-3675s-projects.vercel.app`. A inspeção autenticada com `vercel curl` confirmou o CSS corrigido. O acesso público redireciona para login Vercel devido à proteção do projeto; essa configuração foi preservada.

Essa cópia não recebeu as credenciais privadas do projeto principal. O domínio principal e as integrações permanecem em `swift-coral-qbz2f6f`.

As instruções reutilizáveis foram salvas no rascunho do ambiente Codex. Salvar o rascunho não equivale a publicar o ambiente ou fazer deploy da aplicação.

## Correção do editor de agentes

Reproduzido o rodapé fora da área visível em 1366×768 e 390×844. O CSS dos modais de IA foi ajustado para manter cabeçalho e rodapé visíveis, com rolagem apenas no corpo. O checkbox Agente ativo também recebeu largura específica para evitar deslocar seu texto para fora do formulário.

Criação/edição verificadas no navegador. A inspeção final confirmou botões inteiros na tela, campos com rolagem e sem transbordamento interno, em 1366×768, 1280×600, 390×844, 320×568, 844×390 e 390×400. Captura móvel inspecionada. Typecheck, 32 testes, build e os seis testes E2E passaram após a correção.

A presença do novo CSS foi confirmada no domínio principal. A configuração e os limites atuais do código estão em [ARCHITECTURE.md](ARCHITECTURE.md).

## Diagnóstico Evolution real

Servidor `https://evo.madebyfelipe.agency`: HTTPS válido e versão pública 2.3.4. A configuração inicial `V4` retornou instância não encontrada. A busca restrita a uma variação única identificou o nome real `v4`.

O diagnóstico inicial autenticado `GET https://ai.v4oliveira.com.br/api/whatsapp-status` retornou HTTP 200 com `instance: "v4"`, `state: "open"`, `connected: true` e, antes da ativação, `messagingEnabled: false`. A chamada usou a chave Sensitive já cadastrada na Vercel, sem obter o valor do segredo de rede Codex.

O nome foi ajustado para `v4` na variável Vercel `WHATSAPP_EVO_INSTANCE` e republicado. O servidor aceita ambos os nomes de chave já utilizados pelo usuário; nenhum valor privado foi alterado.

Uma chamada sem sessão retornou HTTP 401. Os testes autenticados desse diagnóstico criaram contas temporárias confirmadas administrativamente, sem envio de e-mail; as contas foram removidas ao concluir.

`tests/evolution.test.ts` cobre destino HTTPS, aliases de credencial, respostas filtradas, erros, descoberta restrita do nome, autenticação e bloqueio de divulgação de chaves/telefones. Esses testes usam mocks; a evidência de conexão real é a consulta de produção acima.

## Ponte WhatsApp ativada

- A migração `202610300002_whatsapp.sql` foi aplicada no projeto correto. A instância `v4` está vinculada à conta existente e à agente Felipa ativa. Na ativação inicial, a whitelist continha somente as duas representações do mesmo número autorizado terminado em **8747**.
- O usuário autorizou explicitamente substituir o webhook n8n pelo painel. A configuração anterior foi guardada em `whatsapp_webhook_backup`, inacessível ao navegador. A API Evolution confirmou a alteração; uma consulta posterior confirmou URL `https://ai.v4oliveira.com.br/api/whatsapp-webhook`, segredo correspondente, `MESSAGES_UPSERT`, sem rotas por evento ou mídia base64.
- O vínculo no banco confirmou `enabled: true` e `webhook_verified: true`. A presença dessas condições habilita a indicação de ponte ativa em Integrações.
- Sete mensagens reais foram gravadas pelo webhook até a conferência final. Nenhum desses remetentes estava na whitelist; todas ficaram em atendimento humano, com tarefas `skipped`/`human_handoff` e nenhuma chamada à IA por essas entradas. A conferência usou contagens, sem expor conteúdo ou números completos.
- O envio único de teste para o destinatário autorizado terminado em **0188** retornou HTTP 200 e um identificador Evolution. Esse destinatário corresponde à própria linha conectada; o resultado comprova aceite da API, não entrega externa ou leitura.
- Separadamente, às **19h14 de 30/10/2026 (Brasília)**, chegou uma entrada real do número na whitelist. A tarefa `inbound` passou para `sent`, na primeira tentativa, sem código de erro, em cerca de 3,5 segundos. A mensagem de saída tem papel `assistant`, estado `sent` e identificador confirmado pelo provedor. O uso Claude relacionado está `completed`, modelo `claude-haiku-4-5-20251001`, com **3.573 tokens de entrada e 41 de saída**. Essa verificação confirma recebimento → Claude → aceite da resposta WhatsApp, sem fabricar entrada ou afirmar leitura.
- `pg_cron`, `pg_net` e Vault estão configurados. O job `felipa_whatsapp_retry` está ativo a cada minuto; a última execução consultada terminou em `succeeded`. Uma requisição real de `pg_net`, autenticada pelo segredo do Vault, recebeu HTTP 202 do worker, sem timeout ou erro de rede.
- A configuração anterior possui uma cópia privada preservada. Não houve reset do banco, troca da chave Evolution ou ampliação da whitelist.

Para repetir a conferência, envie **teste Felipa** do número terminado em **8747** para a linha terminada em **0188** e confira resposta, histórico e consumo no painel. Áudio e anexos seguem para atendimento humano; `sent` significa aceite pela Evolution.

As verificações locais e a execução do agendador validam a implementação, mas não garantem disponibilidade contínua da sessão Evolution ou créditos dos provedores. Operação e recuperação em [WHATSAPP.md](WHATSAPP.md).

## Ampliação autorizada da whitelist

Em 30/10/2026, o responsável solicitou adicionar o número terminado em **1111**. A alteração foi aplicada diretamente ao vínculo `v4`, preservando o número terminado em **8747**. Uma leitura posterior confirmou as quatro representações autorizadas (com/sem nono dígito para cada número), vínculo habilitado e webhook verificado. O novo número não tinha conversa em atendimento humano. Não foi enviada mensagem de teste nem alterada a configuração do webhook nessa operação.
