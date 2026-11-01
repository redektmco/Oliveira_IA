import { useEffect, useRef, type CSSProperties } from 'react';
import { DIcon, Hot, meetingDay, weekdayShort, type DName } from './ui';
import type { SceneProps } from './scenes-inbox';

const s = (i: number): CSSProperties => ({ '--i': i } as CSSProperties);
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };

/* ============ Assistente de IA (tela inicial) ============ */
const chips: [string, DName][] = [['Resumir meu dia', 'spark'], ['Leads para qualificar', 'users'], ['Conversas em aberto', 'message'], ['Criar contato', 'plus'], ['Nova oportunidade', 'pipeline'], ['Agendar reunião', 'calendar'], ['Mandar WhatsApp', 'whatsapp']];

function Actions({ items, base = 250 }: { items: { kind: 'read' | 'send' | 'create'; title: string; detail: string }[]; base?: number }) {
  return <ul className="home-actions">{items.map((a, index) => <li key={a.title} className={`${a.kind} dm-in`} style={{ '--d': `${base + index * 380}ms` } as CSSProperties}>
    <span className="home-action-ico"><DIcon name={a.kind === 'read' ? 'search' : a.kind === 'send' ? 'send' : 'plus'} size={13} /></span>
    <span className="home-action-text"><b>{a.title}</b><small>{a.detail}</small></span>
    {a.kind !== 'read' && <span className="dm-done"><DIcon name="check" size={13} /></span>}</li>)}</ul>;
}

export function AssistantScene({ step, company, go }: SceneProps) {
  const day = meetingDay();
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const timers = [200, 1400, 2600].map((ms) => window.setTimeout(() => bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), ms));
    return () => timers.forEach(window.clearTimeout);
  }, [step]);
  const date = new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '').toUpperCase();
  const composer = (text: string) => <div className="home-composer"><div className="dm-composer-input">{text || <span className="dm-ph">Peça qualquer coisa: criar contato, mandar mensagem, ver oportunidades…</span>}</div>
    <div className="home-composer-bar"><span className="home-composer-note"><DIcon name="spark" size={13} /> Claude · acessa seus contatos, oportunidades, reuniões e conversas</span><span className="home-send"><DIcon name="send" size={15} /></span></div></div>;
  if (step === 0) {
    return <div className="home dm-home" data-theme="dark"><div className="home-hero">
      <div className="home-eyebrow">{date} · 3 TAREFAS NA FILA<i /></div>
      <h1 className="home-title">{greeting()}.<span>O que vamos fazer em {company}?</span></h1>
      {composer('')}
      <div className="home-chips">{chips.map(([label, icon], index) => index === 0
        ? <Hot key={label} on go={go} hint="Resumir meu dia" className="dm-inline" radius="999px"><button tabIndex={-1}><DIcon name={icon} size={14} />{label}</button></Hot>
        : <button key={label} tabIndex={-1}><DIcon name={icon} size={14} />{label}</button>)}</div>
    </div></div>;
  }
  const first = <div className="home-thread-inner dm-turn" key="t1">
    <div className="home-msg user"><p>Faça um resumo do meu dia: tarefas pendentes, reuniões próximas e conversas que precisam de atenção.</p></div>
    <div className="home-msg"><span className="home-avatar"><DIcon name="spark" size={13} /></span><div className="home-msg-body">
      <Actions items={[{ kind: 'read', title: 'Consultou a agenda', detail: '4 reuniões nos próximos dias' }, { kind: 'read', title: 'Consultou a caixa de entrada', detail: '12 conversas · 2 aguardando resposta' }, { kind: 'read', title: 'Consultou tarefas', detail: '3 pendentes · 1 atrasada' }]} />
      <div className="home-md dm-answer" style={{ '--d': '1500ms' } as CSSProperties}>
        <p><strong>{greeting()}!</strong> Aqui está o seu dia na {company}:</p>
        <p><strong>Reuniões</strong></p>
        <ul><li><strong>Amanhã 10:00</strong> · Rafael Menezes, diagnóstico (marcada pela Felipa)</li><li><strong>{weekdayShort(day)} 14:30</strong> · Beatriz Nogueira, avaliação com a Dra. Helena. Lead quente (score 92), chegou às 02:14.</li></ul>
        <p><strong>Precisam de atenção</strong></p>
        <ul><li>Juliana Prado perguntou sobre o pacote facial há 40 min e aguarda as condições.</li><li>1 tarefa atrasada em “Full face · Fernanda Alves”.</li></ul>
        <p><strong>Sugestão:</strong> responder a Juliana agora. Quer que eu faça isso?</p>
      </div></div></div></div>;
  if (step === 1) {
    return <div className="home dm-home" data-theme="dark"><div className="home-thread"><div className="home-thread-inner-wrap">{first}</div></div><div ref={bottom} /><div className="home-dock"><div className="home-dock-inner">{composer('')}</div></div></div>;
  }
  return <div className="home dm-home" data-theme="dark"><div className="home-thread">
    <div className="home-thread-inner dm-prev">
      <div className="home-msg user"><p>Faça um resumo do meu dia…</p></div>
      <div className="home-msg"><span className="home-avatar"><DIcon name="spark" size={13} /></span><div className="home-msg-body"><div className="home-md"><p>Resumo enviado: 2 reuniões, 2 pontos de atenção. Sugeri responder a Juliana Prado.</p></div></div></div>
    </div>
    <div className="home-thread-inner dm-turn" key="t2">
      <div className="home-msg user"><p>Sim. Manda um WhatsApp para a Juliana com as condições do pacote facial e marca uma avaliação amanhã às 11h.</p></div>
      <div className="home-msg"><span className="home-avatar"><DIcon name="spark" size={13} /></span><div className="home-msg-body">
        <Actions items={[{ kind: 'read', title: 'Consultou a base de conhecimento', detail: 'Pacote facial · condições e preparo' }, { kind: 'send', title: 'WhatsApp enviado', detail: 'Juliana Prado · condições do pacote facial' }, { kind: 'create', title: 'Reunião criada', detail: 'Avaliação · amanhã 11:00 · Juliana Prado · Meet' }]} />
        <div className="home-md dm-answer" style={{ '--d': '1700ms' } as CSSProperties}>
          <p><strong>Pronto.</strong> Enviei a mensagem para a Juliana com as condições do pacote que estão na base e marquei a avaliação para amanhã às 11:00, com link do Meet.</p>
          <p>Quer que eu crie uma tarefa para acompanhar a resposta dela?</p>
        </div></div></div>
    </div>
    <div ref={bottom} /></div><div className="home-dock"><div className="home-dock-inner">{composer('')}</div></div></div>;
}

