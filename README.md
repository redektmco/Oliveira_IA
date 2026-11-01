# Oliveira IA

Primeira versão funcional do fluxo comercial do protótipo Felipa: React, TypeScript e Vite; autenticação e PostgreSQL no Supabase; Claude pela API Anthropic em funções da Vercel.

## O que funciona

- Login, criação de conta, confirmação de e-mail e recuperação de senha via Supabase.
- CRM em **Contatos / CRM → Abrir ficha**: cadastro, notas, etiquetas, documentos por link, responsável, agenda e histórico.
- Triagem automática no Web e WhatsApp: resumo factual, próxima ação, score e quatro critérios com evidências (orçamento, necessidade, autoridade e prazo). A ficha atualiza durante o atendimento por IA.
- Oportunidades em kanban (arrastar e soltar) ou tabela, com filtros, previsão ponderada e exportação CSV. Cada oportunidade tem ficha própria (`#pipeline/ID`): barra de etapas, ganho/perda com motivo, responsável, previsão de fechamento, probabilidade, tarefas, notas, linha do tempo automática e reuniões/conversas do contato.
- Caixa de entrada → **Nova conversa** envia a primeira mensagem pelo WhatsApp para o telefone do contato, ou cria um teste interno com a IA.
- Reuniões com horário, duração, histórico e exportação de calendário ICS.
- Pipeline automático: cada lead que chega por um canal vira oportunidade em **Novo lead** e avança conforme a triagem da IA.
- A IA oferece horários livres do SDR e marca a reunião quando o cliente confirma, com sincronização no Google Calendar do SDR e link do Meet. Veja [Agenda e pipeline](docs/WORKSPACE.md#agenda-e-pipeline-automáticos).
- Agentes com identidade, instruções, modelo e pausa de atendimento.
- Base de conhecimento em texto, com importação de `.txt` e `.md`.
- Playground com chamada real ao Claude e consumo retornado pela API.
- Conversas internas salvas, com alternância entre IA, atendimento humano e encerramento.
- Uso da IA, quota diária persistida e isolamento de dados por conta usando RLS.
- WhatsApp via Evolution: webhook autenticado, contatos/conversas salvos, respostas da Felipa para a whitelist e envio humano pelo painel.
- Fila persistida com deduplicação, recuperação automática e indicação de falha ou envio não confirmado.
- Demonstração independente de credenciais, com dados locais claramente identificados e nenhuma resposta de IA simulada.

Cada conta tem um workspace privado. Equipe compartilhada, múltiplas organizações, assinaturas/cobrança, automações de follow-up e sincronização com CRM externo não fazem parte desta primeira versão. No WhatsApp, a IA atende textos de números autorizados; demais números, áudios e anexos ficam para atendimento humano. A IA pontua contatos, cria/avança oportunidades e pode marcar reuniões nos horários livres do SDR.

## Desenvolvimento

Use Node **24.x** e npm. No diretório do projeto:

```sh
npm ci
npm run dev
```

O comando inicia Vite na porta `5173` e a API na porta interna `3001`. Sem variáveis de ambiente, entre por **Explorar demonstração**. Os dados de exemplo ficam no `localStorage` deste navegador; não migram para contas reais. Sair da demonstração preserva os dados locais para uma visita posterior.

Para o fluxo real, copie `.env.example` para `.env.local` e preencha as configurações de forma privada. Aplique a migração Supabase e configure o login conforme [docs/DEPLOY.md](docs/DEPLOY.md). Reinicie `npm run dev` após mudar variáveis. Nunca coloque chaves privadas em `VITE_*`.

```sh
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Os testes de backend usam dependências externas simuladas. Os testes SQL executam PostgreSQL em PGlite com o contexto Auth simulado. Os testes de navegador validam a demonstração em Chromium; use `npx playwright install chromium` se não houver navegador instalado. Essas verificações não substituem login e uma chamada reais no projeto Supabase/Anthropic de destino.

`npm run preview` serve apenas o build estático para inspeção; não inicia a API. Para testar a aplicação completa localmente, use `npm run dev`.

## Hospedagem

O projeto está preparado para **Vercel**, incluindo build, funções e roteamento. Siga [o guia de implantação](docs/DEPLOY.md), [o contrato do backend](docs/backend.md) e [a migração do banco](supabase/README.md).

O domínio **https://ai.v4oliveira.com.br** está conectado ao projeto Supabase **Felipa IA** (`mdzflolthybnzewhpxno`). Login, persistência, isolamento entre contas e uma resposta real do Claude foram verificados em 30/10/2026. A ponte WhatsApp está ativa na instância `v4`, com whitelist restrita aos números autorizados terminados em **8747** e **1111**. O fluxo completo foi validado com uma entrada real desse número, resposta do Claude e aceite do envio pela Evolution; remetentes fora da whitelist ficaram para atendimento humano. Consulte [a validação](docs/VALIDATION.md), [o procedimento de manutenção](docs/ACTIVATION.md) e [a operação WhatsApp](docs/WHATSAPP.md). Use `SUPABASE_PROJECT_REF=mdzflolthybnzewhpxno` com os comandos `cloud:check`, `cloud:apply` e `cloud:smoke` para selecionar o projeto existente.

Para entender o fluxo entre painel, Supabase, Claude e Evolution, veja [como o código funciona](docs/ARCHITECTURE.md).

A pasta `.figma` e os plugins de ambiente Figma do ZIP original não são necessários no deploy Vercel. A identidade visual e os estilos do protótipo foram aproveitados; os dados demonstrativos e as conexões fictícias não são apresentados como produção.

## Acessar o CRM

Entre em https://ai.v4oliveira.com.br/#contacts. No menu, escolha **Contatos / CRM** e clique em **Abrir ficha** ou no nome do cliente. A ficha tem URL própria `#contacts/ID_DO_CONTATO`, preservada ao recarregar.

Antes de publicar esta atualização, aplique `supabase/migrations/202610300003_crm_triage.sql` no projeto Felipa IA existente. A migração é aditiva, mantém RLS, fila e whitelist WhatsApp.

## Configurações e canais — implementação de 31/10/2026

A implementação das dez telas adiciona equipe compartilhada com funções, configurações persistidas, diagnóstico/reconexão WhatsApp, OAuth Google/Instagram, widget, API/webhooks, integração Stripe, MFA, sessões e privacidade. A ficha e a triagem automática existentes foram preservadas. Consulte [a preparação, capacidades e dependências](docs/WORKSPACE.md) antes da publicação. As novas integrações só ficam ativas após configurar os serviços e autorizar as contas; os testes locais não comprovam operação em produção.

## Oportunidades, login e design — implementação de 02/11/2026

Ficha de oportunidade, revisão de login/segurança e padronização visual. Veja [o que falta para o MVP](docs/MVP.md). A migração `supabase/migrations/202611020005_opportunities.sql` (e a `202611010004_sales_automation.sql`, que estava pendente) foram aplicadas no projeto Felipa IA em 02/11/2026; confira com `SUPABASE_PROJECT_REF=mdzflolthybnzewhpxno npm run opportunities:check`. Os tamanhos de fonte, espaçamentos e controles vêm dos tokens em `src/index.css` e de `src/styles/system.css`; use-os em telas novas em vez de valores fixos.

### Assinatura das mensagens no WhatsApp

Mensagens enviadas pelo WhatsApp saem com o nome de quem envia em negrito: `*Felipe:* Bom dia` (primeiro nome da pessoa da equipe) e `*Felipa:* Olá!` (nome do agente de IA). Desative em **Configurações → WhatsApp → Assinar mensagens com o nome de quem envia**. O painel guarda o texto sem o prefixo. A assinatura das respostas da IA funciona sem migração. A das mensagens da equipe exige `supabase/migrations/202611030006_whatsapp_signature.sql`; enquanto ela não for aplicada, essas mensagens saem sem nome. Aplique com `SUPABASE_PROJECT_REF=mdzflolthybnzewhpxno npm run opportunities:migrate` e confira com `npm run opportunities:check`.
