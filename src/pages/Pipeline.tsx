import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../components/ui';
import { dealProbability, stages, type Deal, type DealStage } from '../lib/types';
import { useWorkspace } from '../lib/workspace';
import DealProfile from './DealProfile';
import { DealDialog, LostDialog, OwnerAvatar, StagePill, daysSince, dealsCsv, isClosed, isOverdue, memberName, money, shortDate, stageOrder, stageTone, todayKey, useMembers, weighted } from './opportunities/shared';
import './crm.css';
import './pipeline.css';

type View = 'board' | 'table';
type Sort = 'recent' | 'value' | 'close' | 'title' | 'stage' | 'probability' | 'owner' | 'updated';
const viewKey = 'oliveira-pipeline-view';

export default function Pipeline() {
  const { data, loading, update, userId } = useWorkspace();
  const members = useMembers();
  const [selectedId, setSelectedId] = useState(() => decodeURIComponent(window.location.hash.split('/')[1] || ''));
  useEffect(() => { const change = () => setSelectedId(decodeURIComponent(window.location.hash.split('/')[1] || '')); window.addEventListener('hashchange', change); return () => window.removeEventListener('hashchange', change); }, []);
  const [view, setView] = useState<View>(() => { try { return localStorage.getItem(viewKey) === 'table' ? 'table' : 'board'; } catch { return 'board'; } });
  const [query, setQuery] = useState('');
  const [owner, setOwner] = useState('all');
  const [status, setStatus] = useState<'all' | 'open' | 'won' | 'lost' | 'late'>('all');
  const [sort, setSort] = useState<{ key: Sort; asc: boolean }>({ key: 'recent', asc: false });
  const [dialog, setDialog] = useState<{ deal: Deal | null; stage?: DealStage } | null>(null);
  const [losing, setLosing] = useState<Deal | null>(null);
  const [dragging, setDragging] = useState('');
  const [over, setOver] = useState<DealStage | ''>('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => { try { localStorage.setItem(viewKey, view); } catch { /* optional preference */ } }, [view]);

  const contacts = useMemo(() => new Map(data.contacts.map(c => [c.id, c])), [data.contacts]);
  const openTasks = useMemo(() => {
    const map = new Map<string, { count: number; overdue: number; next?: string }>();
    const now = new Date().toISOString();
    for (const task of data.deal_tasks) {
      if (task.done_at) continue;
      const entry = map.get(task.deal_id) ?? { count: 0, overdue: 0 };
      entry.count++; if (task.due_at && task.due_at < now) entry.overdue++;
      if (task.due_at && (!entry.next || task.due_at < entry.next)) entry.next = task.due_at;
      map.set(task.deal_id, entry);
    }
    return map;
  }, [data.deal_tasks]);
  const selected = data.deals.find(d => d.id === selectedId);
  if (selected) return <DealProfile key={selected.id} deal={selected} />;

  const ownerOf = (id: string | null | undefined) => memberName(members, id);
  const contactLabel = (deal: Deal) => { const c = contacts.get(deal.contact_id ?? ''); return c ? [c.name, c.company].filter(Boolean).join(' · ') : 'Sem contato'; };
  const norm = (value: string) => value.toLocaleLowerCase('pt-BR');
  const filtered = data.deals.filter(deal => {
    if (query && !norm(`${deal.title} ${contactLabel(deal)} ${deal.next_step ?? ''}`).includes(norm(query))) return false;
    if (owner === 'mine' && deal.assigned_to !== userId) return false;
    if (owner === 'none' && deal.assigned_to) return false;
    if (!['all', 'mine', 'none'].includes(owner) && deal.assigned_to !== owner) return false;
    if ((status === 'open' || status === 'late') && isClosed(deal)) return false;
    if (status === 'late' && !isOverdue(deal) && !(openTasks.get(deal.id)?.overdue)) return false;
    if ((status === 'won' || status === 'lost') && deal.stage !== status) return false;
    return true;
  });
  const compare = (a: Deal, b: Deal) => {
    const by: Record<Sort, (d: Deal) => string | number> = { recent: d => d.created_at, updated: d => d.updated_at ?? d.created_at, value: d => d.value, close: d => d.close_date ?? '9999', title: d => norm(d.title), stage: d => stageOrder.indexOf(d.stage), probability: d => dealProbability(d), owner: d => norm(ownerOf(d.assigned_to)) };
    const x = by[sort.key](a), y = by[sort.key](b);
    return (x < y ? -1 : x > y ? 1 : 0) * (sort.asc ? 1 : -1);
  };
  const sorted = filtered.slice().sort(compare);

  const open = data.deals.filter(d => !isClosed(d));
  const month = todayKey().slice(0, 7);
  const wonMonth = data.deals.filter(d => d.stage === 'won' && (d.closed_at ?? d.updated_at ?? d.created_at).slice(0, 7) === month);
  const won = data.deals.filter(d => d.stage === 'won').length, lost = data.deals.filter(d => d.stage === 'lost').length;
  const overdueDeals = open.filter(d => isOverdue(d) || (openTasks.get(d.id)?.overdue ?? 0) > 0).length;

  const move = async (deal: Deal, stage: DealStage) => {
    if (deal.stage === stage) return;
    if (stage === 'lost') { setLosing(deal); return; }
    setError(''); setNotice('');
    try { await update('deals', deal.id, { stage }); setNotice(`“${deal.title}” movida para ${stages[stage]}.`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível mover a oportunidade.'); }
  };
  const openDeal = (deal: Deal) => { window.location.hash = `pipeline/${encodeURIComponent(deal.id)}`; };
  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([dealsCsv(sorted, id => contacts.get(id ?? '')?.name ?? '', ownerOf)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `oportunidades-${todayKey()}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const header = (key: Sort, label: string, align: 'left' | 'right' = 'left') => <th className={align === 'right' ? 'num' : ''} aria-sort={sort.key === key ? (sort.asc ? 'ascending' : 'descending') : 'none'}><button type="button" onClick={() => setSort(current => ({ key, asc: current.key === key ? !current.asc : key === 'title' || key === 'close' || key === 'owner' }))}>{label}{sort.key === key && <span aria-hidden="true">{sort.asc ? '↑' : '↓'}</span>}</button></th>;

  const card = (deal: Deal) => {
    const tasks = openTasks.get(deal.id); const ownerName = ownerOf(deal.assigned_to); const overdue = isOverdue(deal);
    return <article key={deal.id} className={`opp-card ${dragging === deal.id ? 'dragging' : ''}`} draggable tabIndex={0} aria-label={`${deal.title}, ${money(deal.value)}. Abrir ficha`}
      onDragStart={event => { event.dataTransfer.setData('text/plain', deal.id); event.dataTransfer.effectAllowed = 'move'; setDragging(deal.id); }}
      onDragEnd={() => { setDragging(''); setOver(''); }}
      onClick={() => openDeal(deal)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openDeal(deal); } }}>
      <div className="opp-card-title">{deal.title}</div>
      <div className="opp-card-sub">{contactLabel(deal)}</div>
      <div className="opp-card-value">{money(deal.value)}{!isClosed(deal) && <small>{dealProbability(deal)}%</small>}</div>
      {deal.stage === 'lost' && deal.lost_reason && <div className="opp-card-reason">{deal.lost_reason}</div>}
      <div className="opp-card-foot">
        {deal.close_date && <span className={`opp-meta ${overdue ? 'danger' : ''}`} title="Previsão de fechamento"><Icon name="calendar" size={13} />{shortDate(deal.close_date)}</span>}
        {tasks && <span className={`opp-meta ${tasks.overdue ? 'danger' : ''}`} title={tasks.overdue ? `${tasks.overdue} tarefa(s) atrasada(s)` : 'Tarefas abertas'}><Icon name="check" size={13} />{tasks.count}</span>}
        {!isClosed(deal) && <span className="opp-meta" title="Dias nesta etapa"><Icon name="clock" size={13} />{daysSince(deal.stage_changed_at ?? deal.created_at)}d</span>}
        <span className="opp-card-owner"><OwnerAvatar name={ownerName} size="sm" /></span>
      </div>
    </article>;
  };

  return <div className="content opp-page">
    <div className="page-header"><div><h1 className="page-title">Oportunidades</h1><p className="page-description">Acompanhe cada negociação do primeiro contato ao fechamento.</p></div>
      <div className="page-actions"><button className="btn" onClick={exportCsv} disabled={!sorted.length}><Icon name="download" size={16} />Exportar CSV</button><button className="btn btn-primary" onClick={() => setDialog({ deal: null })}><Icon name="plus" size={16} />Nova oportunidade</button></div></div>

    <div className="opp-kpis">
      <div className="card"><span>Pipeline aberto</span><b>{money(open.reduce((s, d) => s + d.value, 0))}</b><small>{open.length} {open.length === 1 ? 'oportunidade' : 'oportunidades'} em andamento</small></div>
      <div className="card"><span>Previsão ponderada</span><b>{money(open.reduce((s, d) => s + weighted(d), 0))}</b><small>Valor × probabilidade de cada etapa</small></div>
      <div className="card"><span>Ganho no mês</span><b>{money(wonMonth.reduce((s, d) => s + d.value, 0))}</b><small>{wonMonth.length} {wonMonth.length === 1 ? 'negócio fechado' : 'negócios fechados'}</small></div>
      <div className="card"><span>Taxa de ganho</span><b>{won + lost ? `${Math.round(won / (won + lost) * 100)}%` : '—'}</b><small>{won + lost ? `${won} ganhas · ${lost} perdidas` : 'Sem negócios encerrados'}</small></div>
    </div>

    <div className="opp-toolbar">
      <div className="opp-views" role="group" aria-label="Visualização">
        <button type="button" aria-pressed={view === 'board'} className={view === 'board' ? 'active' : ''} onClick={() => setView('board')}><Icon name="pipeline" size={15} />Kanban</button>
        <button type="button" aria-pressed={view === 'table'} className={view === 'table' ? 'active' : ''} onClick={() => setView('table')}><Icon name="grid" size={15} />Tabela</button>
      </div>
      <label className="opp-search"><Icon name="search" size={15} /><input aria-label="Buscar oportunidades" placeholder="Buscar oportunidade, contato ou empresa…" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <label className="opp-filter"><span className="sr-only">Responsável</span><select aria-label="Filtrar por responsável" value={owner} onChange={e => setOwner(e.target.value)}><option value="all">Todos os responsáveis</option><option value="mine">Minhas oportunidades</option><option value="none">Sem responsável</option>{members.filter(m => m.id !== userId).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
      <label className="opp-filter"><span className="sr-only">Status</span><select aria-label="Filtrar por status" value={status} onChange={e => setStatus(e.target.value as typeof status)}><option value="all">Todas</option><option value="open">Em aberto</option><option value="late">Com atraso{overdueDeals ? ` (${overdueDeals})` : ''}</option><option value="won">Ganhas</option><option value="lost">Perdidas</option></select></label>
      {view === 'board' && <label className="opp-filter"><span className="sr-only">Ordenar</span><select aria-label="Ordenar cartões" value={sort.key} onChange={e => setSort({ key: e.target.value as Sort, asc: e.target.value === 'close' })}><option value="recent">Mais recentes</option><option value="value">Maior valor</option><option value="close">Fechamento mais próximo</option><option value="updated">Atualizadas recentemente</option></select></label>}
    </div>
    {error && <div className="crm-error" role="alert">{error}</div>}
    {notice && <div className="crm-success" role="status">{notice}</div>}

    {loading && !data.deals.length ? <div className="crm-loading" role="status">Carregando oportunidades…</div>
      : !data.deals.length ? <div className="card opp-empty"><Icon name="pipeline" size={28} /><b>Seu pipeline começa aqui</b><p>Crie a primeira oportunidade ou deixe a IA criar automaticamente quando um lead chegar pelos canais.</p><button className="btn btn-primary" onClick={() => setDialog({ deal: null })}>Criar oportunidade</button></div>
      : view === 'board' ? <div className="opp-board" aria-label="Kanban de oportunidades">
        {stageOrder.filter(stage => status === 'all' || (status === 'open' || status === 'late' ? !['won', 'lost'].includes(stage) : stage === status)).map(stage => {
          const deals = sorted.filter(d => d.stage === stage);
          return <section key={stage} className={`opp-column ${over === stage ? 'over' : ''}`} aria-label={stages[stage]}
            onDragOver={event => { if (!dragging) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setOver(stage); }}
            onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOver(''); }}
            onDrop={event => { event.preventDefault(); const deal = data.deals.find(d => d.id === event.dataTransfer.getData('text/plain')); setOver(''); setDragging(''); if (deal) void move(deal, stage); }}>
            <header className="opp-column-head"><span className={`opp-dot tone-${stageTone[stage]}`} /><b>{stages[stage]}</b><span className="opp-count">{deals.length}</span><span className="opp-sum">{money(deals.reduce((s, d) => s + d.value, 0))}</span><button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label={`Nova oportunidade em ${stages[stage]}`} onClick={() => setDialog({ deal: null, stage })}><Icon name="plus" size={15} /></button></header>
            <div className="opp-column-body">{deals.map(card)}{!deals.length && <p className="opp-column-empty">{dragging ? 'Solte aqui' : 'Nenhuma oportunidade'}</p>}</div>
          </section>;
        })}
      </div>
      : <div className="card opp-table-wrap"><table className="ds-table opp-table"><thead><tr>{header('title', 'Oportunidade')}{header('value', 'Valor', 'right')}{header('stage', 'Etapa')}{header('probability', 'Prob.', 'right')}{header('close', 'Fechamento')}<th>Contato</th>{header('owner', 'Responsável')}<th>Próxima tarefa</th>{header('updated', 'Atualizada')}</tr></thead>
        <tbody>{sorted.map(deal => { const tasks = openTasks.get(deal.id); const ownerName = ownerOf(deal.assigned_to); return <tr key={deal.id} onClick={() => openDeal(deal)}>
          <td><a className="opp-link" href={`#pipeline/${encodeURIComponent(deal.id)}`} onClick={e => e.stopPropagation()}>{deal.title}</a></td>
          <td className="num">{money(deal.value)}</td>
          <td><StagePill stage={deal.stage} /></td>
          <td className="num">{isClosed(deal) ? '—' : `${dealProbability(deal)}%`}</td>
          <td className={isOverdue(deal) ? 'danger' : ''}>{deal.close_date ? shortDate(deal.close_date) : '—'}</td>
          <td className="muted-cell">{contactLabel(deal)}</td>
          <td><span className="opp-owner-cell"><OwnerAvatar name={ownerName} size="sm" />{ownerName}</span></td>
          <td className={tasks?.overdue ? 'danger' : 'muted-cell'}>{tasks ? `${tasks.count} aberta${tasks.count > 1 ? 's' : ''}${tasks.next ? ` · ${new Date(tasks.next).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'America/Sao_Paulo' }).replace('.', '')}` : ''}` : '—'}</td>
          <td className="muted-cell">{daysSince(deal.updated_at ?? deal.created_at) === 0 ? 'Hoje' : `há ${daysSince(deal.updated_at ?? deal.created_at)}d`}</td>
        </tr>; })}</tbody></table>
        {!sorted.length && <p className="opp-column-empty">Nenhuma oportunidade com estes filtros.</p>}
        <div className="opp-table-foot"><span>{sorted.length} de {data.deals.length} oportunidades</span><b>{money(sorted.reduce((s, d) => s + d.value, 0))}</b></div>
      </div>}
    {dialog && <DealDialog deal={dialog.deal} stage={dialog.stage} onClose={() => setDialog(null)} onSaved={deal => setNotice(dialog.deal ? 'Oportunidade atualizada.' : `Oportunidade “${deal.title}” criada.`)} />}
    {losing && <LostDialog deal={losing} onClose={() => setLosing(null)} onDone={() => setNotice(`“${losing.title}” marcada como perdida.`)} />}
  </div>;
}
