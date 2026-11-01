import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Icon } from '../components/ui';
import { useWorkspace } from '../lib/workspace';
import './home.css';

type Turn = { role: 'user' | 'assistant'; content: string };
type TabId = 'contacts' | 'deals' | 'meetings';
type Theme = 'dark' | 'light';
type Activity = { id: string; at: number; text: string; right: string; page: string; highlight?: boolean };

const TZ = 'America/Sao_Paulo';
const THEME_KEY = 'oliveira-home-theme';

const tabs: { id: TabId; label: string; icon: ReactNode; placeholder: string; chips: { label: string; dot: string; prompt: string }[] }[] = [
  {
    id: 'contacts', label: 'Contatos', icon: <Icon name="users" size={13} />, placeholder: 'Como posso ajudar com seus contatos?',
    chips: [
      { label: 'Escrever follow-up', dot: 'amber', prompt: 'Escreva uma mensagem curta de follow-up para um lead que parou de responder há 3 dias.' },
      { label: 'Qualificar lead', dot: 'indigo', prompt: 'Quais perguntas devo fazer para qualificar um novo lead (orçamento, necessidade, decisor e prazo)?' },
      { label: 'Primeiro contato', dot: 'green', prompt: 'Escreva uma primeira mensagem de abordagem para um lead que acabou de preencher o formulário.' },
      { label: 'Reativar contato', dot: 'blue', prompt: 'Sugira uma mensagem para reativar um contato que esfriou há 60 dias.' },
    ],
  },
  {
    id: 'deals', label: 'Oportunidades', icon: <Icon name="pipeline" size={13} />, placeholder: 'Como posso ajudar com suas oportunidades?',
    chips: [
      { label: 'Escrever proposta', dot: 'amber', prompt: 'Monte a estrutura de uma proposta comercial objetiva, com escopo, investimento e próximos passos.' },
      { label: 'Contornar objeção', dot: 'indigo', prompt: 'O cliente disse que o preço está alto. Como posso contornar essa objeção?' },
      { label: 'Próximos passos', dot: 'green', prompt: 'Quais próximos passos eu devo definir para fazer uma oportunidade avançar da etapa de proposta para o fechamento?' },
      { label: 'Motivo de perda', dot: 'blue', prompt: 'Quais perguntas devo fazer para entender por que perdemos uma oportunidade?' },
    ],
  },
  {
    id: 'meetings', label: 'Reuniões', icon: <Icon name="calendar" size={13} />, placeholder: 'Como posso ajudar com suas reuniões?',
    chips: [
      { label: 'Roteiro de descoberta', dot: 'amber', prompt: 'Monte um roteiro de 30 minutos para uma reunião de descoberta com um novo lead.' },
      { label: 'Confirmar reunião', dot: 'indigo', prompt: 'Escreva uma mensagem curta confirmando uma reunião marcada para amanhã.' },
      { label: 'Resumo pós-reunião', dot: 'green', prompt: 'Escreva um e-mail de resumo pós-reunião com decisões tomadas e próximos passos.' },
      { label: 'Remarcar', dot: 'blue', prompt: 'Escreva uma mensagem educada para remarcar uma reunião sem perder o interesse do lead.' },
    ],
  },
];

function recentContext(turns: Turn[]): Turn[] {
  const context = turns.slice(-20).map(turn => ({ ...turn, content: turn.content.slice(0, 4000) }));
  while (context.reduce((total, turn) => total + turn.content.length, 0) > 24000) context.shift();
  return context;
}

