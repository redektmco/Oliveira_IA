import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { dealProbability, lostReasons, stages, type Deal, type DealStage, type RowInput } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { usePanelData } from '../../settings/shared';

export const TZ = 'America/Sao_Paulo';
export const money = (value: number, cents = false) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: cents ? 2 : 0, minimumFractionDigits: cents ? 2 : 0 });
export const todayKey = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
export const shortDate = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: TZ }).replace('.', '');
export const longDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: TZ }).replace('.', '');
export const dateTime = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ }).replace('.', '');
export const daysSince = (iso?: string | null) => iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)) : 0;
export const initials = (name: string) => name.split(/[\s@.]+/).filter(Boolean).map(part => part[0]).slice(0, 2).join('').toLocaleUpperCase('pt-BR') || '?';
export const isClosed = (deal: Pick<Deal, 'stage'>) => deal.stage === 'won' || deal.stage === 'lost';
export const isOverdue = (deal: Pick<Deal, 'stage' | 'close_date'>) => !isClosed(deal) && Boolean(deal.close_date) && deal.close_date! < todayKey();
export const weighted = (deal: Deal) => deal.value * dealProbability(deal) / 100;
export const stageOrder = Object.keys(stages) as DealStage[];
export const stageTone: Record<DealStage, string> = { new: 'gray', qualifying: 'blue', qualified: 'violet', meeting: 'amber', proposal: 'teal', won: 'green', lost: 'red' };

export type MemberOption = { id: string; name: string };
/** Active workspace members that can own opportunities and tasks. */
export function useMembers() {
  const { api, userId } = useWorkspace();
  const { data } = usePanelData<{ members: { user_id: string | null; name?: string; email?: string; status: string }[] }>(() => api('contact.context'), [api]);
  return useMemo(() => {
    const list: MemberOption[] = (data?.members || []).filter(m => m.user_id && m.status === 'active').map(m => ({ id: m.user_id!, name: m.name?.trim() || m.email || 'Membro da equipe' }));
    if (!list.some(m => m.id === userId)) list.unshift({ id: userId, name: 'Você' });
    return list;
  }, [data, userId]);
}
export function memberName(members: MemberOption[], id: string | null | undefined, empty = 'Sem responsável') {
  if (!id) return empty;
  return members.find(m => m.id === id)?.name ?? 'Membro removido';
}
export function OwnerAvatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  return <span className={`opp-avatar ${size}`} title={name} aria-hidden="true">{initials(name)}</span>;
}
export function StagePill({ stage }: { stage: DealStage }) {
  return <span className={`opp-pill tone-${stageTone[stage]}`}><i />{stages[stage]}</span>;
}

/** Focus trap and Escape for lightweight dialogs. */
function useDialog(onClose: () => void, busy: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input,select,textarea')?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) close.current();
      if (event.key !== 'Tab') return;
      const nodes = ref.current?.querySelectorAll<HTMLElement>('input:not(:disabled),select:not(:disabled),textarea:not(:disabled),button:not(:disabled)');
      if (!nodes?.length) return;
      if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes[nodes.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === nodes[nodes.length - 1]) { event.preventDefault(); nodes[0].focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); if (previous?.isConnected) previous.focus(); };
  }, [busy]);
  return ref;
}
export function Modal({ title, subtitle, children, footer, onClose, onSubmit, busy = false }: { title: string; subtitle?: string; children: ReactNode; footer: ReactNode; onClose: () => void; onSubmit: (event: FormEvent) => void; busy?: boolean }) {
  const ref = useDialog(onClose, busy);
  return <div className="modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div ref={ref} className="modal crm-modal" role="dialog" aria-modal="true" aria-label={title}>
      <form onSubmit={onSubmit}>
        <div className="modal-head"><div><h2>{title}</h2>{subtitle && <span>{subtitle}</span>}</div><button type="button" className="btn btn-ghost btn-icon" onClick={onClose} disabled={busy} aria-label="Fechar">✕</button></div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">{footer}</div>
      </form>
    </div>
  </div>;
}

