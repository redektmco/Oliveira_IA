/**
 * Roteiro da demonstração guiada.
 *
 * Tudo aqui é estático: nenhuma chamada de rede, banco ou IA. Cada passo (`StepDef`) vira um estado
 * determinístico da cena, então avançar e voltar é instantâneo.
 *
 * - `title` e `text`: legenda que o CLIENTE vê na tela (curta e direta).
 * - `say` e `tip`: anotações que só a CLOSER vê, no modo apresentador (/demo/apresentador).
 * - `{empresa}` é trocado pelo nome do cliente digitado na capa.
 */
export type CaptionIcon = 'zap' | 'user' | 'target' | 'calendar' | 'repeat' | 'chart' | 'shield' | 'plug' | 'spark' | 'check' | 'message' | 'clock';

export type StepDef = {
  title: string;
  text: string;
  icon: CaptionIcon;
  say: string[];
  tip?: string;
  /** Há um elemento destacado na tela que a closer pode clicar (também avança o passo). */
  hot?: string;
};

export type Chapter = {
  id: string;
  title: string;
  /** Item da barra lateral destacado enquanto o capítulo está aberto. */
  nav: string | null;
  /** Tela cheia (capa, problema, resultados e fechamento): sem a moldura do app. */
  full?: boolean;
  /** Minutos sugeridos, para o cronômetro do apresentador. */
  minutes: number;
  steps: StepDef[];
};

