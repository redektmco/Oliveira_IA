# O que falta para fechar o MVP

Revisão de 02/11/2026, depois da ficha de oportunidade, da padronização visual e da revisão de login e segurança. Compara cada etapa do fluxo comercial com o que CRMs de referência (Twenty, Pipedrive, HubSpot) entregam e separa o que **bloqueia o MVP** do que pode vir depois.

## Situação por etapa

| Etapa | Referência de mercado | Oliveira IA hoje | Status |
| --- | --- | --- | --- |
| Entrada do lead | Formulários, inbox de canais, criação automática de registro | WhatsApp (Evolution), widget, Instagram e API criam contato e oportunidade em **Novo lead** | ✅ Pronto |
| Qualificação | Campos de qualificação, score, atividades | Triagem por IA (orçamento, necessidade, autoridade, prazo) com evidências e score na ficha do contato | ✅ Pronto |
| Primeiro contato ativo | Iniciar conversa/e-mail a partir do registro | **Nova conversa → WhatsApp** envia ao telefone do contato (corrigido nesta versão). E-mail só responde a conversas existentes | ⚠️ Parcial |
| Pipeline | Kanban por etapa com soma, arrastar e soltar, filtros, visão em tabela (Twenty, Pipedrive) | Kanban com arrastar e soltar, soma e contagem por etapa, tabela ordenável, filtros por responsável e status, filtro de atrasadas, exportação CSV | ✅ Pronto |
| Ficha da oportunidade | Página do registro com campos, etapa, linha do tempo, tarefas, notas, arquivos, e-mails (Twenty); barra de etapas e ganho/perda com motivo (Pipedrive) | Barra de etapas clicável, ganho/perda com motivo obrigatório, campos (valor, probabilidade, previsão, responsável, próximo passo, descrição), linha do tempo automática, tarefas, notas, reuniões e conversas do contato | ✅ Pronto |
| Agenda | Reuniões vinculadas, sincronização de calendário | Reuniões manuais e marcadas pela IA, Google Calendar por SDR, ICS | ✅ Pronto (a migração 0004 só foi aplicada em produção em 02/11/2026; valide a conexão do Google Calendar) |
| Fechamento | Ganho/perda, motivos, receita do período | Ganho/perda com data e motivo, receita ganha no mês, taxa de ganho | ✅ Pronto |
| Gestão | Relatórios de funil, previsão, atividades por vendedor | Visão geral com indicadores e previsão ponderada no pipeline | ⚠️ Básico |

## Bloqueia o MVP (fazer antes de vender)

1. **Validação real em produção** do que entrou nesta versão. Faça login, crie uma oportunidade, mova de etapa, crie tarefa e nota e confira a linha do tempo. Envie uma mensagem pela **Nova conversa → WhatsApp** para um número de teste e confirme a entrega no aparelho. Os testes automatizados não substituem esse teste.
2. **Lembrete de tarefas atrasadas.** As tarefas aparecem atrasadas na ficha e no kanban, mas ninguém é avisado. Mínimo: uma notificação no sino ou um resumo diário por e-mail para o responsável.
3. **E-mail transacional (SMTP) no Supabase.** Sem SMTP próprio, a confirmação de cadastro e a recuperação de senha ficam sujeitas ao limite do serviço padrão. É necessário para o login funcionar com clientes.
4. **Cadastro aberto ou só por convite.** Hoje qualquer pessoa pode criar conta. Para o piloto pago, desative inscrições públicas no Supabase (Authentication → Sign In / Providers) e use convites da equipe. O texto da tela de login já orienta quem tentar se cadastrar.
5. **Termos de uso e política de privacidade (LGPD)** linkados no login e no widget. O consentimento já é registrado, mas falta o texto legal.

## Importante, mas pode vir logo depois

- **Vários pipelines** (ex.: vendas novas × expansão) e **etapas configuráveis**. Twenty e Pipedrive permitem; aqui as 7 etapas são fixas.
- **Empresas como entidade própria** (Twenty: Companies ligadas a pessoas e oportunidades). Hoje a empresa é um campo de texto do contato.
- **Produtos/itens na oportunidade**, para compor o valor a partir de uma tabela de preços.
- **Relatórios**: conversão entre etapas, tempo médio por etapa, motivos de perda e ranking por vendedor. Os dados já são gravados em `deal_events`.
- **Arquivos na oportunidade.** Hoje os arquivos ficam na ficha do contato.
- **Visões salvas** (filtros nomeados, como as Views do Twenty) e **edição em massa** na tabela.
- **E-mail ativo** a partir da ficha (iniciar uma conversa nova, não só responder).
- **Importação de contatos e oportunidades por CSV.**

## O que foi feito nesta versão

- **Ficha de oportunidade** (`#pipeline/ID`) e tela de oportunidades com kanban, tabela, filtros, previsão ponderada e exportação.
- **Linha do tempo automática** via trigger no banco: registra criação, etapa (com motivo de perda), valor, responsável e previsão, com autor. Mudanças feitas pela IA aparecem como “Automação da IA”.
- **Nova conversa pelo WhatsApp**: antes, “+ Nova” criava só uma conversa interna de teste, e a mensagem nunca saía do painel.
- **Login**: mensagens de erro específicas (senha incorreta, e-mail não confirmado, limite de tentativas, cadastro fechado), reenvio de confirmação, confirmação de senha, mostrar/ocultar senha, aviso de link expirado, logout que não trava sem rede, volta automática ao login quando a sessão expira e correção do workspace salvo que deixava de abrir quando o acesso era removido.
- **Segurança**: CSP e HSTS no app; mensagens de cliente e de IA não podem mais ser forjadas pela API pública do Supabase; nomes de arquivo com `..` são recusados; sessão sem identificador vira 401; vendedor não usa a IA em conversa sem contato.
- **Design system compacto** (`src/styles/system.css`): escala única de fonte (11/12/13/15/18/24), espaçamento em grade de 4px, controles de 32px, raios 4/6/8/12 e o mesmo cabeçalho de página, KPIs, tabelas, badges e diálogos em todas as telas. Também corrigiu o desalinhamento das colunas na tabela de contatos.