const blank = (stage: DealStage = 'new', contactId: string | null = null, owner: string | null = null): RowInput<'deals'> => ({ title: '', contact_id: contactId, value: 0, stage, assigned_to: owner, close_date: null, probability: null, next_step: '', lost_reason: '', description: '' });
/** Create or edit the main opportunity fields. */
export function DealDialog({ deal, stage, contactId, onClose, onSaved }: { deal: Deal | null; stage?: DealStage; contactId?: string | null; onClose: () => void; onSaved?: (deal: Deal) => void }) {
  const { data, create, update, userId } = useWorkspace();
  const members = useMembers();
  const [form, setForm] = useState<RowInput<'deals'>>(() => deal ? { title: deal.title, contact_id: deal.contact_id, value: deal.value, stage: deal.stage, assigned_to: deal.assigned_to ?? null, close_date: deal.close_date ?? null, probability: deal.probability ?? null, next_step: deal.next_step ?? '', lost_reason: deal.lost_reason ?? '', description: deal.description ?? '' } : blank(stage, contactId ?? null, userId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof RowInput<'deals'>>(key: K, value: RowInput<'deals'>[K]) => setForm(current => ({ ...current, [key]: value }));
  const contactChanged = (id: string | null) => setForm(current => {
    const contact = data.contacts.find(c => c.id === id);
    return { ...current, contact_id: id, title: current.title || (contact ? [contact.company || contact.name, 'Oportunidade'].join(' · ') : '') };
  });
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const input = { ...form, title: form.title.trim(), next_step: (form.next_step ?? '').trim() };
      if (!input.title) throw new Error('Informe o nome da oportunidade.');
      if (!Number.isFinite(input.value) || input.value < 0) throw new Error('Informe um valor maior ou igual a zero.');
      if (input.probability !== null && input.probability !== undefined && (!Number.isInteger(input.probability) || input.probability < 0 || input.probability > 100)) throw new Error('A probabilidade deve ficar entre 0 e 100%.');
      if (input.stage === 'lost' && !input.lost_reason) throw new Error('Informe o motivo da perda.');
      let saved: Deal;
      if (deal) { await update('deals', deal.id, input); saved = { ...deal, ...input }; } else saved = await create('deals', input);
      onSaved?.(saved); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a oportunidade.'); } finally { setBusy(false); }
  };
  return <Modal title={deal ? 'Editar oportunidade' : 'Nova oportunidade'} subtitle="Valor, etapa, previsão e responsável." onClose={onClose} onSubmit={e => void submit(e)} busy={busy}
    footer={<><button type="button" className="btn" onClick={onClose} disabled={busy}>Cancelar</button><button className="btn btn-primary" disabled={busy}>{busy ? 'Salvando…' : deal ? 'Salvar alterações' : 'Criar oportunidade'}</button></>}>
    <label><span>Contato</span><select value={form.contact_id ?? ''} onChange={e => contactChanged(e.target.value || null)}><option value="">Sem contato vinculado</option>{data.contacts.map(c => <option key={c.id} value={c.id}>{c.name}{c.company ? ` · ${c.company}` : ''}</option>)}</select></label>
    <label><span>Nome da oportunidade *</span><input required maxLength={200} value={form.title} onChange={e => set('title', e.target.value)} placeholder="Ex.: Implantação SDR IA · Empresa" /></label>
    <div className="form-grid">
      <label><span>Valor (R$) *</span><input required type="number" min="0" max="999999999" step="0.01" value={Number.isFinite(form.value) ? form.value : ''} onChange={e => set('value', e.target.valueAsNumber)} /></label>
      <label><span>Etapa</span><select value={form.stage} onChange={e => set('stage', e.target.value as DealStage)}>{stageOrder.map(value => <option key={value} value={value}>{stages[value]}</option>)}</select></label>
      <label><span>Previsão de fechamento</span><input type="date" value={form.close_date ?? ''} onChange={e => set('close_date', e.target.value || null)} /></label>
      <label><span>Probabilidade (%)</span><input type="number" min="0" max="100" step="1" placeholder={`${dealProbability({ stage: form.stage, probability: null })}% pela etapa`} value={form.probability ?? ''} onChange={e => set('probability', e.target.value === '' ? null : e.target.valueAsNumber)} /></label>
    </div>
    <label><span>Responsável</span><select value={form.assigned_to ?? ''} onChange={e => set('assigned_to', e.target.value || null)}><option value="">Sem responsável</option>{members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
    {form.stage === 'lost' && <label><span>Motivo da perda *</span><select value={form.lost_reason ?? ''} onChange={e => set('lost_reason', e.target.value)}><option value="">Selecione</option>{lostReasons.map(r => <option key={r}>{r}</option>)}</select></label>}
    <label><span>Próximo passo</span><input maxLength={500} value={form.next_step ?? ''} onChange={e => set('next_step', e.target.value)} placeholder="Ex.: Apresentar proposta para o diretor" /></label>
    {error && <div className="crm-error" role="alert">{error}</div>}
  </Modal>;
}

/** Asks for the reason before marking an opportunity as lost (required for loss analysis). */
export function LostDialog({ deal, onClose, onDone }: { deal: Deal; onClose: () => void; onDone?: () => void }) {
  const { update } = useWorkspace();
  const [reason, setReason] = useState(lostReasons[0]);
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const text = reason === 'Outro' ? detail.trim() : [reason, detail.trim()].filter(Boolean).join(' — ');
      if (!text) throw new Error('Descreva o motivo da perda.');
      await update('deals', deal.id, { stage: 'lost', lost_reason: text.slice(0, 500) });
      onDone?.(); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar a oportunidade.'); } finally { setBusy(false); }
  };
  return <Modal title="Marcar como perdida" subtitle={deal.title} onClose={onClose} onSubmit={e => void submit(e)} busy={busy}
    footer={<><button type="button" className="btn" onClick={onClose} disabled={busy}>Cancelar</button><button className="btn btn-danger-solid" disabled={busy}>{busy ? 'Salvando…' : 'Marcar como perdida'}</button></>}>
    <label><span>Motivo *</span><select value={reason} onChange={e => setReason(e.target.value)}>{lostReasons.map(r => <option key={r}>{r}</option>)}</select></label>
    <label><span>{reason === 'Outro' ? 'Descreva o motivo *' : 'Detalhes (opcional)'}</span><textarea maxLength={400} rows={3} value={detail} onChange={e => setDetail(e.target.value)} placeholder="O que aprendemos com esta negociação?" /></label>
    {error && <div className="crm-error" role="alert">{error}</div>}
  </Modal>;
}

export function dealsCsv(deals: Deal[], contactName: (id: string | null) => string, owner: (id: string | null | undefined) => string) {
  const cell = (value: unknown) => { let text = String(value ?? ''); if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`; return `"${text.replace(/"/g, '""')}"`; };
  const rows = [['Oportunidade', 'Contato', 'Valor', 'Etapa', 'Probabilidade', 'Previsão de fechamento', 'Responsável', 'Próximo passo', 'Motivo da perda', 'Criada em'],
    ...deals.map(d => [d.title, contactName(d.contact_id), d.value.toFixed(2).replace('.', ','), stages[d.stage], `${dealProbability(d)}%`, d.close_date ?? '', owner(d.assigned_to), d.next_step ?? '', d.lost_reason ?? '', d.created_at.slice(0, 10)])];
  return '﻿' + rows.map(row => row.map(cell).join(';')).join('\r\n');
}