export const chapters: Chapter[] = [
  {
    id: 'capa', title: 'Abertura', nav: null, full: true, minutes: 1,
    steps: [
      { title: 'Abertura', text: 'Demonstração preparada para {empresa}.', icon: 'spark',
        say: ['Agradeça o tempo e confirme o objetivo: ver, em 20 minutos, um lead real sendo atendido, qualificado e agendado sem ninguém digitar.', 'Combine: "Vou mostrar o produto funcionando. Pode me interromper a qualquer momento."'],
        tip: 'Confirme o nome da empresa no campo da capa antes de iniciar.' },
    ],
  },
  {
    id: 'problema', title: 'O problema', nav: null, full: true, minutes: 2,
    steps: [
      { title: 'A fila de hoje', text: 'Leads que chegaram fora do horário.', icon: 'clock',
        say: ['Pergunte: "Quantos leads chegam para vocês à noite ou no fim de semana?"', 'Mostre a fila: cada linha é um interessado esperando resposta agora.'],
        tip: 'Deixe o cliente falar do próprio processo. Anote números reais para retomar no fechamento.' },
      { title: 'Esfriou', text: 'Quem responde primeiro, vende.', icon: 'clock',
        say: ['Depois de alguns minutos o lead já esfriou, e muitas vezes fechou com quem respondeu antes.', 'Não é falta de esforço do time: é impossível responder todo mundo, o tempo todo.'],
        tip: 'Exemplo ilustrativo, não é dado do cliente. Diga isso se perguntarem.' },
      { title: 'Com a SDR AI', text: 'Resposta em segundos, 24h por dia.', icon: 'zap',
        say: ['Agora a mesma fila com a SDR AI: cada lead respondido em segundos, a qualquer hora.', 'Os quatro números são os da nossa página. "Vou mostrar como isso acontece, ao vivo."'] },
    ],
  },
  {
    id: 'inbox', title: 'A IA atende', nav: 'inbox', minutes: 5,
    steps: [
      { title: 'Um lead chega às 02:14', text: 'Veio de um anúncio no Instagram, de madrugada.', icon: 'message',
        say: ['"São duas da manhã. Ninguém do time está online."', 'Clique na conversa nova (destacada) para abrir.'], hot: 'Abrir a conversa nova' },
      { title: 'Resposta em 8 segundos', text: 'A Felipa responde no tom da {empresa}.', icon: 'zap',
        say: ['Repare no tempo de primeira resposta: 8 segundos.', 'À direita a ficha do lead já está sendo preenchida sozinha: nome, telefone, origem e interesse.'] },
      { title: 'Entende e pergunta', text: 'Uma pergunta por vez, como um bom SDR.', icon: 'user',
        say: ['Ela não despeja informação: descobre o prazo e a necessidade com perguntas naturais.', 'O critério "Prazo" acabou de ser preenchido com evidência da própria conversa.'],
        tip: 'Pergunte: "Hoje, quem faz essas perguntas de qualificação no time de vocês?"' },
      { title: 'Lead quente: score 92', text: 'Orçamento e decisor confirmados. Oportunidade criada.', icon: 'target',
        say: ['Orçamento, necessidade, autoridade e prazo: os quatro critérios, cada um com a frase do cliente como prova.', 'A oportunidade já foi criada no funil, sem ninguém cadastrar.'] },
      { title: 'Reunião agendada', text: 'Horário livre da agenda, convite e link do Meet enviados.', icon: 'calendar',
        say: ['A IA oferece só horários realmente livres na agenda do consultor.', 'O cliente escolheu, a reunião foi marcada e o convite foi enviado. Tudo isso de madrugada.'],
        tip: 'Momento-chave: faça uma pausa e pergunte "Quantas reuniões vocês perdem por demora na resposta?"' },
    ],
  },
  {
    id: 'crm', title: 'Ficha do cliente', nav: 'contacts', minutes: 2,
    steps: [
      { title: 'Ficha criada sozinha', text: 'Resumo factual da conversa, sem digitação.', icon: 'user',
        say: ['Quando o vendedor chega de manhã, a ficha já está pronta: quem é, o que quer e o que falta decidir.', 'O resumo é factual: só o que o cliente disse.'] },
      { title: 'Critérios com evidência', text: 'Cada nota tem a frase do cliente como prova.', icon: 'target',
        say: ['Nada de "achismo": cada critério mostra a evidência da conversa.', 'O gestor pode auditar por que um lead recebeu a nota.'] },
      { title: 'Linha do tempo automática', text: 'Tudo registrado: da primeira mensagem à reunião.', icon: 'repeat',
        say: ['Histórico completo e tarefas criadas pela IA. Quem assumir o contato sabe exatamente de onde partir.'],
        tip: 'Pergunte: "Hoje esse histórico fica no CRM, em planilha ou na cabeça do vendedor?"' },
    ],
  },
  {
    id: 'agenda', title: 'Agenda sozinha', nav: 'meetings', minutes: 2,
    steps: [
      { title: 'Reunião na agenda do time', text: 'Marcada pela IA, sincronizada com o Google Agenda.', icon: 'calendar',
        say: ['A reunião da madrugada já aparece aqui, marcada como "Agendada pela IA".', 'Clique nela para ver os detalhes.'], hot: 'Abrir a reunião' },
      { title: 'Convite, Meet e lembrete', text: 'O lead recebe tudo e não esquece.', icon: 'check',
        say: ['Link do Meet gerado, convite por e-mail e lembrete automático no WhatsApp.', 'Menos no-show e zero trabalho manual para o consultor.'] },
    ],
  },
  {
    id: 'funil', title: 'Funil de oportunidades', nav: 'pipeline', minutes: 3,
    steps: [
      { title: 'Funil sempre atualizado', text: 'Cada negociação do primeiro contato ao fechamento.', icon: 'chart',
        say: ['Este é o funil da {empresa}. Valor em aberto e previsão ponderada pela probabilidade de cada etapa.'] },
      { title: 'O lead entra no funil', text: 'Novo lead criado automaticamente.', icon: 'zap',
        say: ['Lembra da Beatriz? Ela acabou de entrar no funil, em "Novo lead", sem ninguém cadastrar.'], hot: 'Avançar a etapa' },
      { title: 'A IA qualifica e avança', text: 'Movida para "Qualificado" conforme a triagem.', icon: 'target',
        say: ['Conforme a triagem, a IA move o cartão. O gestor vê o funil real, não o que o vendedor lembrou de atualizar.'] },
      { title: 'Reunião marcada', text: 'A previsão do mês sobe na hora.', icon: 'calendar',
        say: ['Com a reunião marcada, o cartão vai para "Reunião agendada" e a previsão ponderada sobe.', 'Cada cartão abre uma ficha com tarefas, notas e linha do tempo.'],
        tip: 'Pergunte: "Hoje como vocês enxergam a previsão de vendas do mês?"' },
    ],
  },
  {
    id: 'assistente', title: 'Assistente de IA', nav: 'overview', minutes: 3,
    steps: [
      { title: 'Converse com a sua operação', text: 'Peça em português, a IA lê e executa.', icon: 'spark',
        say: ['A tela inicial é um assistente. Em vez de navegar por telas, o gestor pergunta.', 'Clique em "Resumir meu dia".'], hot: 'Resumir meu dia' },
      { title: 'Resumo do dia em segundos', text: 'Reuniões, pendências e conversas que pedem atenção.', icon: 'chart',
        say: ['Ela consultou conversas, agenda e tarefas e entregou o que importa agora.', 'Para o gestor, é um briefing diário sem abrir relatório.'] },
      { title: 'Executa por você', text: 'Envia WhatsApp e cria reunião a partir de um pedido.', icon: 'message',
        say: ['Um pedido simples virou duas ações: mensagem enviada e reunião criada.', 'Não existe ferramenta de exclusão: a IA nunca apaga dados.'],
        tip: 'Aqui é demonstração com dados fictícios. No produto real, cada ação aparece com o registro do que foi feito.' },
    ],
  },
  {
    id: 'controle', title: 'Você no controle', nav: 'agents', minutes: 3,
    steps: [
      { title: 'A IA fala como a {empresa}', text: 'Tom de voz, instruções e critérios de qualificação.', icon: 'user',
        say: ['Aqui o time define como a Felipa fala e o que conta como lead qualificado.', 'Os pesos dos critérios e a nota de corte são ajustáveis.'] },
      { title: 'Só responde com o que a base diz', text: 'Procedimentos e FAQs da clínica na base de conhecimento.', icon: 'shield',
        say: ['A IA consulta apenas a base da empresa. Se não souber, não inventa: passa para um humano.', 'Preços e condições ficam sob controle de vocês.'],
        tip: 'Pergunte: "Quais são as 5 perguntas que seu time mais responde por dia?"' },
      { title: 'Humano assume quando quiser', text: 'Um clique pausa a IA e o histórico continua.', icon: 'user',
        say: ['O vendedor pode assumir qualquer conversa, com todo o contexto, e depois devolver para a IA.', 'Clique em "Assumir como humano".'], hot: 'Assumir como humano' },
      { title: 'Você assumiu a conversa', text: 'A IA pausa e o vendedor segue de onde ela parou.', icon: 'check',
        say: ['A IA parou de responder e a conversa mostra o responsável. Se o vendedor quiser, devolve para a IA com um clique.', 'Isso resolve o medo de "a IA falar o que não deve": o controle é de vocês.'] },
    ],
  },
  {
    id: 'integracoes', title: 'Conectado ao que você usa', nav: 'integrations', minutes: 2,
    steps: [
      { title: 'Seus canais, no mesmo lugar', text: 'WhatsApp, Instagram, e-mail e agenda conectados.', icon: 'plug',
        say: ['Todos os canais em uma única caixa de entrada.', 'Você mantém o número de WhatsApp que já usa: não precisa trocar.'] },
      { title: 'Seguro por padrão', text: 'Dados isolados por conta e tratamento seguindo a LGPD.', icon: 'shield',
        say: ['Cada conta tem os dados isolados com controle de acesso. As conversas não se misturam entre clientes.', 'Já usa outro CRM? Dá para integrar por API e webhooks.'],
        tip: 'Se perguntarem de integrações específicas, anote e confirme com o time técnico depois.' },
    ],
  },
  {
    id: 'resultados', title: 'Resultados', nav: null, full: true, minutes: 2,
    steps: [
      { title: 'Resultados', text: 'O que muda na operação.', icon: 'chart',
        say: ['Resuma o que viram: resposta em segundos, atendimento 24/7, mais reuniões com leads qualificados e menor custo por lead.', 'São os números da nossa página; resultados dependem da operação de cada cliente.'] },
      { title: 'SDR tradicional x SDR AI', text: 'Lado a lado, em seis critérios.', icon: 'repeat',
        say: ['Não é substituir o time: é tirar dele o trabalho repetitivo para que os vendedores só entrem para fechar.'],
        tip: 'Retome os números que o cliente falou na abertura e compare.' },
    ],
  },
  {
    id: 'fechamento', title: 'Próximos passos', nav: null, full: true, minutes: 3,
    steps: [
      { title: 'No ar em 7 dias', text: 'Diagnóstico, treino, conexão e go-live.', icon: 'calendar',
        say: ['Mostre o caminho: dia 1 diagnóstico, dias 2 a 4 treino, dia 5 canais, dia 7 no ar.', 'Pergunte quem mais precisa participar do diagnóstico.'] },
      { title: 'A oferta', text: 'Teste de 7 dias, sem fidelidade.', icon: 'check',
        say: ['SDR com IA, CRM completo e implantação guiada em um único plano.', 'Sem fidelidade e com teste de 7 dias para ver o resultado antes de decidir.'] },
      { title: 'Vamos começar?', text: 'Seu próximo cliente já está chamando.', icon: 'zap',
        say: ['Faça o fechamento: "O que falta para começarmos o diagnóstico esta semana?"', 'Combine data e responsáveis ainda na reunião.'],
        tip: 'Use a tecla P para abrir esta tela de apresentador em outra janela durante a reunião.' },
    ],
  },
];

export type Frame = { c: number; s: number };
export const frames: Frame[] = chapters.flatMap((chapter, c) => chapter.steps.map((_, s) => ({ c, s })));
export const frameIndex = (c: number, s = 0) => frames.findIndex((frame) => frame.c === c && frame.s === s);
export const totalMinutes = chapters.reduce((sum, chapter) => sum + chapter.minutes, 0);
/** Capítulo aberto ao clicar num item da barra lateral. */
export const navTarget: Record<string, number> = { overview: 6, inbox: 2, contacts: 3, pipeline: 5, meetings: 4, agents: 7, knowledge: 7, playground: 7, integrations: 8, usage: 9, settings: 8 };
