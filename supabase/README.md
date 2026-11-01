# Banco de dados

Crie um projeto Supabase e execute os arquivos de `migrations/` em ordem no SQL Editor como `postgres`, ou vincule o Supabase CLI ao projeto e use `supabase db push`. A primeira migração cria o CRM; `202610300002_whatsapp.sql` adiciona a ponte WhatsApp. Elas usam `auth.users`, `auth.uid()`, `auth.role()` e os papéis padrão do Supabase. Não execute em um banco PostgreSQL sem essa infraestrutura. Reexecutar as migrações é seguro para este mesmo esquema; elas não transformam estruturas antigas/incompatíveis.

Cada conta autenticada tem seu próprio workspace privado. Todas as tabelas têm RLS; o navegador usa a chave pública do Supabase e só acessa registros cujo `user_id` é o próprio usuário. Não existe compartilhamento com equipe ou acesso administrativo a outras contas nesta versão.

As referências a contatos, agentes e conversas usam chaves estrangeiras compostas `(user_id, id)`. Isso impede vincular dados de outro usuário mesmo conhecendo o UUID. Excluir uma conversa exclui suas mensagens. Excluir um contato ou agente ainda referenciado é bloqueado: desvincule/exclua os negócios, reuniões ou conversas que o utilizam primeiro. Excluir a conta de autenticação exclui seus dados.

`ai_usage` pode ser consultada pelo dono, mas inserção, edição e exclusão são reservadas ao backend com `SUPABASE_SERVICE_ROLE_KEY`. Nunca exponha essa chave ao navegador.

O backend chama `public.reserve_ai_request(p_user_id uuid, p_model text, p_daily_limit integer default 50)`, que retorna o UUID de uma linha `pending` em `ai_usage`. Somente `service_role` pode executar a RPC. A reserva usa bloqueio transacional por usuário e conta todas as tentativas no dia UTC, inclusive as que falharem, impedindo que múltiplas instâncias contornem a cota. Ao atingir o limite, retorna SQLSTATE `P0001`, mensagem `AI_DAILY_LIMIT_REACHED`. O backend deve atualizar essa reserva para `completed` ou `failed`, com o consumo real quando disponível.

O limite de chamadas não é limite financeiro: o tamanho da entrada/saída, modelo e preços da Anthropic também afetam o custo. Configure um limite de gastos na conta da Anthropic.

Ao responder uma conversa persistida, o backend chama `public.append_ai_turn(p_user_id uuid, p_conversation_id uuid, p_user_content text, p_assistant_content text)`. Essa RPC é exclusiva de `service_role`, bloqueia a conversa durante a gravação e verifica novamente dono, canal `web` e estado `ai`. Os dois textos são inseridos atomicamente; uma conversa assumida por humano ou encerrada durante a chamada ao Claude não recebe o turno. A mensagem do usuário admite até 4.000 caracteres, e a resposta até 16.000. Os horários de inserção preservam a ordem usuário/assistente. Uma conversa indisponível retorna SQLSTATE `P0001`, mensagem `CONVERSATION_NOT_AI`.

O canal `whatsapp` é alimentado pelo webhook Evolution. `whatsapp_channels` fixa conta, agente, whitelist e ativação; `whatsapp_threads` associa o chat externo à conversa; `whatsapp_jobs` mantém a fila e as funções transacionais de deduplicação, lease, envio e intervenção humana. Usuários autenticados podem consultar somente seus vínculos/tarefas; as escritas e RPCs são exclusivas do servidor. `whatsapp_webhook_backup` preserva a configuração anterior do provedor e não é consultável por `anon` ou `authenticated`.

Após configurar o segredo `felipa_whatsapp_worker` no Supabase Vault, aplique `whatsapp-scheduler.sql` para criar `pg_cron`, `pg_net` e o job de recuperação a cada minuto. O arquivo contém a URL da produção atual; ajuste se o domínio mudar. O token deve coincidir com `WHATSAPP_WORKER_SECRET` da Vercel. Não salve seu valor no SQL versionado. Veja [a operação WhatsApp](../docs/WHATSAPP.md).

`workflows-scheduler.sql` agenda (pg_cron, a cada minuto) a fila das automações criadas pela migração `202611050008_workflows.sql`. Só chama `/api/whatsapp-worker?workflows=1` quando há eventos, execuções vencidas ou automações agendadas ativas, e reutiliza o mesmo segredo do Vault.

## Verificação

`tests/security.sql` pode ser executado como `postgres` após a migração em um projeto descartável. Ele cria duas contas de teste em uma transação e termina com `rollback`, validando RLS, isolamento entre donos, referências cruzadas, bloqueio de gravações de uso pelo cliente, cota diária, ordem de mensagens, intervenção humana e exclusão em cascata. Não rode testes de infraestrutura em um projeto de produção.

`tests/database.test.ts`, executado por `npm test`, aplica a migração duas vezes e executa esse arquivo em PostgreSQL WASM (PGlite), com os papéis e funções `auth` simulados. Isso valida o SQL e as políticas no mecanismo PostgreSQL; ainda é necessário aplicar a migração no seu projeto Supabase e validar autenticação/requisições reais. Chamadas simultâneas de múltiplas conexões e integrações externas não foram executadas nesse teste.