/* ============ Agentes de IA (mesma estrutura de src/pages/Agents.tsx) ============ */
export function AgentScene({ company }: SceneProps) {
  const prompt = 'Você é uma assistente comercial consultiva. Apresente-se como inteligência artificial. Entenda a necessidade do contato, faça uma pergunta de cada vez e use apenas informações confirmadas na base de conhecimento. Quando faltar uma informação, diga que precisa confirmar com a equipe. Nunca invente preços, condições ou disponibilidade de agenda.';
  const greeting = `Olá! Sou a Felipa, assistente virtual da ${company}. Como posso ajudar?`;
  return <div className="content ai-page dm-agents" data-step={0}>
    <div className="page-header"><div><h1 className="page-title">Agentes de IA</h1><p className="page-description">Configure a identidade e as instruções que o Claude usa nas conversas.</p></div><div className="page-actions"><button className="btn btn-primary" tabIndex={-1}>+ Criar agente</button></div></div>
    <div className="agent-stats"><div className="card"><span>Agentes ativos</span><b>1</b><small>de 1 configurados</small></div><div className="card"><span>Conversas internas</span><b>5</b><small>Registradas neste workspace</small></div><div className="card"><span>Respostas da IA</span><b>38</b><small>Em conversas salvas</small></div><div className="card"><span>Chamadas concluídas</span><b>38</b><small>Inclui testes no Playground</small></div></div>
    <div className="agents-grid"><article className="card agent-card">
      <div className="agent-top"><div className="agent-icon tone-0" aria-hidden="true">✦</div><span className="badge badge-success">Ativo</span></div>
      <h2 className="agent-name">Felipa</h2><span>{company}</span><p className="ai-muted">{greeting}</p><div className="agent-phone">claude-haiku-4-5-20251001</div>
      <div className="agent-metrics"><div><span>Conversas</span><b>5</b></div><div><span>Limite de score</span><b>75 / 100</b></div><div><span>Canal</span><b>Web interno</b></div></div>
      <div className="agent-actions"><button className="btn grow" tabIndex={-1}>Editar agente</button><button className="btn btn-danger" tabIndex={-1}>Excluir</button></div></article></div>
    <div className="modal-overlay"><section className="modal ai-modal dm-rise-in" role="dialog" aria-modal="true" aria-label="Editar agente"><div className="ai-form">
      <div className="modal-head"><div><h2 className="page-title">Editar agente</h2><p className="ai-muted">As alterações salvas valem nas próximas respostas.</p></div><span className="btn btn-ghost" aria-hidden="true">✕</span></div>
      <div className="modal-body">
        <div className="ai-grid"><label className="ai-field">Nome do agente<input readOnly tabIndex={-1} value="Felipa" /></label><label className="ai-field">Empresa representada<input readOnly tabIndex={-1} value={company} /></label></div>
        <label className="ai-field">Mensagem de apresentação<textarea readOnly tabIndex={-1} rows={2} value={greeting} /><small>A apresentação orienta a IA e não é enviada automaticamente ao criar uma conversa.</small></label>
        <label className="ai-field">Instruções comerciais<textarea readOnly tabIndex={-1} rows={6} value={prompt} /><small>{prompt.length.toLocaleString('pt-BR')} / 12.000 caracteres. Descreva objetivos, tom de voz, critérios de qualificação e quando encaminhar para uma pessoa.</small></label>
        <div className="ai-grid"><label className="ai-field">Modelo Claude<select tabIndex={-1} value="h" onChange={() => {}}><option value="h">Haiku 4.5 — econômico</option></select></label><label className="ai-field">Limite de qualificação (0–100)<input readOnly tabIndex={-1} value="75" /></label></div>
        <label className="ai-check"><input type="checkbox" checked readOnly tabIndex={-1} /> Agente ativo para receber mensagens</label>
      </div>
      <div className="modal-footer"><span className="btn" aria-hidden="true">Cancelar</span><span className="btn btn-primary" aria-hidden="true">Salvar agente</span></div></div></section></div>
  </div>;
}

