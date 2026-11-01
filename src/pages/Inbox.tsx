import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useWorkspace } from '../lib/workspace';
import { stages, type Conversation, type DealStage } from '../lib/types';
import { supabase } from '../lib/supabase';
import './ai.css';

const statusText: Record<Conversation['status'], string> = { ai: 'IA ativa', human: 'Atendimento humano', closed: 'Encerrada' };
const formatTime = (value: string) => new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export default function Inbox() {
  const { loading, data, demo, create, update, remove, askClaude, refresh, api } = useWorkspace();
  const [selectedId, setSelectedId] = useState(()=>window.location.hash.split('/')[1]||'');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [newConversation, setNewConversation] = useState(false);
  const [contactId, setContactId] = useState('');
  const [agentId, setAgentId] = useState('');
  const [channel, setChannel] = useState<'whatsapp' | 'web'>('whatsapp');
  const [firstMessage, setFirstMessage] = useState('');
  const startRequest = useRef<{key:string;id:string}|null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const pendingSend = useRef<{text:string;conversationId:string;id:string}|null>(null);
  useEffect(() => {if (demo) return; const timer=window.setInterval(() => {if (!document.hidden) void refresh(true).catch(()=>{});},5000);return () => window.clearInterval(timer);},[demo,refresh]);
  const conversation = data.conversations.find((item) => item.id === selectedId);
  useEffect(()=>{const listener=()=>setSelectedId(window.location.hash.split('/')[1]||'');window.addEventListener('hashchange',listener);return()=>window.removeEventListener('hashchange',listener);},[]);
  const contact = data.contacts.find((item) => item.id === conversation?.contact_id);
  const agent = data.agents.find((item) => item.id === conversation?.agent_id);
  const messages = data.messages.filter((item) => item.conversation_id === selectedId).sort((a, b) => a.created_at.localeCompare(b.created_at));
  // Eventos do funil e da agenda aparecem na linha do tempo da conversa, entre as mensagens.
  const events = conversation ? [
    ...data.deal_events.filter(e => data.deals.some(d => d.id === e.deal_id && d.contact_id === conversation.contact_id) && (e.kind === 'created' || e.kind === 'stage') && e.created_at >= conversation.created_at).map(e => {
      const deal = data.deals.find(d => d.id === e.deal_id);
      const to = (e.detail as { to?: DealStage }).to, from = (e.detail as { from?: DealStage }).from;
      return { id: `d${e.id}`, at: e.created_at, icon: '↗', text: e.kind === 'created' ? `Oportunidade criada no funil${deal ? ` · ${deal.title}` : ''}` : `Oportunidade movida${from && to ? `: ${stages[from] ?? from} → ${stages[to] ?? to}` : ''}` };
    }),
    ...data.meetings.filter(m => m.contact_id === conversation.contact_id && m.created_at >= conversation.created_at).map(m => ({ id: `m${m.id}`, at: m.created_at, icon: '📅', text: `Reunião ${m.status === 'cancelled' ? 'cancelada' : 'agendada'}${m.source === 'ai' ? ' pela IA' : ''} · ${formatTime(m.starts_at)} · ${m.duration} min` })),
  ] : [];
  const timeline = [...messages.map(m => ({ kind: 'message' as const, at: m.created_at, message: m })), ...events.map(e => ({ kind: 'event' as const, at: e.at, event: e }))].sort((a, b) => a.at.localeCompare(b.at));
  const firstQuestion = messages.find(m => m.role === 'user');
  const firstAnswer = firstQuestion && messages.find(m => m.role === 'assistant' && m.created_at >= firstQuestion.created_at);
  const answerSeconds = firstQuestion && firstAnswer ? Math.max(0, Math.round((new Date(firstAnswer.created_at).getTime() - new Date(firstQuestion.created_at).getTime()) / 1000)) : null;
  const answerLabel = answerSeconds === null ? '' : answerSeconds < 60 ? `${answerSeconds}s` : answerSeconds < 3600 ? `${Math.round(answerSeconds / 60)} min` : `${Math.round(answerSeconds / 3600)} h`;
  const activeAgents = data.agents.filter((item) => item.active);
  const canCreate = data.contacts.length > 0;
  const chosenContact = data.contacts.find((item) => item.id === contactId);
  const filtered = [...data.conversations].sort((a, b) => b.created_at.localeCompare(a.created_at)).filter((item) => {
    const person = data.contacts.find((candidate) => candidate.id === item.contact_id);
    return `${person?.name ?? 'Contato removido'} ${person?.company ?? ''}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'));
  });

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length, selectedId]);
  useEffect(() => {
    if (!loading && selectedId && !data.conversations.some((item) => item.id === selectedId)) setSelectedId('');
  }, [data.conversations, selectedId,loading]);
  useEffect(() => {
    if (!newConversation) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) setNewConversation(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [newConversation, busy]);

  function select(id: string) {
    if (busy) return;
    setSelectedId(id);
    setDraft('');
    setError('');
  }

  async function start(event: FormEvent) {
    event.preventDefault();
    if (!contactId || busy) return;
    setBusy(true);
    setError('');
    try {
      if (channel === 'whatsapp') {
        const text = firstMessage.trim();
        if (!text) throw new Error('Escreva a mensagem que será enviada ao contato.');
        if (demo) throw new Error('Na demonstração não há WhatsApp conectado. Entre com sua conta para enviar ao contato.');
        // Reuse the request id when retrying the same message, so a timeout never sends it twice.
        const key = `${contactId}:${text}`;
        if (startRequest.current?.key !== key) startRequest.current = { key, id: crypto.randomUUID() };
        const result = await api<{conversationId: string}>('whatsapp.start', { contactId, requestId: startRequest.current.id, text });
        startRequest.current = null;
        await refresh().catch(() => {});
        setSelectedId(result.conversationId);
      } else {
        if (!agentId) throw new Error('Escolha um agente ativo para o teste interno.');
        const result = await create('conversations', { contact_id: contactId, agent_id: agentId, channel: 'web', status: 'ai' });
        setSelectedId(result.id);
      }
      setDraft('');
      setFirstMessage('');
      setNewConversation(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível criar a conversa.');
    } finally { setBusy(false); }
  }

  async function changeStatus(status: Conversation['status']) {
    if (!conversation || busy) return;
    setBusy(true);
    setError('');
    try { await update('conversations', conversation.id, { status }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar a conversa.'); }
    finally { setBusy(false); }
  }

  async function deleteConversation() {
    if (!conversation || busy || !window.confirm('Excluir esta conversa e seu histórico? Esta ação não pode ser desfeita.')) return;
    setBusy(true);
    setError('');
    try { await remove('conversations', conversation.id); setSelectedId(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível excluir a conversa.'); }
    finally { setBusy(false); }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const message = draft.trim();
    if (!conversation || !message || busy || conversation.status === 'closed') return;
    setBusy(true);
    setError('');
    try {
      if (conversation.status === 'human') {
        if (conversation.channel !== 'web' && !demo) {
          if(!pendingSend.current||pendingSend.current.text!==message||pendingSend.current.conversationId!==conversation.id)pendingSend.current={text:message,conversationId:conversation.id,id:crypto.randomUUID()};
          await api('channel.send',{conversationId:conversation.id,requestId:pendingSend.current.id,text:message});
          pendingSend.current=null;
        } else await create('messages', { conversation_id: conversation.id, role: 'human', content: message });
      } else {
        if (!agent?.active) throw new Error('Ative o agente desta conversa antes de enviar uma mensagem para a IA.');
        await askClaude({ agentId: agent.id, conversationId: conversation.id, message });
      }
      setDraft('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível enviar a mensagem.');
    } finally {
      // Releia o estado persistido também após falhas, para não exibir um envio
      // apenas otimista nem perder mensagens salvas antes de erro de conexão.
      try { await refresh(); } catch { /* O erro de carregamento é exibido pelo workspace. */ }
      setBusy(false);
    }
  }

  const disabledSend = busy || !conversation || conversation.status === 'closed' || (conversation.status === 'ai' && (!agent?.active || demo || conversation.channel !== 'web'));

  return <div className={`ai-inbox ${selectedId ? 'ai-inbox-selected' : ''}`}>
    <aside className="ai-conversations" aria-label="Lista de conversas">
      <div className="ai-conversation-heading"><h1>Caixa de entrada</h1><button className="btn btn-primary" onClick={() => { setError(''); setContactId(data.contacts[0]?.id ?? ''); setAgentId(activeAgents[0]?.id ?? ''); setChannel(demo ? 'web' : 'whatsapp'); setFirstMessage(''); setNewConversation(true); }} disabled={busy || !canCreate} aria-label="Nova conversa">+ Nova</button></div>
      <div className="ai-conversation-search"><label className="ai-field"><span className="ai-sr-only">Buscar conversas</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar contato ou empresa…" /></label></div>
      <p className="ai-conversation-note">Todos os canais · {data.conversations.length} conversas</p>
      <div className="ai-conversation-list">
        {filtered.map((item) => {
          const person = data.contacts.find((candidate) => candidate.id === item.contact_id);
          const recent = data.messages.filter((entry) => entry.conversation_id === item.id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
          return <button key={item.id} className={`ai-conversation-item ${selectedId === item.id ? 'selected' : ''}`} onClick={() => select(item.id)} disabled={busy} aria-pressed={selectedId === item.id}><span className="avatar">{person?.name.split(' ').filter(Boolean).map((part) => part[0]).slice(0, 2).join('') || '?'}</span><span className="ai-conversation-copy"><b>{person?.name ?? 'Contato removido'}</b><small>{person?.company || 'Sem empresa'}</small><span>{recent?.content ?? 'Nenhuma mensagem ainda'}</span><span className={`badge badge-${item.status === 'ai' ? 'success' : item.status === 'human' ? 'warning' : 'neutral'}`}>{statusText[item.status]}</span></span></button>;
        })}
        {filtered.length === 0 && <div className="ai-empty"><h2>{search ? 'Nenhuma conversa encontrada' : 'Sua caixa está vazia'}</h2><p>{canCreate ? 'Inicie uma conversa pelo WhatsApp ou teste o agente com um contato.' : 'Cadastre um contato para começar.'}</p></div>}
      </div>
    </aside>
    <section className="ai-inbox-chat" aria-label="Histórico da conversa">
      {!conversation ? <div className="ai-empty ai-inbox-welcome"><span className="ai-empty-symbol" aria-hidden="true">↗</span><h2>O atendimento começa aqui</h2><p>Selecione uma conversa ou crie um atendimento interno.</p><p className="ai-muted">Mensagens dos canais conectados aparecem aqui automaticamente quando a integração está ativa. Apenas números autorizados acionam a IA.</p>{error && <div className="ai-alert" role="alert">{error}</div>}</div> : <>
        <div className="ai-inbox-heading"><button className="btn ai-inbox-back" aria-label="Voltar à lista" disabled={busy} onClick={() => select('')}>←</button><div><h2>{contact?.name ?? 'Contato removido'}</h2><span>{agent?.name ?? 'Agente removido'} · {({web:'Web interno',whatsapp:'WhatsApp',email:'E-mail',instagram:'Instagram',widget:'Widget do site'})[conversation.channel]}</span></div>{answerLabel && <span className="badge badge-brand" title="Tempo entre a primeira mensagem do cliente e a primeira resposta da IA">⚡ 1ª resposta em {answerLabel}</span>}<span className={`badge badge-${conversation.status === 'ai' ? 'success' : conversation.status === 'human' ? 'warning' : 'neutral'}`}>{statusText[conversation.status]}</span></div>
        <div className="ai-inbox-controls"><p>{conversation.status === 'ai' ? (conversation.channel !== 'web' ? conversation.channel==='whatsapp'?'A Felipa responde aos números autorizados. Assuma para responder pessoalmente.':'Mensagens recebidas pelo canal conectado. Assuma para responder pessoalmente.' : 'As mensagens simulam um lead e recebem resposta da IA.') : conversation.status === 'human' ? (conversation.channel !== 'web' ? `Atendimento humano: suas respostas serão enviadas pelo canal ${conversation.channel}.` : 'Você assumiu o atendimento. Suas mensagens ficam registradas, sem resposta da IA.') : 'Conversa encerrada. Reabra para continuar o atendimento.'}</p><div className="ai-actions">{conversation.status !== 'human' && <button className="btn" onClick={() => changeStatus('human')} disabled={busy}>Assumir como humano</button>}{conversation.status !== 'ai' && <button className="btn" onClick={() => changeStatus('ai')} disabled={busy || !agent?.active}>Retomar IA</button>}{conversation.status !== 'closed' && <button className="btn" onClick={() => changeStatus('closed')} disabled={busy}>Encerrar</button>}<button className="btn btn-danger" onClick={deleteConversation} disabled={busy}>Excluir</button></div></div>
        <div className="ai-chat-messages" aria-live="polite" aria-busy={busy}>
          {messages.length === 0 && <div className="ai-empty"><h2>Conversa pronta</h2><p>Envie uma mensagem como cliente para validar o agente.</p></div>}
          {timeline.map((item) => item.kind === 'event' ? <div className="system-event" key={item.event.id} role="status"><span aria-hidden="true">{item.event.icon}</span> {item.event.text}</div> : (entry => <div className={`ai-chat-bubble ${entry.role}`} key={entry.id}><span>{entry.role === 'user' ? contact?.name ?? 'Cliente' : entry.role === 'human' ? 'Você · Atendimento humano' : `${agent?.name ?? 'Agente'} · IA`}</span><p>{entry.content}</p><time dateTime={entry.created_at}>{formatTime(entry.created_at)}{entry.delivery_status && entry.delivery_status !== 'stored' && entry.delivery_status !== 'received' ? ` · ${{queued:'Na fila',sending:'Enviando',sent:'Enviado',delivered:'Entregue',read:'Lido',failed:'Falhou',uncertain:'Envio não confirmado — confira no canal',canceled:'Cancelado'}[entry.delivery_status] || entry.delivery_status}` : ''}</time></div>)(item.message))}
          {busy && <div className="ai-chat-pending" role="status">Processando…</div>}
          <div ref={bottom} />
        </div>
        <form className="ai-chat-composer" onSubmit={send}>
          {error && <div className="ai-alert" role="alert">{error}</div>}
          {demo && conversation.status === 'ai' && <div className="ai-note">Respostas de IA requerem Supabase e uma chave API Anthropic. No modo demonstração, você pode registrar mensagens humanas.</div>}
          {!agent?.active && conversation.status === 'ai' && <div className="ai-note">O agente está pausado ou foi removido. Ative-o ou assuma o atendimento humano.</div>}
          <label className="ai-field"><span>{conversation.status === 'human' ? 'Sua resposta como atendente' : 'Mensagem do cliente de teste'}</span><textarea rows={3} maxLength={4000} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={conversation.status === 'human' ? 'Digite sua resposta…' : 'Simule uma mensagem recebida do lead…'} disabled={busy || conversation.status === 'closed' || (conversation.channel !== 'web' && conversation.status === 'ai')} /></label>
          <div className="ai-actions"><small className="ai-muted">{conversation.channel !== 'web' ? `Envio pelo canal ${conversation.channel} · atendimento humano` : 'Registro interno · sem envio para canais externos'}</small><button className="btn btn-primary" disabled={disabledSend || !draft.trim()}>{busy ? 'Enviando…' : conversation.status === 'human' ? (conversation.channel !== 'web' ? `Enviar pelo ${conversation.channel==='email'?'e-mail':conversation.channel==='widget'?'chat do site':conversation.channel==='instagram'?'Instagram':'WhatsApp'}` : 'Registrar resposta') : 'Enviar ao agente'}</button></div>
        </form>
      </>}
    </section>
    {newConversation && <div className="modal-overlay"><form className="modal ai-modal" role="dialog" aria-modal="true" aria-labelledby="new-conversation-title" onSubmit={start}><div className="modal-head"><div><h2 className="page-title" id="new-conversation-title">Nova conversa</h2><span>Envie uma mensagem ao contato ou teste o agente internamente.</span></div><button className="btn btn-ghost btn-icon" type="button" onClick={() => setNewConversation(false)} disabled={busy} aria-label="Fechar nova conversa">×</button></div><div className="modal-body">
      <label className="ai-field"><span>Contato</span><select autoFocus required value={contactId} onChange={(event) => setContactId(event.target.value)} disabled={busy}>{data.contacts.map((item) => <option key={item.id} value={item.id}>{item.name}{item.company ? ` · ${item.company}` : ''}</option>)}</select></label>
      <fieldset className="ai-channel-choice" disabled={busy}><legend>Canal</legend>
        <label className={channel === 'whatsapp' ? 'selected' : ''}><input type="radio" name="channel" value="whatsapp" checked={channel === 'whatsapp'} onChange={() => setChannel('whatsapp')} /><span><b>WhatsApp</b><small>Envia a mensagem para o telefone do contato. A conversa fica em atendimento humano.</small></span></label>
        <label className={channel === 'web' ? 'selected' : ''}><input type="radio" name="channel" value="web" checked={channel === 'web'} onChange={() => setChannel('web')} /><span><b>Teste interno com IA</b><small>Simula o lead dentro do painel. Nada é enviado ao contato.</small></span></label>
      </fieldset>
      {channel === 'whatsapp' ? <>
        <p className="ai-muted">Telefone: {chosenContact?.phone ? chosenContact.phone : <b className="ai-warning-text">contato sem telefone — edite a ficha antes de enviar</b>}</p>
        <label className="ai-field"><span>Mensagem</span><textarea required rows={4} maxLength={4000} value={firstMessage} onChange={(event) => setFirstMessage(event.target.value)} placeholder="Olá! Aqui é da Oliveira & Co. …" disabled={busy} /></label>
      </> : <label className="ai-field"><span>Agente ativo</span><select required value={agentId} onChange={(event) => setAgentId(event.target.value)} disabled={busy || !activeAgents.length}>{activeAgents.length ? activeAgents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>) : <option value="">Nenhum agente ativo</option>}</select></label>}
      {error && <div className="ai-alert" role="alert">{error}</div>}
    </div><div className="modal-footer"><button className="btn" type="button" onClick={() => setNewConversation(false)} disabled={busy}>Cancelar</button><button className="btn btn-primary" disabled={busy || !contactId || (channel === 'whatsapp' ? !firstMessage.trim() || !chosenContact?.phone : !agentId)}>{busy ? 'Enviando…' : channel === 'whatsapp' ? 'Enviar pelo WhatsApp' : 'Criar conversa de teste'}</button></div></form></div>}
  </div>;
}
