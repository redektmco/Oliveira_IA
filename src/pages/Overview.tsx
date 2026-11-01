import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Icon, type IconName } from '../components/ui';
import { useWorkspace } from '../lib/workspace';
import type { AssistantCard, AssistantMessage, AssistantThread } from '../lib/types';
import './home.css';

type Theme = 'dark' | 'light';
type Reply = { threadId: string | null; title: string | null; persisted: boolean; text: string; actions: AssistantCard[] };

const TZ = 'America/Sao_Paulo';
const THEME_KEY = 'oliveira-home-theme';

/** `send` runs the prompt right away; otherwise it fills the composer for the person to complete. */
const suggestions: { label: string; icon: IconName; prompt: string; send?: boolean }[] = [
  { label: 'Resumir meu dia', icon: 'spark', send: true, prompt: 'Faça um resumo do meu dia: tarefas pendentes, reuniões próximas e conversas que precisam de atenção.' },
  { label: 'Leads para qualificar', icon: 'users', send: true, prompt: 'Liste os contatos novos ou em qualificação e sugira o próximo passo para cada um.' },
  { label: 'Conversas em aberto', icon: 'message', send: true, prompt: 'Quais conversas da caixa de entrada estão em aberto? Destaque as que o cliente respondeu por último.' },
  { label: 'Criar contato', icon: 'plus', prompt: 'Crie um contato: ' },
  { label: 'Nova oportunidade', icon: 'pipeline', prompt: 'Crie uma oportunidade para ' },
  { label: 'Agendar reunião', icon: 'calendar', prompt: 'Agende uma reunião com ' },
  { label: 'Mandar WhatsApp', icon: 'whatsapp', prompt: 'Mande uma mensagem no WhatsApp para ' },
];

const kindIcon: Record<AssistantCard['kind'], IconName> = { read: 'search', create: 'plus', update: 'edit', send: 'send' };