/* ============ Base de conhecimento (mesma estrutura de src/pages/Knowledge.tsx) ============ */
export function KnowledgeScene() {
  const created = new Date().toLocaleDateString('pt-BR');
  const docs = [
    ['Procedimentos e preparo', 'Como cada procedimento funciona, cuidados antes e depois da avaliação, tempo médio de recuperação e contraindicações. A avaliação é gratuita e feita pela especialista.'],
    ['Perguntas frequentes', 'Formas de pagamento aceitas, política de remarcação, o que levar na primeira consulta e quanto tempo dura cada atendimento.'],
    ['Horários e endereços', 'Unidades, horários de atendimento de segunda a sábado e como chegar de transporte público.'],
  ];
  return <div className="content ai-page" data-step={1}>
    <div className="page-header"><div><h1 className="page-title">Base de conhecimento</h1><p className="page-description">Informações comerciais que seus agentes podem consultar para responder com contexto.</p></div><div className="page-actions"><button className="btn btn-primary" tabIndex={-1}>+ Adicionar conteúdo</button></div></div>
    <div className="ai-note">Adicione serviços, perguntas frequentes e condições aprovadas. Os agentes usam até 30 conteúdos recentes, com até 10 mil caracteres de cada texto e 32 mil no conjunto. Coloque as informações essenciais no início de cada conteúdo.</div>
    <div className="card toolbar"><label className="ai-field" style={{ margin: 0, flex: 1 }}>Buscar conteúdo<input type="search" readOnly tabIndex={-1} placeholder="Título ou trecho do texto" /></label><span className="ai-muted">{docs.length} conteúdos</span></div>
    <div className="ai-knowledge-list">{docs.map(([title, text], index) => <article className="card ai-list-card dm-rise-in" key={title} style={s(index)}><div><h2 className="ai-card-title">{title}</h2><p className="ai-muted">{text.length.toLocaleString('pt-BR')} caracteres · Criado em {created}</p><p className="ai-knowledge-excerpt">{text}</p></div><div className="ai-actions"><button className="btn" tabIndex={-1}>Editar conteúdo</button><button className="btn btn-danger" tabIndex={-1}>Excluir</button></div></article>)}</div>
  </div>;
}
