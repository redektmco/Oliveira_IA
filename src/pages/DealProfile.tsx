import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Icon, type IconName } from '../components/ui';
import { contactStatuses, dealProbability, openStages, stageProbability, stages, type Deal, type DealStage } from '../lib/types';
import { useWorkspace } from '../lib/workspace';
import { formatPhone } from '../lib/phone';
import { DealDialog, LostDialog, OwnerAvatar, StagePill, dateTime, daysSince, isClosed, isOverdue, longDate, memberName, money, useMembers, weighted } from './opportunities/shared';
import './pipeline.css';

type Tab = 'timeline' | 'tasks' | 'notes' | 'meetings' | 'conversations';
type Entry = { id: string; at: string; icon: IconName; tone?: string; title: ReactNode; body?: ReactNode; actor?: string };
const meetingStatus = { scheduled: 'Agendada', completed: 'Realizada', cancelled: 'Cancelada' } as const;
const localInput = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export default function DealProfile({ deal }: { deal: Deal }) {
  const { data, update, create, remove, demo, userId, phoneFormat } = useWorkspace();
  const members = useMembers();
  const [tab, setTab] = useState<Tab>('timeline');
  const [editing, setEditing] = useState(false);
  const [losing, setLosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDue, setTaskDue] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return localInput(d); });
  const [taskOwner, setTaskOwner] = useState<string>(deal.assigned_to ?? userId);
  const [note, setNote] = useState('');
  const [fields, setFields] = useState(() => fieldState(deal));
  useEffect(() => setFields(fieldState(deal)), [deal]);

  const contact = data.contacts.find(c => c.id === deal.contact_id);
  const tasks = data.deal_tasks.filter(t => t.deal_id === deal.id).sort((a, b) => Number(Boolean(a.done_at)) - Number(Boolean(b.done_at)) || (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999'));
  const notes = data.deal_notes.filter(n => n.deal_id === deal.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const events = data.deal_events.filter(e => e.deal_id === deal.id);
  const meetings = contact ? data.meetings.filter(m => m.contact_id === contact.id).sort((a, b) => b.starts_at.localeCompare(a.starts_at)) : [];
  const conversationIds = new Set(contact ? data.conversations.filter(c => c.contact_id === contact.id).map(c => c.id) : []);
  const messages = data.messages.filter(m => conversationIds.has(m.conversation_id)).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 20);
  const openTasks = tasks.filter(t => !t.done_at);
  const ownerName = memberName(members, deal.assigned_to);
  const actorName = (id: string | null) => id === 'demo' ? 'Você' : id ? memberName(members, id, 'Equipe') : 'Automação da IA';

  const run = async (fn: () => Promise<unknown>, success?: string) => {
    setBusy(true); setError(''); setNotice('');
    try { await fn(); if (success) setNotice(success); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível concluir a operação.'); }
    finally { setBusy(false); }
  };
  const setStage = (stage: DealStage) => {
    if (stage === deal.stage || busy) return;
    if (stage === 'lost') { setLosing(true); return; }
    void run(() => update('deals', deal.id, { stage }), stage === 'won' ? 'Parabéns! Oportunidade marcada como ganha.' : `Etapa alterada para ${stages[stage]}.`);
  };
  const saveFields = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const value = Number(fields.value.replace(',', '.'));
      if (!Number.isFinite(value) || value < 0) throw new Error('Informe um valor válido.');
      const probability = fields.probability === '' ? null : Number(fields.probability);
      if (probability !== null && (!Number.isInteger(probability) || probability < 0 || probability > 100)) throw new Error('A probabilidade deve ficar entre 0 e 100%.');
      await update('deals', deal.id, { value, probability, close_date: fields.close_date || null, assigned_to: fields.assigned_to || null, next_step: fields.next_step.trim(), description: fields.description.trim() });
    }, 'Detalhes salvos.');
  };
  const dirty = JSON.stringify(fields) !== JSON.stringify(fieldState(deal));
  const addTask = (event: FormEvent) => {
    event.preventDefault();
    const title = taskTitle.trim(); if (!title) return;
    void run(async () => { await create('deal_tasks', { deal_id: deal.id, title, due_at: taskDue ? new Date(taskDue).toISOString() : null, done_at: null, assigned_to: taskOwner || null }); setTaskTitle(''); }, 'Tarefa criada.');
  };
  const addNote = (event: FormEvent) => {
    event.preventDefault();
    const content = note.trim(); if (!content) return;
    void run(async () => { await create('deal_notes', { deal_id: deal.id, content }); setNote(''); }, 'Nota salva.');
  };
  const deleteDeal = () => {
    if (!window.confirm(`Excluir a oportunidade “${deal.title}”? Tarefas, notas e histórico desta oportunidade também serão excluídos.`)) return;
    void run(async () => { await remove('deals', deal.id); window.location.hash = 'pipeline'; });
  };

  const timeline = useMemo<Entry[]>(() => {
    const list: Entry[] = [];
    for (const e of events) {
      const d = e.detail || {};
      if (e.kind === 'created') list.push({ id: e.id, at: e.created_at, icon: 'plus', title: <>Oportunidade criada em <b>{stages[d.stage as DealStage] ?? 'Novo lead'}</b></>, body: d.value ? `Valor inicial ${money(Number(d.value))}` : undefined, actor: actorName(e.actor_id) });
      if (e.kind === 'stage') list.push({ id: e.id, at: e.created_at, icon: d.to === 'won' ? 'check' : d.to === 'lost' ? 'close' : 'arrow', tone: d.to === 'won' ? 'green' : d.to === 'lost' ? 'red' : 'blue', title: <>Etapa: {stages[d.from as DealStage] ?? d.from} → <b>{stages[d.to as DealStage] ?? d.to}</b></>, body: d.reason ? `Motivo: ${d.reason}` : undefined, actor: actorName(e.actor_id) });
      if (e.kind === 'value') list.push({ id: e.id, at: e.created_at, icon: 'chart', title: <>Valor: {money(Number(d.from ?? 0))} → <b>{money(Number(d.to ?? 0))}</b></>, actor: actorName(e.actor_id) });
      if (e.kind === 'owner') list.push({ id: e.id, at: e.created_at, icon: 'user', title: <>Responsável: <b>{memberName(members, d.to)}</b></>, actor: actorName(e.actor_id) });
      if (e.kind === 'close_date') list.push({ id: e.id, at: e.created_at, icon: 'calendar', title: <>Previsão de fechamento: <b>{d.to ? longDate(`${d.to}T12:00:00`) : 'removida'}</b></>, actor: actorName(e.actor_id) });
    }
    for (const n of notes) list.push({ id: `n${n.id}`, at: n.created_at, icon: 'edit', title: 'Nota adicionada', body: <p className="opp-note-text">{n.content}</p>, actor: n.author || 'Equipe' });
    for (const t of tasks) {
      list.push({ id: `t${t.id}`, at: t.created_at, icon: 'check', title: <>Tarefa criada: <b>{t.title}</b></>, body: t.due_at ? `Prazo ${dateTime(t.due_at)}` : undefined });
      if (t.done_at) list.push({ id: `d${t.id}`, at: t.done_at, icon: 'check', tone: 'green', title: <>Tarefa concluída: <b>{t.title}</b></> });
    }
    for (const m of meetings) list.push({ id: `m${m.id}`, at: m.created_at, icon: 'calendar', tone: 'amber', title: <>Reunião {meetingStatus[m.status].toLocaleLowerCase('pt-BR')}: <b>{m.title}</b></>, body: dateTime(m.starts_at), actor: m.source === 'ai' ? 'Agendada pela IA' : undefined });
    return list.sort((a, b) => b.at.localeCompare(a.at));
  }, [events, notes, tasks, meetings, members]);

  const currentIndex = openStages.indexOf(deal.stage);
  const tabs: [Tab, string, number?][] = [['timeline', 'Linha do tempo'], ['tasks', 'Tarefas', openTasks.length], ['notes', 'Notas', notes.length], ['meetings', 'Reuniões', meetings.length], ['conversations', 'Conversas', messages.length]];

  return <div className="content opp-record">
    <a className="record-back" href="#pipeline"><Icon name="chevronLeft" size={14} />Oportunidades</a>
    <header className="record-header">
      <div className="record-identity">
        <span className={`record-icon tone-${deal.stage === 'won' ? 'green' : deal.stage === 'lost' ? 'red' : 'brand'}`}><Icon name="target" size={20} /></span>
        <div>
          <div className="record-title"><h1>{deal.title}</h1><StagePill stage={deal.stage} /></div>
          <div className="record-meta">
            <span><b>{money(deal.value, true)}</b></span>
            {contact && <a href={`#contacts/${encodeURIComponent(contact.id)}`}><Icon name="user" size={14} />{contact.name}{contact.company ? ` · ${contact.company}` : ''}</a>}
            <span><OwnerAvatar name={ownerName} size="sm" />{ownerName}</span>
            <span>Criada em {longDate(deal.created_at)}</span>
          </div>
        </div>
      </div>
      <div className="page-actions">
        {isClosed(deal) ? <button className="btn" disabled={busy} onClick={() => void run(() => update('deals', deal.id, { stage: 'proposal' }), 'Oportunidade reaberta em Proposta.')}>Reabrir</button> : <>
          <button className="btn btn-danger-outline" disabled={busy} onClick={() => setLosing(true)}><Icon name="close" size={15} />Perdida</button>
          <button className="btn btn-success" disabled={busy} onClick={() => setStage('won')}><Icon name="check" size={15} />Ganha</button>
        </>}
        <button className="btn" disabled={busy} onClick={() => setEditing(true)}><Icon name="edit" size={15} />Editar</button>
        <button className="btn btn-icon" disabled={busy} onClick={deleteDeal} aria-label="Excluir oportunidade" title="Excluir"><Icon name="trash" size={15} /></button>
      </div>
    </header>

    <ol className={`opp-stagebar ${isClosed(deal) ? 'closed' : ''}`} aria-label="Etapas da oportunidade">
      {openStages.map((stage, index) => {
        const state = deal.stage === stage ? 'current' : (currentIndex > index || deal.stage === 'won') ? 'done' : '';
        return <li key={stage} className={state} aria-current={deal.stage === stage ? 'step' : undefined}>
          <button type="button" disabled={busy} onClick={() => setStage(stage)} title={`Mover para ${stages[stage]}`}><span>{stages[stage]}</span>{deal.stage === stage && <small>{daysSince(deal.stage_changed_at ?? deal.created_at)}d nesta etapa</small>}</button>
        </li>;
      })}
    </ol>
    {deal.stage === 'lost' && <div className="opp-banner danger"><Icon name="alert" size={16} /><span><b>Perdida{deal.closed_at ? ` em ${longDate(deal.closed_at)}` : ''}.</b> {deal.lost_reason || 'Motivo não informado.'}</span></div>}
    {deal.stage === 'won' && <div className="opp-banner success"><Icon name="check" size={16} /><span><b>Ganha{deal.closed_at ? ` em ${longDate(deal.closed_at)}` : ''}.</b> Registre o próximo passo de implantação nas tarefas.</span></div>}
    {error && <div className="crm-error" role="alert">{error}</div>}
    {notice && <div className="crm-success" role="status">{notice}</div>}

    <div className="record-columns">
      <div className="record-main">
        <section className="card record-tabs-card">
          <div className="record-tabs" role="tablist" aria-label="Atividades da oportunidade">
            {tabs.map(([id, label, count]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}{count !== undefined && <span>{count}</span>}</button>)}
          </div>
          <div className="record-tab-body" role="tabpanel">
            {tab === 'timeline' && <>
              <form className="opp-composer" onSubmit={addNote}><textarea aria-label="Nova nota" placeholder="Registre uma nota sobre a negociação…" maxLength={12000} value={note} onChange={e => setNote(e.target.value)} rows={2} /><div><button className="btn btn-primary btn-sm" disabled={busy || !note.trim()}>Salvar nota</button></div></form>
              {timeline.length ? <ol className="opp-timeline">{timeline.map(item => <li key={item.id}><span className={`opp-timeline-icon tone-${item.tone ?? 'gray'}`}><Icon name={item.icon} size={14} /></span><div><div className="opp-timeline-title">{item.title}</div>{item.body && <div className="opp-timeline-body">{item.body}</div>}<div className="opp-timeline-meta">{item.actor && <>{item.actor} · </>}<time dateTime={item.at}>{dateTime(item.at)}</time></div></div></li>)}</ol> : <p className="opp-empty-line">Nenhuma atividade registrada ainda.</p>}
            </>}
            {tab === 'tasks' && <>
              <form className="opp-task-form" onSubmit={addTask}>
                <input aria-label="Nova tarefa" placeholder="Ex.: Ligar para confirmar a proposta" maxLength={300} value={taskTitle} onChange={e => setTaskTitle(e.target.value)} />
                <input aria-label="Prazo" type="datetime-local" value={taskDue} onChange={e => setTaskDue(e.target.value)} />
                <select aria-label="Responsável pela tarefa" value={taskOwner} onChange={e => setTaskOwner(e.target.value)}>{members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
                <button className="btn btn-primary" disabled={busy || !taskTitle.trim()}><Icon name="plus" size={15} />Adicionar</button>
              </form>
              {tasks.length ? <ul className="opp-tasks">{tasks.map(task => { const late = !task.done_at && task.due_at && task.due_at < new Date().toISOString(); return <li key={task.id} className={task.done_at ? 'done' : ''}>
                <input type="checkbox" checked={Boolean(task.done_at)} disabled={busy} aria-label={`Concluir ${task.title}`} onChange={e => void run(() => update('deal_tasks', task.id, { done_at: e.target.checked ? new Date().toISOString() : null }), e.target.checked ? 'Tarefa concluída.' : 'Tarefa reaberta.')} />
                <div><b>{task.title}</b><small className={late ? 'danger' : ''}>{task.due_at ? `${late ? 'Atrasada · ' : ''}${dateTime(task.due_at)}` : 'Sem prazo'} · {memberName(members, task.assigned_to)}</small></div>
                <button type="button" className="btn btn-ghost btn-icon btn-sm" disabled={busy} aria-label={`Excluir tarefa ${task.title}`} onClick={() => { if (window.confirm('Excluir esta tarefa?')) void run(() => remove('deal_tasks', task.id), 'Tarefa excluída.'); }}><Icon name="trash" size={14} /></button>
              </li>; })}</ul> : <p className="opp-empty-line">Nenhuma tarefa. Planeje o próximo contato para não perder o ritmo da negociação.</p>}
            </>}
            {tab === 'notes' && <>
              <form className="opp-composer" onSubmit={addNote}><textarea aria-label="Nova nota" placeholder="Contexto, objeções, decisores, combinados…" maxLength={12000} value={note} onChange={e => setNote(e.target.value)} rows={3} /><div><button className="btn btn-primary btn-sm" disabled={busy || !note.trim()}>Salvar nota</button></div></form>
              {notes.length ? <ul className="opp-notes">{notes.map(n => <li key={n.id}><p className="opp-note-text">{n.content}</p><div className="opp-timeline-meta">{n.author || 'Equipe'} · {dateTime(n.created_at)}<button type="button" className="text-link danger" disabled={busy} onClick={() => { if (window.confirm('Excluir esta nota?')) void run(() => remove('deal_notes', n.id), 'Nota excluída.'); }}>Excluir</button></div></li>)}</ul> : <p className="opp-empty-line">Nenhuma nota registrada.</p>}
            </>}
            {tab === 'meetings' && <>
              {contact && <div className="opp-tab-actions"><a className="btn btn-sm" href={`#meetings/new?contact=${encodeURIComponent(contact.id)}`}><Icon name="calendar" size={14} />Agendar reunião</a></div>}
              {!contact ? <p className="opp-empty-line">Vincule um contato para acompanhar reuniões.</p> : meetings.length ? <ul className="opp-list">{meetings.map(m => <li key={m.id}><Icon name="calendar" size={16} /><div><b>{m.title}</b><small>{dateTime(m.starts_at)} · {m.duration} min{m.location ? ` · ${m.location}` : ''}</small></div><span className={`badge ${m.status === 'scheduled' ? 'badge-info' : m.status === 'completed' ? 'badge-success' : 'badge-neutral'}`}>{meetingStatus[m.status]}</span></li>)}</ul> : <p className="opp-empty-line">Nenhuma reunião com este contato.</p>}
            </>}
            {tab === 'conversations' && <>
              {contact && <div className="opp-tab-actions"><a className="btn btn-sm" href={`#contacts/${encodeURIComponent(contact.id)}`}><Icon name="message" size={14} />Abrir conversa na ficha do contato</a></div>}
              {!contact ? <p className="opp-empty-line">Vincule um contato para ver as conversas.</p> : messages.length ? <ul className="opp-messages">{messages.map(m => <li key={m.id} className={m.role}><small>{m.role === 'user' ? contact.name : m.role === 'assistant' ? 'IA' : 'Equipe'} · {dateTime(m.created_at)}</small><p>{m.content}</p></li>)}</ul> : <p className="opp-empty-line">Nenhuma mensagem trocada com este contato.</p>}
            </>}
          </div>
        </section>
      </div>

      <aside className="record-side" aria-label="Detalhes da oportunidade">
        <section className="card record-card">
          <h2>Detalhes</h2>
          <form className="record-fields" onSubmit={saveFields}>
            <label><span>Valor (R$)</span><input className="form-control" inputMode="decimal" value={fields.value} onChange={e => setFields({ ...fields, value: e.target.value })} /></label>
            <label><span>Etapa</span><select className="form-control" value={deal.stage} disabled={busy} onChange={e => setStage(e.target.value as DealStage)}>{(Object.keys(stages) as DealStage[]).map(s => <option key={s} value={s}>{stages[s]}</option>)}</select></label>
            <label><span>Probabilidade</span><input className="form-control" type="number" min="0" max="100" placeholder={`${stageProbability[deal.stage]}% (etapa)`} value={fields.probability} onChange={e => setFields({ ...fields, probability: e.target.value })} /></label>
            <label><span>Previsão de fechamento</span><input className={`form-control ${isOverdue(deal) ? 'danger' : ''}`} type="date" value={fields.close_date} onChange={e => setFields({ ...fields, close_date: e.target.value })} /></label>
            <label><span>Responsável</span><select className="form-control" value={fields.assigned_to} onChange={e => setFields({ ...fields, assigned_to: e.target.value })}><option value="">Sem responsável</option>{members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
            <label className="wide"><span>Próximo passo</span><input className="form-control" maxLength={500} placeholder="O que precisa acontecer agora?" value={fields.next_step} onChange={e => setFields({ ...fields, next_step: e.target.value })} /></label>
            <label className="wide"><span>Descrição</span><textarea className="form-control" maxLength={12000} rows={3} placeholder="Escopo, dores e critérios de decisão" value={fields.description} onChange={e => setFields({ ...fields, description: e.target.value })} /></label>
            {dirty && <div className="record-fields-actions wide"><button type="button" className="btn btn-sm" disabled={busy} onClick={() => setFields(fieldState(deal))}>Descartar</button><button className="btn btn-primary btn-sm" disabled={busy}>Salvar</button></div>}
          </form>
        </section>
        <section className="card record-card">
          <h2>Contato</h2>
          {contact ? <div className="record-contact">
            <a className="record-contact-name" href={`#contacts/${encodeURIComponent(contact.id)}`}>{contact.name}</a>
            <dl>
              <div><dt>Empresa</dt><dd>{contact.company || '—'}</dd></div>
              <div><dt>Cargo</dt><dd>{contact.job_title || '—'}</dd></div>
              <div><dt>Telefone</dt><dd>{formatPhone(contact.phone, phoneFormat) || '—'}</dd></div>
              <div><dt>E-mail</dt><dd>{contact.email || '—'}</dd></div>
              <div><dt>Qualificação</dt><dd><span className="badge">{contactStatuses[contact.status]}</span> <span className="badge">Score {contact.score}</span></dd></div>
            </dl>
            {contact.ai_summary && <p className="record-ai"><Icon name="spark" size={14} />{contact.ai_summary}</p>}
          </div> : <div className="record-contact"><p className="opp-empty-line">Sem contato vinculado.</p><select className="form-control" aria-label="Vincular contato" disabled={busy || demo && !data.contacts.length} value="" onChange={e => { const id = e.target.value; if (id) void run(() => update('deals', deal.id, { contact_id: id }), 'Contato vinculado.'); }}><option value="">Vincular um contato…</option>{data.contacts.map(c => <option key={c.id} value={c.id}>{c.name}{c.company ? ` · ${c.company}` : ''}</option>)}</select></div>}
        </section>
        <section className="card record-card">
          <h2>Resumo</h2>
          <dl className="record-stats">
            <div><dt>Valor ponderado</dt><dd>{isClosed(deal) ? '—' : `${money(weighted(deal))} (${dealProbability(deal)}%)`}</dd></div>
            <div><dt>Tarefas abertas</dt><dd>{openTasks.length}</dd></div>
            <div><dt>Idade</dt><dd>{daysSince(deal.created_at)} dias</dd></div>
            <div><dt>Na etapa atual</dt><dd>{daysSince(deal.stage_changed_at ?? deal.created_at)} dias</dd></div>
            <div><dt>Atualizada</dt><dd>{dateTime(deal.updated_at ?? deal.created_at)}</dd></div>
            {deal.closed_at && <div><dt>Encerrada</dt><dd>{longDate(deal.closed_at)}</dd></div>}
          </dl>
        </section>
      </aside>
    </div>
    {editing && <DealDialog deal={deal} onClose={() => setEditing(false)} onSaved={() => setNotice('Oportunidade atualizada.')} />}
    {losing && <LostDialog deal={deal} onClose={() => setLosing(false)} onDone={() => setNotice('Oportunidade marcada como perdida.')} />}
  </div>;
}

function fieldState(deal: Deal) {
  return { value: String(deal.value ?? 0), probability: deal.probability === null || deal.probability === undefined ? '' : String(deal.probability), close_date: deal.close_date ?? '', assigned_to: deal.assigned_to ?? '', next_step: deal.next_step ?? '', description: deal.description ?? '' };
}