function greeting() {
  const hour = Number(new Date().toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', hour12: false })) % 24;
  return hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
}

function ago(timestamp: number) {
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  return `há ${Math.round(hours / 24)} d`;
}

function readTheme(): Theme {
  try { return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).map(part => part[0]).slice(0, 2).join('').toUpperCase() || '?';
}

export default function Overview({ go, userName }: { go?: (page: string) => void; userName?: string }) {
  const { data, demo, loading, workspaceName, askClaude } = useWorkspace();
  const navigate = (page: string) => go?.(page);
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [tab, setTab] = useState<TabId>('contacts');
  const [agentId, setAgentId] = useState('');
  const [draft, setDraft] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const activeAgents = data.agents.filter(agent => agent.active);
  const agent = activeAgents.find(item => item.id === agentId) ?? activeAgents[0];
  const current = tabs.find(item => item.id === tab) ?? tabs[0];

  useEffect(() => { if (turns.length || pending) bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [turns, pending]);

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* The theme still changes for this visit. */ }
  };

  const pendingTasks = useMemo(() => data.deal_tasks.filter(task => !task.done_at), [data.deal_tasks]);
  const queue = pendingTasks.length;
  const eyebrow = `${new Date().toLocaleDateString('pt-BR', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '').toUpperCase()} · ${queue === 0 ? 'NENHUMA TAREFA NA FILA' : `${queue} ${queue === 1 ? 'TAREFA NA FILA' : 'TAREFAS NA FILA'}`}`;

  const contactsById = useMemo(() => new Map(data.contacts.map(contact => [contact.id, contact])), [data.contacts]);
  const activity = useMemo<Activity[]>(() => {
    const items: Activity[] = [];
    const conversations = new Map(data.conversations.map(conversation => [conversation.id, conversation]));
    const lastByConversation = new Map<string, (typeof data.messages)[number]>();
    for (const message of data.messages) {
      const previous = lastByConversation.get(message.conversation_id);
      if (!previous || message.created_at > previous.created_at) lastByConversation.set(message.conversation_id, message);
    }
    for (const [conversationId, message] of lastByConversation) {
      const conversation = conversations.get(conversationId);
      if (!conversation || conversation.status === 'closed') continue;
      const who = contactsById.get(conversation.contact_id ?? '')?.name ?? 'um contato';
      const at = new Date(message.created_at).getTime();
      items.push(message.role === 'user'
        ? { id: `m-${message.id}`, at, text: `${who} enviou uma mensagem — ${message.content.slice(0, 70)}`, right: ago(at), page: 'inbox' }
        : { id: `m-${message.id}`, at, text: `Conversa com ${who} em andamento — ${conversation.status === 'human' ? 'atendimento humano' : 'agente de IA'}`, right: ago(at), page: 'inbox' });
    }
    for (const task of pendingTasks) {
      const at = new Date(task.due_at ?? task.created_at).getTime();
      const overdue = task.due_at !== null && at < Date.now();
      items.push({ id: `t-${task.id}`, at: overdue ? Date.now() : at, text: `${overdue ? 'Tarefa atrasada' : 'Tarefa pendente'} — ${task.title}`, right: 'Aguardando você', page: 'pipeline', highlight: true });
    }
    for (const meeting of data.meetings) {
      const at = new Date(meeting.starts_at).getTime();
      if (meeting.status !== 'scheduled' || at < Date.now()) continue;
      const who = contactsById.get(meeting.contact_id ?? '')?.name;
      items.push({ id: `r-${meeting.id}`, at: Date.now() - 1, text: `${meeting.title}${who ? ` com ${who}` : ''}`, right: new Date(meeting.starts_at).toLocaleString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }), page: 'meetings' });
    }
    for (const contact of data.contacts) {
      const at = new Date(contact.created_at).getTime();
      items.push({ id: `c-${contact.id}`, at, text: `Novo contato — ${contact.name}${contact.company ? ` (${contact.company})` : ''}`, right: ago(at), page: 'contacts' });
    }
    return items.sort((a, b) => b.at - a.at).slice(0, 3);
  }, [data.conversations, data.messages, data.meetings, data.contacts, contactsById, pendingTasks]);

  const toReview = data.contacts.filter(contact => contact.status === 'new' || contact.status === 'qualifying');
  const channelCount = new Set(data.conversations.map(conversation => conversation.channel)).size;

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const message = draft.trim();
    if (!message || !agent || pending) return;
    setError('');
    setPending(message);
    setDraft('');
    try {
      const response = await askClaude({ agentId: agent.id, message, history: recentContext(turns) });
      setTurns(previous => [...previous, { role: 'user', content: message }, { role: 'assistant', content: response.text }]);
    } catch (cause) {
      setDraft(message);
      setError(cause instanceof Error ? cause.message : 'Não foi possível consultar o Claude. Tente novamente.');
    } finally {
      setPending('');
    }
  }

  const reset = () => { setTurns([]); setDraft(''); setError(''); input.current?.focus(); };
  const useChip = (prompt: string) => { setDraft(prompt); input.current?.focus(); };
  const canSend = Boolean(agent) && !demo && !pending && draft.trim().length > 0;
  const hint = !agent ? 'Ative um agente de IA para conversar por aqui.' : demo ? 'Modo demonstração: entre com sua conta para conversar com o Claude.' : '';
  const name = userName?.trim();

  return <div className="home" data-theme={theme}>
    <div className="home-top">
      <label className="home-agent" title="Agente que responde nesta tela">
        <span className={`home-dot ${agent ? 'on' : ''}`} aria-hidden="true" />
        <span className="home-sr">Agente de IA</span>
        {activeAgents.length > 0
          ? <select value={agent?.id ?? ''} onChange={event => { setAgentId(event.target.value); setTurns([]); setError(''); }} disabled={Boolean(pending)}>{activeAgents.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          : <span className="home-agent-none">Sem agente ativo</span>}
        {activeAgents.length > 0 && <Icon name="chevron" size={12} />}
      </label>
      <button type="button" className="home-theme" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'} title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}>
        {theme === 'dark'
          ? <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
          : <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>}
      </button>
    </div>

    <div className="home-body">
      <div className="home-eyebrow"><i aria-hidden="true" />{eyebrow}</div>
      <h1 className="home-title">{greeting()}{name ? `, ${name}` : ''}.<span>Por onde vamos continuar?</span></h1>

      <div className="home-tabs" role="tablist" aria-label="Contexto da conversa">
        {tabs.map(item => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>{item.icon}{item.label}</button>)}
      </div>

      {(turns.length > 0 || pending) && <div className="home-thread" aria-live="polite" aria-busy={Boolean(pending)}>
        {turns.map((turn, index) => <div className={`home-bubble ${turn.role}`} key={index}><span>{turn.role === 'user' ? 'Você' : `${agent?.name ?? 'Agente'} · Claude`}</span><p>{turn.content}</p></div>)}
        {pending && <><div className="home-bubble user"><span>Você</span><p>{pending}</p></div><div className="home-bubble assistant" role="status"><span>{agent?.name ?? 'Agente'} · Claude</span><p className="home-typing">Gerando resposta…</p></div></>}
        <div ref={bottom} />
      </div>}

      <form className="home-composer" onSubmit={send}>
        <div className="home-composer-row"><span className="home-spark" aria-hidden="true"><Icon name="spark" size={14} /></span>
          <textarea ref={input} rows={2} maxLength={4000} value={draft} aria-label="Mensagem para o agente" placeholder={current.placeholder} disabled={Boolean(pending) || !agent}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} />
        </div>
        <div className="home-composer-bar">
          <button type="button" className="home-round" onClick={reset} disabled={Boolean(pending) || (turns.length === 0 && !draft && !error)} aria-label="Nova conversa" title="Nova conversa"><Icon name="plus" size={14} /></button>
          <button type="submit" className="home-send" disabled={!canSend} aria-label="Enviar" title="Enviar"><Icon name="send" size={15} /></button>
        </div>
      </form>
      {error && <div className="home-alert" role="alert">{error}</div>}
      {!error && hint && <p className="home-hint">{hint}{!agent && <> <button type="button" onClick={() => navigate('agents')}>Configurar agente</button></>}</p>}

      <div className="home-chips">{current.chips.map(chip => <button key={chip.label} type="button" onClick={() => useChip(chip.prompt)} disabled={Boolean(pending) || !agent}><i className={`home-dot ${chip.dot}`} aria-hidden="true" />{chip.label}</button>)}</div>

      {loading ? <p className="home-muted" role="status">Carregando seu espaço…</p> : <>
        <div className="home-section-head"><span>Continuar em {workspaceName}</span><span>{demo ? 'DEMONSTRAÇÃO' : 'ATIVIDADE RECENTE'}</span></div>
        {activity.length > 0
          ? <ul className="home-list">{activity.map(item => <li key={item.id}><button type="button" onClick={() => navigate(item.page)}><span className={`home-ico ${item.highlight ? 'hot' : ''}`}><Icon name="spark" size={13} /></span><span className="home-list-text">{item.text}</span><span className={`home-when ${item.highlight ? 'hot' : ''}`}>{item.right}</span></button></li>)}</ul>
          : <p className="home-empty">Nada por aqui ainda. Cadastre um contato ou ative um agente para começar.</p>}

        <div className="home-section-head"><span>Pronto para começar</span></div>
        <div className="home-cards">
          <button type="button" className="home-card" onClick={() => navigate('contacts')}>
            <b>Revisar contatos</b>
            <span>{toReview.length ? `${toReview.length} ${toReview.length === 1 ? 'contato aguarda' : 'contatos aguardam'} qualificação.` : 'Nenhum contato aguardando revisão. Cadastre novos leads para a IA qualificar.'}</span>
            {toReview.length > 0 && <div className="home-faces">{toReview.slice(0, 3).map(contact => <i key={contact.id} title={contact.name}>{initials(contact.name)}</i>)}{toReview.length > 3 && <em>+{toReview.length - 3}</em>}</div>}
          </button>
          <button type="button" className="home-card" onClick={() => navigate('integrations')}>
            <b>Conectar canais</b>
            <span>Ligue WhatsApp, Instagram e agenda para o agente atender e agendar automaticamente.</span>
            <div className="home-faces"><i title="WhatsApp"><Icon name="whatsapp" size={13} /></i><i title="Agenda"><Icon name="calendar" size={13} /></i><i title="Site"><Icon name="globe" size={13} /></i>{channelCount > 0 && <em>{channelCount} em uso</em>}</div>
          </button>
        </div>
      </>}
    </div>
  </div>;
}
