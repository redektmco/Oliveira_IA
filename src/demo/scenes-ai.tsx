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
  const composer = (text: string) => <div className="home-composer"><div className="dm-composer-input">{text || <span className="dm-ph">Pergunte ou peça qualquer coisa à sua operação…</span>}</div>
    <div className="home-composer-bar"><span className="home-composer-note"><DIcon name="spark" size={13} /> A IA lê e opera contatos, oportunidades, tarefas, reuniões e WhatsApp. Não exclui nada.</span><span className="home-send"><DIcon name="send" size={15} /></span></div></div>;
  if (step === 0) {
    return <div className="home dm-home" data-theme="dark"><div className="home-hero">
      <div className="home-eyebrow">{date} · 3 TAREFAS NA FILA<i /></div>
      <h1 className="home-title">{greeting()}, equipe {company}.<span>O que vamos resolver hoje?</span></h1>
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

/* ============ Agente: identidade, tom e critérios ============ */
export function AgentScene({ company }: SceneProps) {
  const tones = [['Consultivo', 'Pergunta, entende e orienta', true], ['Amigável', 'Leve e próximo', false], ['Formal', 'Direto e objetivo', false], ['Especialista', 'Técnico e preciso', false]] as const;
  const weights = [['Orçamento', 30], ['Necessidade', 25], ['Autoridade', 25], ['Prazo', 20]] as const;
  return <div className="dm-page" data-step={0}>
    <div className="page-header"><div><h1 className="page-title">Agente · Felipa</h1><p className="page-description">Como a IA fala, o que ela sabe e quando ela chama um humano.</p></div>
      <div className="page-actions"><span className="badge badge-success"><span className="dot" style={{ background: 'currentColor' }} /> Ativa</span><button className="btn btn-primary" tabIndex={-1}>Salvar alterações</button></div></div>
    <div className="dm-agent-grid">
      <div className="dm-col">
        <section className="form-section dm-rise-in"><div className="form-section-title"><span>1</span><div><b>Identidade</b><p>Quem atende em nome da {company}.</p></div></div>
          <div className="form-grid"><label><span>Nome do agente</span><div className="dm-input">Felipa</div></label><label><span>Empresa</span><div className="dm-input">{company}</div></label>
            <label className="full"><span>Mensagem de abertura</span><div className="dm-input tall">Olá! Sou a Felipa, assistente virtual da {company}. Como posso ajudar?</div></label></div></section>
        <section className="form-section dm-rise-in" style={s(1)}><div className="form-section-title"><span>2</span><div><b>Tom de voz</b><p>A IA aprende a falar como o seu time.</p></div></div>
          <div className="tone-options">{tones.map(([name, text, active]) => <button key={name} tabIndex={-1} className={active ? 'active' : ''}><span className="radio" /><b>{name}</b><small>{text}</small></button>)}</div></section>
        <section className="form-section dm-rise-in" style={s(2)}><div className="form-section-title"><span>3</span><div><b>Instruções</b><p>Regras que a IA sempre segue.</p></div></div>
          <div className="dm-input tall mono">Apresente-se como inteligência artificial. Faça uma pergunta de cada vez. Use apenas informações confirmadas na base. Não invente preços, horários ou promessas. Quando faltar informação, encaminhe para um atendente humano.</div></section>
      </div>
      <aside className="dm-col">
        <section className="form-section dm-rise-in" style={s(1)}><div className="form-section-title"><span>4</span><div><b>Critérios de qualificação</b><p>Pesos e nota de corte.</p></div></div>
          {weights.map(([label, value], index) => <div className="dm-weight" key={label}><div><span>{label}</span><b>{value}%</b></div><div className="score-track"><i style={{ width: `${Math.round(value / 30 * 100)}%`, animationDelay: `${300 + index * 150}ms` }} /></div></div>)}
          <div className="threshold"><div><b>Nota de corte</b><span>Acima disso, a IA encaminha para reunião</span></div><b>75</b></div></section>
        <section className="form-section dm-phone dm-rise-in" style={s(2)}><div className="phone-preview"><div className="phone-head"><span className="avatar tone-0">F</span><div><b>Felipa · {company}</b><span>online</span></div></div>
          <div className="phone-chat"><div className="mini-message">Olá! Sou a Felipa, assistente virtual da {company}. Como posso ajudar?<time>09:00</time></div></div></div></section>
      </aside>
    </div>
  </div>;
}

/* ============ Base de conhecimento ============ */
export function KnowledgeScene({ company }: SceneProps) {
  const docs = [['Procedimentos e preparo', 'Como cada procedimento funciona, cuidados antes e depois, tempo de recuperação.', 'md', '23'], ['Perguntas frequentes', 'Respostas aprovadas pela equipe: pagamento, remarcação, primeira consulta.', 'md', '41'],
    ['Horários e endereços', 'Unidades, horários de atendimento e como chegar.', 'txt', '12'], ['Política de remarcação', 'Prazos e regras de cancelamento e reagendamento.', 'txt', '9']];
  return <div className="dm-page ai-page" data-step={1}>
    <div className="page-header"><div><h1 className="page-title">Base de conhecimento</h1><p className="page-description">A Felipa só responde com o que está aqui. O que faltar vai para um humano.</p></div>
      <div className="page-actions"><button className="btn" tabIndex={-1}><DIcon name="download" size={15} /> Importar .txt ou .md</button><button className="btn btn-primary" tabIndex={-1}><DIcon name="plus" size={15} /> Novo documento</button></div></div>
    <div className="dm-kb-grid">
      <div className="ai-knowledge-list">{docs.map(([title, text, ext, used], index) => <div className="card ai-list-card dm-rise-in" key={title} style={s(index)}><div><div className="dm-kb-head"><span className="dm-ic ink"><DIcon name="book" size={15} /></span><b className="ai-card-title">{title}</b><span className="badge badge-neutral">.{ext}</span></div><p className="ai-knowledge-excerpt">{text}</p></div><span className="badge badge-brand">Usado em {used} respostas</span></div>)}</div>
      <aside className="card dm-guard dm-rise-in" style={s(2)}>
        <div className="dm-card-head"><span className="dm-ic red"><DIcon name="shield" size={16} /></span><b>Quando a IA não sabe, ela não inventa</b></div>
        <div className="dm-guard-chat">
          <div className="dm-bub lead dm-in" style={{ '--d': '400ms' } as CSSProperties}>Vocês aceitam convênio?</div>
          <div className="dm-bub ia dm-in" style={{ '--d': '1100ms' } as CSSProperties}>Essa informação eu não tenho confirmada. Vou chamar uma pessoa do time da {company} para te responder com certeza. 😊</div>
        </div>
        <div className="dm-guard-flow dm-in" style={{ '--d': '1800ms' } as CSSProperties}><span className="badge badge-warning">Sem resposta na base</span><DIcon name="arrow" size={14} /><span className="badge badge-info">Encaminhado a um humano</span><DIcon name="arrow" size={14} /><span className="badge badge-success">Vira material de treino</span></div>
      </aside>
    </div>
  </div>;
}

/* ============ Integrações e segurança ============ */
const integrations: [string, string, DName, string][] = [
  ['WhatsApp', 'Mesmo número que você já usa. A IA responde no mesmo canal.', 'whatsapp', 'logo-1'], ['Instagram', 'Mensagens diretas e leads de anúncios na mesma caixa.', 'instagram', 'logo-5'],
  ['Gmail', 'E-mails de interessados e convites enviados pela plataforma.', 'mail', 'logo-2'], ['Google Agenda', 'Horários livres do time e reuniões com link do Meet.', 'calendar', 'logo-4'],
  ['Meta Ads', 'Leads de campanhas entram direto no funil.', 'megaphone', 'logo-3'], ['API e Webhooks', 'Integre seu CRM, ERP ou qualquer sistema.', 'webhook', 'logo-6'],
];
export function IntegrationsScene({ step }: SceneProps) {
  if (step === 1) {
    const items: [DName, string, string][] = [['lock', 'Dados isolados por conta', 'Cada empresa enxerga só os próprios dados, com regras de acesso no banco.'], ['shield', 'LGPD e privacidade', 'Tratamento de dados seguindo a LGPD. Conversas nunca são compartilhadas entre clientes.'],
      ['team', 'Equipe com funções', 'Administrador, gestor e vendedor, cada um com o acesso que precisa.'], ['user', 'Login seguro com MFA', 'Autenticação em duas etapas e controle de sessões ativas.']];
    return <div className="dm-page" data-step={1}>
      <div className="page-header"><div><h1 className="page-title">Segurança e acesso</h1><p className="page-description">Seus dados e os dos seus clientes protegidos por padrão.</p></div></div>
      <div className="dm-secure">{items.map(([icon, title, text], index) => <div className="card dm-secure-card dm-rise-in" key={title} style={s(index)}><span className="dm-ic red big"><DIcon name={icon} size={22} /></span><h3>{title}</h3><p>{text}</p></div>)}</div>
    </div>;
  }
  return <div className="dm-page" data-step={0}>
    <div className="page-header"><div><h1 className="page-title">Integrações</h1><p className="page-description">Conectado ao que você já usa.</p></div><div className="page-actions"><span className="badge badge-success">6 de 6 conectadas</span></div></div>
    <div className="integration-health"><span className="health-icon"><DIcon name="check" size={16} /></span><div><b>Tudo conectado</b><span>Canais, agenda e CRM sincronizando</span></div></div>
    <div className="section-heading"><b>Canais e ferramentas</b><span>Conecte em poucos cliques. Sem trocar de número, sem migrar de sistema.</span></div>
    <div className="integration-grid dm-integrations">{integrations.map(([name, text, icon, logo], index) => <div className="card integration-card dm-rise-in" key={name} style={s(index)}>
      <span className={`integration-logo ${logo}`}><DIcon name={icon} size={18} /></span><div><b>{name}</b><p>{text}</p></div>
      <span className="integration-status dm-connect" style={{ '--c': `${500 + index * 420}ms` } as CSSProperties}><span className="badge badge-warning dm-connecting">Conectando…</span><span className="badge badge-success dm-connected"><DIcon name="check" size={11} /> Conectado</span></span></div>)}</div>
  </div>;
}
