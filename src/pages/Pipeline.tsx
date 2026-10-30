import { useEffect, useRef, useState, type FormEvent } from 'react';
import { stages, type Deal, type DealStage, type RowInput } from '../lib/types';
import { useWorkspace } from '../lib/workspace';
import './crm.css';

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const blankDeal = (stage: DealStage = 'new'): RowInput<'deals'> => ({ title: '', contact_id: null, value: 0, stage });
export default function Pipeline() {
  const { data, loading, create, update, remove } = useWorkspace();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Deal | null | undefined>();
  const [form, setForm] = useState(blankDeal);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (editing === undefined) return;
    const priorFocus = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) setEditing(undefined);
      if (event.key !== 'Tab') return;
      const fields = dialogRef.current?.querySelectorAll<HTMLElement>('input,select,button:not(:disabled)');
      if (!fields?.length) return;
      if (event.shiftKey && document.activeElement === fields[0]) { event.preventDefault(); fields[fields.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === fields[fields.length - 1]) { event.preventDefault(); fields[0].focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); priorFocus?.isConnected && priorFocus.focus(); };
  }, [editing, busy]);
  const contacts = new Map(data.contacts.map(c => [c.id, c]));
  const filtered = data.deals.filter(d => `${d.title} ${contacts.get(d.contact_id ?? '')?.name ?? ''} ${contacts.get(d.contact_id ?? '')?.company ?? ''}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')));
  const openDeals = data.deals.filter(d => d.stage !== 'won' && d.stage !== 'lost');
  const won = data.deals.filter(d => d.stage === 'won');
  const lost = data.deals.filter(d => d.stage === 'lost');
  const total = openDeals.reduce((sum, deal) => sum + deal.value, 0);
  const open = (deal: Deal | null, stage: DealStage = 'new') => { setEditing(deal); setForm(deal ? { title: deal.title, contact_id: deal.contact_id, value: deal.value, stage: deal.stage } : blankDeal(stage)); setError(''); setSuccess(''); };
  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const input = { ...form, title: form.title.trim() };
      if (!input.title) throw new Error('Informe o título da oportunidade.');
      if (!Number.isFinite(input.value) || input.value < 0) throw new Error('Informe um valor válido, maior ou igual a zero.');
      if (editing) await update('deals', editing.id, input); else await create('deals', input);
      setEditing(undefined); setSuccess(editing ? 'Oportunidade atualizada.' : 'Oportunidade criada.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a oportunidade.'); } finally { setBusy(false); }
  };
  const move = async (deal: Deal, stage: DealStage) => {
    if (deal.stage === stage || busy) return;
    setBusy(true); setError(''); setSuccess('');
    try { await update('deals', deal.id, { stage }); setSuccess(`Oportunidade movida para ${stages[stage]}.`); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível mover a oportunidade.'); } finally { setBusy(false); }
  };
  const deleteDeal = async (deal: Deal) => {
    if (!window.confirm(`Excluir a oportunidade “${deal.title}”?`)) return;
    setBusy(true); setError(''); setSuccess('');
    try { await remove('deals', deal.id); setSuccess('Oportunidade excluída.'); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível excluir a oportunidade.'); } finally { setBusy(false); }
  };
  return <div className="content pipeline-content"><div className="page-header"><div><h1 className="page-title">Pipeline de vendas</h1><p className="page-description">Acompanhe oportunidades desde o primeiro contato até o fechamento.</p></div><div className="page-actions"><button className="btn btn-primary" onClick={() => open(null)}>+ Nova oportunidade</button></div></div>
    <div className="crm-summary"><div className="card"><span>Pipeline aberto</span><b>{money(total)}</b><small>{openDeals.length} oportunidades</small></div><div className="card"><span>Ticket médio aberto</span><b>{money(openDeals.length ? total / openDeals.length : 0)}</b><small>Média das oportunidades abertas</small></div><div className="card"><span>Receita ganha</span><b>{money(won.reduce((sum, d) => sum + d.value, 0))}</b><small>{won.length} negócios ganhos</small></div><div className="card"><span>Taxa de ganho</span><b>{won.length + lost.length ? `${Math.round(won.length / (won.length + lost.length) * 100)}%` : '—'}</b><small>{won.length + lost.length ? 'Sobre negócios encerrados' : 'Ainda não há negócios encerrados'}</small></div></div>
    <div className="crm-toolbar"><div className="search-box"><input aria-label="Buscar oportunidade" placeholder="Buscar por oportunidade, contato ou empresa..." value={query} onChange={e => setQuery(e.target.value)} /></div><span className="crm-note">Mova as oportunidades escolhendo a etapa em cada cartão.</span></div>
    {error && editing === undefined && <div className="crm-error" role="alert">{error}</div>}{success && <div className="crm-success" role="status">{success}</div>}
    {loading ? <div className="crm-loading" role="status">Carregando oportunidades...</div> : <div className="kanban">{(Object.entries(stages) as [DealStage, string][]).map(([stage, label], index) => {
      const deals = filtered.filter(d => d.stage === stage);
      return <section className="kanban-column" key={stage} aria-label={label}><div className="kanban-head"><div><span className={`stage-dot s${index}`} /><b>{label}</b><span className="badge">{deals.length}</span></div><span>{money(deals.reduce((sum, d) => sum + d.value, 0))}</span></div><div className="kanban-body crm-kanban-body">{deals.map(deal => { const contact = contacts.get(deal.contact_id ?? ''); return <article className="deal-card crm-deal-card" key={deal.id}><b>{deal.title}</b><span>{contact ? `${contact.name}${contact.company ? ` · ${contact.company}` : ''}` : 'Sem contato vinculado'}</span><div className="deal-value">{money(deal.value)}</div>{contact && <span className="badge">Score {contact.score}</span>}<select className="crm-stage-select" value={deal.stage} disabled={busy} aria-label={`Etapa de ${deal.title}`} onChange={e => void move(deal, e.target.value as DealStage)}>{Object.entries(stages).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select><div className="crm-actions"><button className="btn btn-ghost" disabled={busy} onClick={() => open(deal)} aria-label={`Editar ${deal.title}`}>Editar</button><button className="btn btn-ghost crm-danger" disabled={busy} onClick={() => void deleteDeal(deal)} aria-label={`Excluir ${deal.title}`}>Excluir</button></div></article>; })}{!deals.length && <p className="crm-kanban-empty">Nenhuma oportunidade nesta etapa.</p>}<button className="add-deal" onClick={() => open(null, stage)}>+ Adicionar oportunidade</button></div></section>;
    })}</div>}
    {editing !== undefined && <div className="modal-overlay"><div ref={dialogRef} className="modal crm-modal" role="dialog" aria-modal="true" aria-labelledby="deal-dialog-title"><form onSubmit={e => void save(e)}><div className="modal-head"><div><h2 className="page-title" id="deal-dialog-title">{editing ? 'Editar oportunidade' : 'Nova oportunidade'}</h2><span>Organize o valor e a próxima etapa comercial.</span></div><button type="button" className="btn btn-ghost" onClick={() => setEditing(undefined)} disabled={busy} aria-label="Fechar formulário">✕</button></div><div className="modal-body"><label><span>Título *</span><input required maxLength={200} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Implantação SDR · Empresa" /></label><label><span>Contato</span><select value={form.contact_id ?? ''} onChange={e => setForm({ ...form, contact_id: e.target.value || null })}><option value="">Sem contato vinculado</option>{data.contacts.map(c => <option key={c.id} value={c.id}>{c.name}{c.company ? ` · ${c.company}` : ''}</option>)}</select></label><div className="form-grid"><label><span>Valor (R$) *</span><input required type="number" min="0" max="999999999" step="0.01" value={form.value} onChange={e => setForm({ ...form, value: e.target.valueAsNumber })} /></label><label><span>Etapa</span><select value={form.stage} onChange={e => setForm({ ...form, stage: e.target.value as DealStage })}>{Object.entries(stages).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>{error && <div className="crm-error" role="alert">{error}</div>}</div><div className="modal-footer"><button className="btn" type="button" onClick={() => setEditing(undefined)} disabled={busy}>Cancelar</button><button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Salvando...' : 'Salvar oportunidade'}</button></div></form></div></div>}
  </div>;
}
