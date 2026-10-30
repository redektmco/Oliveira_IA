# Ativação do banco e da IA

Atualizado em 30/10/2026. A aplicação principal está em **https://ai.v4oliveira.com.br**, no projeto Vercel `swift-coral-qbz2f6f`, escopo `redektmco-3675s-projects`. DNS, HTTPS, Supabase e uma resposta real do Claude foram verificados.

## Projeto conectado

Foi reutilizado o projeto Supabase **Felipa IA**, referência `mdzflolthybnzewhpxno`, região `us-east-2`, na organização do usuário. Antes da migração, ele não tinha tabelas públicas nem usuários Auth. Não foi criado outro projeto nem alterado o projeto separado Lanna IA SDR.

- Migração inicial aplicada; oito tabelas com RLS e duas funções de IA verificadas.
- Site URL do Auth configurada para `https://ai.v4oliveira.com.br`, preservando redirecionamentos existentes.
- Cinco variáveis Supabase cadastradas em Production na Vercel; a chave de serviço está como Sensitive.
- Credencial Anthropic configurada no servidor da Vercel. O backend aceita `ANTHROPIC_API_KEY` ou `AI_SECRET_CLAUDE`; o primeiro tem precedência.
- Migração WhatsApp aplicada, conta/agente Felipa vinculados e whitelist restrita aos números autorizados terminados em **8747** e **1111**.
- Webhook Evolution ativado e conferido por leitura posterior; configuração anterior do n8n preservada em tabela privada, após autorização explícita para substituí-la.
- Agendador `felipa_whatsapp_retry` ativo a cada minuto, com segredo no Vault e última execução bem-sucedida.
- Publicação atual de produção `dpl_8an5ZTYyffAHsvhNdxoGVWa7ZvhD`, estado `READY`, com banco, formulário corrigido e ponte WhatsApp.

O teste remoto confirmou login, CRUD comercial, persistência após novo login, isolamento entre duas contas, bloqueio de referências entre contas, restrição das funções de consumo e resposta real do Claude baseada em uma FAQ. A resposta utilizou 408 tokens de entrada e 31 de saída e foi gravada na conversa. As duas contas temporárias e seus dados foram removidos. Consulte [VALIDATION.md](VALIDATION.md).

## Verificação e manutenção

Na raiz `/workspace/Oliveira_IA`, com Node 24 e o vínculo seguro de gerenciamento disponível:

```sh
SUPABASE_PROJECT_REF=mdzflolthybnzewhpxno npm run cloud:check
```

Esse comando somente consulta o gerenciamento Supabase. `SUPABASE_ACCESS_TOKEN` deve vir de **Account → Access Tokens**; chaves de **Project Settings → API** não servem para gerenciamento. A correção do token já foi aplicada e validada. Não coloque esse token no frontend ou na Vercel.

Para reaplicar a configuração quando autorizado:

```sh
SUPABASE_PROJECT_REF=mdzflolthybnzewhpxno npm run cloud:apply
```

A automação confirma o destino Vercel e recusa substituir outra conexão Supabase. Reutiliza o projeto selecionado, aplica as migrações em ordem, verifica RLS/funções, preserva Auth e envia as chaves Supabase necessárias à Vercel pela entrada padrão da CLI. Nenhuma dessas chaves é impressa, escrita em arquivo ou passada em argumento do shell. Variáveis de outros serviços são preservadas. Esse comando não gera segredos WhatsApp nem altera o webhook; veja [WHATSAPP.md](WHATSAPP.md). Projetos existentes não são resetados; planos, instâncias e senhas existentes não são alterados.

Não omita a referência acima neste ambiente: o projeto existente tem o nome Felipa IA, enquanto o nome padrão para uma criação nova é `oliveira-ia`. Uma criação nova exige organização gratuita e região disponível; esse fluxo não foi necessário para a ativação concluída.

O destino é `prj_R2tORvecB6fdG3jIpbCt0DBVrT2e`, escopo `redektmco-3675s-projects`. A CLI reutiliza o login existente nos diretórios XDG `/workspace/.vercel-cli/{data,config,cache}`. O script usa o proxy e a confiança TLS do ambiente.

## Teste remoto

```sh
SUPABASE_PROJECT_REF=mdzflolthybnzewhpxno npm run cloud:smoke
SUPABASE_PROJECT_REF=mdzflolthybnzewhpxno npm run cloud:smoke -- --ai
```

Esses comandos criam duas contas temporárias confirmadas administrativamente, sem enviar e-mails, e removem os dados e contas ao concluir. A opção `--ai` faz uma chamada real cobrada à Anthropic através da aplicação principal. Chaves e sessões ficam apenas em memória. Revise qualquer falha de limpeza informada pelo comando.

## Credenciais e novas publicações

Um segredo de rede do ambiente Codex não configura automaticamente a Vercel. Placeholders do proxy não podem ser copiados como credenciais reais. O vínculo Claude deste ambiente permite `ai.v4oliveira.com.br`; as chamadas Anthropic desta aplicação ocorrem no servidor Vercel. Para chamadas locais diretas à Anthropic, seria necessário permitir `api.anthropic.com` no vínculo existente.

As variáveis públicas `VITE_SUPABASE_*` são incorporadas ao build. Depois de alterar configurações, publique novamente e teste o destino correto:

```sh
npm run typecheck
npm test
npm run build
npm run deploy:production
```

`/api/health` verifica apenas presença de configuração, mantendo `verified: false`; a evidência de uso real vem dos testes remotos. Para confirmação/recuperação de e-mail em produção, configure SMTP no Supabase e teste a entrega ao destinatário. O teste administrativo não comprovou entrega de e-mails.

A consulta `GET /api/whatsapp-status` é protegida pela sessão Supabase e pela conta proprietária. A configuração principal usa `WHATSAPP_EVO_URL=https://evo.madebyfelipe.agency`, `WHATSAPP_EVO_INSTANCE=v4` e a chave Sensitive existente `WHATSAPP_TOKEN_EVO` (alias de `WHATSAPP_EVO_TOKEN`). O teste real confirmou sessão `open`. O botão está em Integrações; `messagingEnabled` considera o vínculo habilitado e o webhook verificado.

O webhook ativo é `/api/whatsapp-webhook`; o processamento usa uma fila Supabase e `/api/whatsapp-worker`. Mensagens reais de fora da whitelist foram guardadas para humano sem acionar Claude. A Evolution aceitou o teste de envio autorizado, destinado à própria linha conectada. Separadamente, uma mensagem real do número autorizado terminado em **8747** percorreu toda a ponte: entrada salva, resposta Claude e envio aceito pela Evolution na primeira tentativa. O consumo dessa resposta foi de 3.573 tokens de entrada e 41 de saída. Isso comprova o fluxo, sem afirmar leitura pelo destinatário. Veja [ARCHITECTURE.md](ARCHITECTURE.md) e [VALIDATION.md](VALIDATION.md).

Foi criada também a cópia `swift-orbit-3oo3d8l.tmp.now`, depois reivindicada e atualizada com a correção do formulário. Essa cópia não recebeu chaves Supabase/Claude/WhatsApp e não substitui o projeto principal nem seu domínio. Será necessário configurar suas variáveis e republicar caso ela seja escolhida como novo destino. Seu acesso está protegido pelo login Vercel.

As instruções reutilizáveis e a referência pública do projeto foram salvas no rascunho de configuração do ambiente Codex. Salvar esse rascunho não aplica nem publica o ambiente; revise, salve e publique nas configurações para reutilizar esses ajustes em novas tarefas.
