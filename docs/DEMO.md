# Demonstração guiada (`/demo`)

Apresentação interativa do produto para a closer usar em reunião com o cliente. Fica em **https://ai.v4oliveira.com.br/demo** (localmente, `npm run dev` e `http://localhost:5173/demo`).

Tudo é **roteirizado**: não há login, banco, API, WhatsApp nem chamada ao Claude. Cada passo é um estado pronto da tela, então avançar e voltar é imediato, sem tempo de processamento e sem depender da internet para a IA. Os dados (clínica, leads, valores) são **fictícios**; a tela mostra "Demonstração · dados fictícios" e o slide do problema traz "Exemplo ilustrativo".

## Antes da reunião

1. Abra `/demo?empresa=Nome do cliente` (ou digite o nome na capa). O nome aparece na barra lateral, nas mensagens da IA e no fechamento, e fica salvo no navegador.
2. Compartilhe só a janela `/demo`. Abra o **painel da apresentadora** em outra janela (tecla **P**, ou `/demo/apresentador`) e deixe-o fora do compartilhamento: ele mostra o que falar, perguntas para o cliente, o próximo passo e um cronômetro, e **controla a tela do cliente** em tempo real (as duas janelas precisam estar no mesmo navegador).
3. Teste o áudio/tela, deixe o navegador em tela cheia (**F**) e escolha o tema (**T**). O escuro é o padrão; o claro combina com a LP.

## Como conduzir

| Ação | Tecla / clique |
| --- | --- |
| Próximo passo | `→`, `Espaço`, `Enter`, `PageDown` ou botão **Próximo** |
| Voltar | `←`, `PageUp`, `Backspace` |
| Ir ao capítulo N | `1`–`9`, `0` (capítulo 10), ou clique na barra de capítulos / na barra lateral do app |
| Início / fim | `Home` / `End` |
| Painel da apresentadora | `P` |
| Notas na própria tela (só se não estiver compartilhando) | `N` |
| Esconder/mostrar controles | `H` |
| Tela cheia / tema | `F` / `T` |

Em alguns passos há um **elemento destacado** (anel vermelho pulsando com rótulo "Clique aqui"). Clicar nele avança o roteiro, e o painel da apresentadora avisa qual é. Recarregar a página mantém o ponto da apresentação (`#capítulo.passo` na URL).

## Roteiro (≈ 28 min)

| # | Capítulo | Passos | Mostra |
| --- | --- | --- | --- |
| 1 | Abertura | 1 | Capa com o nome do cliente |
| 2 | O problema | 3 | Fila de leads sem resposta, esfriando, e os 4 números da LP |
| 3 | A IA atende | 5 | Caixa de entrada real: lead às 02:14, a Felipa responde, qualifica e marca a reunião |
| 4 | Ficha do cliente | 3 | Resumo da IA, próxima ação, score com evidência e atividade |
| 5 | Agenda sozinha | 2 | Reunião marcada pela IA e editável (mesmas telas do app) |
| 6 | Funil de oportunidades | 4 | Cartão entra, é qualificado e avança; previsão ponderada sobe |
| 7 | Assistente de IA | 3 | Resumo do dia e execução de pedidos (WhatsApp + reunião) |
| 8 | Você no controle | 4 | Editor do agente, base de conhecimento e humano assume a conversa |
| 9 | Conectado ao que você usa | 2 | Slide de canais e segurança (não é tela do app) |
| 10 | Resultados | 2 | Números e comparativo SDR tradicional x SDR AI |
| 11 | Próximos passos | 3 | 7 dias, oferta e fechamento |

## Editar o conteúdo

- **Textos, falas e tempos**: `src/demo/script.ts` (legendas na tela, o que falar, dicas e minutos de cada capítulo).
- **Telas**: `src/demo/scenes-*.tsx`; estilos em `src/demo/demo.css`. As telas usam as mesmas classes e tokens do app (`src/styles/brand.css`), então acompanham o tema claro/escuro.
- **Conversa do lead** (mensagens, score, critérios): `src/demo/scenes-inbox.tsx`. A IA do roteiro não promete preço, só diz o que uma base de conhecimento confirmaria.

## O que confirmar com o time antes de apresentar

- Os números de resultado (8 s, 24/7, 3x, -70%) e o comparativo são os da landing page. Resultados dependem da operação de cada cliente.
- A tela de integrações lista os mesmos canais da LP (WhatsApp, Instagram, Gmail, Google Agenda, Meta Ads, API e Webhooks). Confirme quais estão ativos no contrato do cliente antes de prometer.
- Nada na demo prova uma conexão real: para mostrar o produto de verdade, entre em `/app` com uma conta configurada.

## Fidelidade ao produto

As telas de Caixa de entrada, Contatos (ficha), Reuniões, Oportunidades, Assistente, Agentes e Base de conhecimento reproduzem a estrutura das telas reais, com os mesmos textos e componentes. Só os dados são fictícios e as respostas da IA são roteirizadas. O capítulo de canais e segurança, a abertura, o problema, os resultados e o fechamento são slides, não telas do app. Se uma tela do app mudar, atualize a cena correspondente em `src/demo/`.