function greeting() {
  const hour = Number(new Date().toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', hour12: false })) % 24;
  return hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
}

function readTheme(): Theme {
  try { return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
}

function when(iso: string) {
  const at = new Date(iso).getTime(), minutes = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (minutes < 60) return minutes < 1 ? 'agora' : `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `há ${hours} h` : new Date(iso).toLocaleDateString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' });
}

/** Small safe renderer: **bold**, `code`, "-" / "1." lists and paragraphs. Never injects HTML. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\s][^*\n]*\*)/g).filter(Boolean).map((part, index) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <strong key={index}>{part.slice(2, -2)}</strong>
      : part.startsWith('`') && part.endsWith('`') && part.length > 2 ? <code key={index}>{part.slice(1, -1)}</code>
        : part.startsWith('*') && part.endsWith('*') && part.length > 2 ? <em key={index}>{part.slice(1, -1)}</em>
          : <span key={index}>{part}</span>);
}
function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let paragraph: string[] = [];
  const flushParagraph = () => { if (paragraph.length) { blocks.push(<p key={blocks.length}>{paragraph.flatMap((line, i) => i ? [<br key={`b${i}`} />, ...inline(line)] : inline(line))}</p>); paragraph = []; } };
  const flushList = () => { if (list) { const Tag = list.ordered ? 'ol' : 'ul'; blocks.push(<Tag key={blocks.length}>{list.items.map((item, i) => <li key={i}>{inline(item)}</li>)}</Tag>); list = null; } };
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd(), bullet = /^\s*[-*•]\s+(.*)$/.exec(line), numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flushParagraph();
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
    } else if (!line.trim()) { flushParagraph(); flushList(); }
    else { flushList(); paragraph.push(line.replace(/^#{1,4}\s+/, '')); }
  }
  flushParagraph(); flushList();
  return <div className="home-md">{blocks}</div>;
}

export default function Overview({ go, userName }: { go?: (page: string) => void; userName?: string }) {
  const { data, demo, role, workspaceName, api, refresh } = useWorkspace();
  const navigate = (page: string) => go?.(page);
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [draft, setDraft] = useState('');
  const [turns, setTurns] = useState<AssistantMessage[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [threads, setThreads] = useState<AssistantThread[]>([]);
  const [historyOn, setHistoryOn] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [saved, setSaved] = useState(true);
  const input = useRef<HTMLTextAreaElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const turnsRef = useRef(turns);
  turnsRef.current = turns;

  const blocked = demo ? 'Modo demonstração: entre com sua conta para conversar com o assistente.' : role === 'seller' ? 'Vendedores usam a IA nas conversas atribuídas na Caixa de entrada.' : '';
  const chatting = turns.length > 0 || pending;
  const name = userName?.trim();

  const loadThreads = useCallback(async () => {
    if (demo || role === 'seller') return;
    try { const result = await api<{ available: boolean; threads: AssistantThread[] }>('assistant.threads'); setThreads(result.threads); setHistoryOn(result.available); } catch { /* History is optional; the chat still works. */ }
  }, [api, demo, role]);
  useEffect(() => { void loadThreads(); }, [loadThreads]);

  useEffect(() => { if (chatting) bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [turns, pending, error, chatting]);
  useEffect(() => { if (!chatting) input.current?.focus(); }, [chatting]);
  useLayoutEffect(() => {
    const field = input.current; if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${Math.min(field.scrollHeight, 200)}px`;
  }, [draft, chatting]);
  useEffect(() => {
    if (!drawer) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setDrawer(false); };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [drawer]);

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* The theme still changes for this visit. */ }
  };

  const queue = useMemo(() => data.deal_tasks.filter(task => !task.done_at).length, [data.deal_tasks]);
  const eyebrow = `${new Date().toLocaleDateString('pt-BR', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '').toUpperCase()} · ${queue === 0 ? 'NENHUMA TAREFA NA FILA' : `${queue} ${queue === 1 ? 'TAREFA NA FILA' : 'TAREFAS NA FILA'}`}`;

  async function ask(text: string, base: AssistantMessage[]) {
    setError(''); setPending(true);
    setTurns([...base, { role: 'user', content: text }]);
    try {
      const reply = await api<Reply>('assistant.chat', { message: text, ...(threadId ? { threadId } : { history: base.slice(-20).map(({ role: r, content, actions }) => ({ role: r, content, actions })) }) });
      setTurns(previous => [...previous, { role: 'assistant', content: reply.text, actions: reply.actions }]);
      setSaved(reply.persisted || threadId !== null);
      if (reply.threadId) {
        setThreadId(reply.threadId);
        if (reply.title) setThreads(previous => [{ id: reply.threadId!, title: reply.title!, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, ...previous.filter(item => item.id !== reply.threadId)]);
        else setThreads(previous => { const hit = previous.find(item => item.id === reply.threadId); return hit ? [{ ...hit, updated_at: new Date().toISOString() }, ...previous.filter(item => item.id !== hit.id)] : previous; });
      }
      if (reply.actions.some(action => action.ok && action.kind !== 'read')) void refresh(true).catch(() => undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível falar com o assistente. Tente novamente.');
    } finally { setPending(false); }
  }

  const send = (event?: FormEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || pending || blocked) return;
    setDraft('');
    void ask(text, turnsRef.current);
  };
  const retry = () => {
    const last = [...turnsRef.current].reverse().find(turn => turn.role === 'user');
    if (!last || pending) return;
    void ask(last.content, turnsRef.current.slice(0, turnsRef.current.lastIndexOf(last)));
  };
  const choose = (item: (typeof suggestions)[number]) => {
    if (blocked || pending) return;
    if (item.send) { void ask(item.prompt, turnsRef.current); return; }
    setDraft(item.prompt);
    input.current?.focus();
  };
  const reset = () => { setTurns([]); setThreadId(null); setDraft(''); setError(''); setSaved(true); setDrawer(false); };
  const openThread = async (id: string) => {
    if (pending) return;
    try {
      const result = await api<{ messages: AssistantMessage[] }>('assistant.thread', { id });
      setTurns(result.messages.map(({ role: r, content, actions }) => ({ role: r, content, actions }))); setThreadId(id); setError(''); setSaved(true); setDrawer(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível abrir a conversa.'); setDrawer(false); }
  };
  const removeThread = async (id: string) => {
    try { await api('assistant.delete', { id }); setThreads(previous => previous.filter(item => item.id !== id)); if (id === threadId) reset(); } catch { /* The list is refreshed on the next visit. */ }
  };

  const composer = <form className="home-composer" onSubmit={send}>
    <textarea ref={input} rows={chatting ? 1 : 2} maxLength={4000} value={draft} aria-label="Mensagem para o assistente" disabled={Boolean(blocked)}
      placeholder={chatting ? 'Responder ao assistente…' : 'Peça qualquer coisa: criar contato, mandar mensagem, ver oportunidades…'}
      onChange={event => setDraft(event.target.value)}
      onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }} />
    <div className="home-composer-bar">
      <span className="home-composer-note"><Icon name="spark" size={13} />Claude · acessa seus contatos, oportunidades, reuniões e conversas</span>
      <button type="submit" className="home-send" disabled={Boolean(blocked) || pending || !draft.trim()} aria-label="Enviar" title="Enviar"><Icon name="arrow" size={15} /></button>
    </div>
  </form>;

  return <div className="home" data-theme={theme}>
    <div className="home-top">
      <div className="home-top-left">
        {chatting && <button type="button" className="home-ghost" onClick={reset} disabled={pending}><Icon name="plus" size={14} />Nova conversa</button>}
      </div>
      <div className="home-top-right">
        {!demo && role !== 'seller' && <button type="button" className="home-ghost" onClick={() => setDrawer(true)} aria-haspopup="dialog" aria-expanded={drawer}><Icon name="clock" size={14} />Histórico</button>}
        <button type="button" className="home-icon-btn" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'} title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}>
          {theme === 'dark'
            ? <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
            : <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>}
        </button>
      </div>
    </div>

    {!chatting ? <div className="home-hero">
      <div className="home-eyebrow"><i aria-hidden="true" />{eyebrow}</div>
      <h1 className="home-title">{greeting()}{name ? `, ${name}` : ''}.<span>O que vamos fazer em {workspaceName}?</span></h1>
      {composer}
      {blocked && <p className="home-hint">{blocked}</p>}
      <div className="home-chips" aria-label="Sugestões">{suggestions.map(item => <button key={item.label} type="button" onClick={() => choose(item)} disabled={Boolean(blocked)}><Icon name={item.icon} size={13} />{item.label}</button>)}</div>
    </div> : <>
      <div className="home-thread" role="log" aria-live="polite" aria-busy={pending}>
        <div className="home-thread-inner">
          {turns.map((turn, index) => turn.role === 'user'
            ? <div className="home-msg user" key={index}><p>{turn.content}</p></div>
            : <div className="home-msg assistant" key={index}>
              <span className="home-avatar" aria-hidden="true"><Icon name="spark" size={13} /></span>
              <div className="home-msg-body">
                {turn.actions && turn.actions.length > 0 && <ul className="home-actions">{turn.actions.map(action => <li key={action.id} className={`${action.kind} ${action.ok ? '' : 'failed'}`}>
                  <span className="home-action-ico"><Icon name={action.ok ? kindIcon[action.kind] : 'alert'} size={13} /></span>
                  <span className="home-action-text"><b>{action.title}</b>{(action.detail || action.error) && <small>{action.ok ? action.detail : action.error}</small>}</span>
                  {action.ok && action.href && <button type="button" onClick={() => navigate(action.href!)} aria-label={`Abrir: ${action.title}`}>Abrir<Icon name="chevron" size={12} /></button>}
                </li>)}</ul>}
                <Markdown text={turn.content} />
              </div>
            </div>)}
          {pending && <div className="home-msg assistant" role="status">
            <span className="home-avatar working" aria-hidden="true"><Icon name="spark" size={13} /></span>
            <div className="home-msg-body"><p className="home-typing"><i /><i /><i /><span>Trabalhando no seu pedido…</span></p></div>
          </div>}
          {error && <div className="home-alert" role="alert"><span>{error}</span><button type="button" onClick={retry} disabled={pending}>Tentar novamente</button></div>}
          <div ref={bottom} />
        </div>
      </div>
      <div className="home-dock">
        <div className="home-dock-inner">
          {composer}
          <p className="home-foot">{historyOn && !saved ? 'Esta conversa não está sendo salva: aplique a migração do histórico no Supabase. ' : ''}A IA pode errar; confira as ações executadas antes de seguir.</p>
        </div>
      </div>
    </>}

    {drawer && <>
      <button type="button" className="home-scrim" aria-label="Fechar histórico" onClick={() => setDrawer(false)} />
      <aside className="home-drawer" role="dialog" aria-label="Histórico de conversas">
        <div className="home-drawer-head"><b>Histórico</b><button type="button" className="home-icon-btn" onClick={() => setDrawer(false)} aria-label="Fechar"><Icon name="close" size={14} /></button></div>
        <button type="button" className="home-new" onClick={reset} disabled={pending}><Icon name="plus" size={14} />Nova conversa</button>
        {!historyOn ? <p className="home-drawer-empty">O histórico ainda não está disponível neste workspace. Aplique a migração <code>202611040007_assistant.sql</code> no Supabase.</p>
          : threads.length === 0 ? <p className="home-drawer-empty">Suas conversas com o assistente aparecem aqui.</p>
            : <ul className="home-threads">{threads.map(item => <li key={item.id} className={item.id === threadId ? 'active' : ''}>
              <button type="button" onClick={() => void openThread(item.id)}><span>{item.title}</span><small>{when(item.updated_at)}</small></button>
              <button type="button" className="home-del" onClick={() => void removeThread(item.id)} aria-label={`Excluir conversa: ${item.title}`} title="Excluir conversa"><Icon name="trash" size={13} /></button>
            </li>)}</ul>}
      </aside>
    </>}
  </div>;
}
