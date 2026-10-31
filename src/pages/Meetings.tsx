import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Meeting, RowInput } from '../lib/types';
import { useWorkspace } from '../lib/workspace';
import './crm.css';

const labels: Record<Meeting['status'], string> = { scheduled: 'Agendada', completed: 'Realizada', cancelled: 'Cancelada' };
const localDateValue = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,16);
const tomorrow = () => { const date = new Date(); date.setDate(date.getDate() + 1); date.setHours(14,0,0,0); return date; };
const blankMeeting = (): RowInput<'meetings'> => ({ title: '', contact_id: null, starts_at: tomorrow().toISOString(), duration: 30, location: '', status: 'scheduled' });
export function meetingIcs(meeting: Meeting): string {
  const escape = (text: string) => text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const timestamp = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const start = new Date(meeting.starts_at);
  const end = new Date(start.getTime() + meeting.duration * 60000);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Oliveira IA//Reunioes//PT-BR', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT', `UID:${escape(meeting.id)}@oliveira-ia`, `DTSTAMP:${timestamp(new Date(meeting.created_at))}`, `DTSTART:${timestamp(start)}`, `DTEND:${timestamp(end)}`, `SUMMARY:${escape(meeting.title)}`, `LOCATION:${escape(meeting.location)}`, `STATUS:${meeting.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`, 'END:VEVENT', 'END:VCALENDAR'];
  // RFC 5545: fold long lines without cutting a multibyte UTF-8 character.
  const fold = (line: string) => { const chunks: string[] = []; let current = ''; let length = 0; for (const char of line) { const bytes = new TextEncoder().encode(char).length; if (length + bytes > 75) { chunks.push(current); current = ' '; length = 1; } current += char; length += bytes; } chunks.push(current); return chunks.join('\r\n'); };
  return lines.map(fold).join('\r\n') + '\r\n';
}
function downloadMeeting(meeting: Meeting) {
  const url = URL.createObjectURL(new Blob([meetingIcs(meeting)], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'reuniao.ics'; link.click(); URL.revokeObjectURL(url);
}

export default function Meetings({ contactId, startOpen = false, onOpened }: { contactId?: string; startOpen?: boolean; onOpened?: () => void } = {}) {
  const { data, loading, create, update, remove } = useWorkspace();
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState<Meeting | null | undefined>();
  const [form, setForm] = useState(() => ({ ...blankMeeting(), contact_id: contactId ?? null }));
  const [dateValue, setDateValue] = useState(() => localDateValue(tomorrow()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (editing === undefined) return;
    const previous = document.activeElement as HTMLElement | null;
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
    return () => { document.removeEventListener('keydown', key); previous?.isConnected && previous.focus(); };
  }, [editing, busy]);
  const open = (meeting: Meeting | null) => {
    setEditing(meeting); setForm(meeting ? { title: meeting.title, contact_id: meeting.contact_id, starts_at: meeting.starts_at, duration: meeting.duration, location: meeting.location, status: meeting.status } : { ...blankMeeting(), contact_id: contactId ?? null });
    setDateValue(localDateValue(meeting ? new Date(meeting.starts_at) : tomorrow())); setError(''); setSuccess('');
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const date = new Date(dateValue);
      if (!Number.isFinite(date.getTime())) throw new Error('Informe uma data e um horário válidos.');
      if (form.status === 'scheduled' && date.getTime() <= Date.now()) throw new Error('Para agendar, escolha uma data e um horário no futuro. Para registrar histórico, selecione “Realizada” ou “Cancelada”.');
      if (!Number.isInteger(form.duration) || form.duration < 5 || form.duration > 480) throw new Error('A duração deve estar entre 5 e 480 minutos.');
      const input = { ...form, title: form.title.trim(), location: form.location.trim(), starts_at: date.toISOString() };
      if (!input.title) throw new Error('Informe o título da reunião.');
      if (editing) await update('meetings', editing.id, input); else await create('meetings', input);
      setEditing(undefined); setSuccess(editing ? 'Reunião atualizada.' : 'Reunião agendada. Baixe o arquivo de calendário para adicionar à sua agenda.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a reunião.'); } finally { setBusy(false); }
  };
  const deleteMeeting = async (meeting: Meeting) => {
    if (!window.confirm(`Excluir a reunião “${meeting.title}”? Isso não remove eventos já importados em agendas externas.`)) return;
    setBusy(true); setError(''); setSuccess('');
    try { await remove('meetings', meeting.id); setSuccess('Reunião excluída da plataforma.'); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível excluir a reunião.'); } finally { setBusy(false); }
  };
  useEffect(() => { if (startOpen) { open(null); onOpened?.(); } }, [startOpen]);
  const contacts = new Map(data.contacts.map(c => [c.id, c]));
  const meetings = data.meetings.filter(m => !contactId || m.contact_id === contactId).filter(m => filter === 'all' || m.status === filter).slice().sort((a,b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  const future = data.meetings.filter(m => !contactId || m.contact_id === contactId).filter(m => m.status === 'scheduled' && new Date(m.starts_at).getTime() > Date.now());
  const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return <div className="content"><div className="page-header"><div><h1 className="page-title">Reuniões</h1><p className="page-description">Organize as conversas comerciais e registre os resultados.</p></div><div className="page-actions"><button className="btn btn-primary" onClick={() => open(null)}>+ Agendar reunião</button></div></div>
    <div className="crm-summary"><div className="card"><span>Próximas reuniões</span><b>{future.length}</b><small>Agendadas para o futuro</small></div><div className="card"><span>Realizadas</span><b>{data.meetings.filter(m => !contactId || m.contact_id === contactId).filter(m => m.status === 'completed').length}</b><small>Resultados registrados</small></div><div className="card"><span>Canceladas</span><b>{data.meetings.filter(m => !contactId || m.contact_id === contactId).filter(m => m.status === 'cancelled').length}</b><small>Canceladas na plataforma</small></div><div className="card"><span>Total de reuniões</span><b>{data.meetings.filter(m => !contactId || m.contact_id === contactId).length}</b><small>Todo o histórico</small></div></div>
    <div className="crm-info">Os horários da lista são exibidos em Brasília (America/Sao_Paulo). Exporte o arquivo .ics para adicionar à sua agenda. A plataforma não cria links de videoconferência nem envia convites automaticamente.</div>
    <div className="crm-toolbar"><select aria-label="Filtrar reuniões por status" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Todas as reuniões</option>{Object.entries(labels).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select><span className="crm-note">{meetings.length} reuniões</span></div>
    {error && editing === undefined && <div className="crm-error" role="alert">{error}</div>}{success && <div className="crm-success" role="status">{success}</div>}
    {loading ? <div className="crm-loading" role="status">Carregando reuniões...</div> : !meetings.length ? <div className="card crm-empty"><b>Nenhuma reunião {filter === 'all' ? 'cadastrada' : 'com esse status'}</b><p>Agende a próxima conversa com um lead e acompanhe seus compromissos aqui.</p><button className="btn btn-primary" onClick={() => open(null)}>Agendar reunião</button></div> : <div className="crm-meeting-list">{meetings.map(meeting => <article className="card crm-meeting" key={meeting.id}><div><span className="crm-meeting-status">{labels[meeting.status]}</span><h2>{meeting.title}</h2><p><b>{new Date(meeting.starts_at).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })}</b> · {meeting.duration} min · Brasília</p><p>{contacts.get(meeting.contact_id ?? '')?.name ?? 'Sem contato vinculado'}{meeting.location ? ` · ${meeting.location}` : ''}</p></div><div className="crm-actions"><button className="btn" onClick={() => downloadMeeting(meeting)}>Baixar .ics</button><button className="btn" onClick={() => open(meeting)} disabled={busy}>Editar</button><button className="btn crm-danger" disabled={busy} onClick={() => void deleteMeeting(meeting)}>Excluir</button></div></article>)}</div>}
    {editing !== undefined && <div className="modal-overlay"><div ref={dialogRef} className="modal crm-modal" role="dialog" aria-modal="true" aria-labelledby="meeting-dialog-title"><form onSubmit={e => void save(e)}><div className="modal-head"><div><h2 className="page-title" id="meeting-dialog-title">{editing ? 'Editar reunião' : 'Agendar reunião'}</h2><span>Cadastre os dados do compromisso.</span></div><button type="button" className="btn btn-ghost" onClick={() => setEditing(undefined)} aria-label="Fechar formulário" disabled={busy}>✕</button></div><div className="modal-body"><label><span>Título *</span><input maxLength={200} required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Diagnóstico comercial" /></label><label><span>Contato</span><select value={form.contact_id ?? ''} onChange={e => setForm({ ...form, contact_id: e.target.value || null })}><option value="">Sem contato vinculado</option>{data.contacts.map(contact => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select></label><label><span>Data e horário *</span><input type="datetime-local" required value={dateValue} onChange={e => setDateValue(e.target.value)} /><small className="crm-form-help">Digite o horário no fuso do seu dispositivo: {browserTimezone}. A lista será convertida para Brasília.</small></label><div className="form-grid"><label><span>Duração em minutos *</span><input type="number" required min="5" max="480" step="1" value={form.duration} onChange={e => setForm({ ...form, duration: e.target.valueAsNumber })} /></label><label><span>Status</span><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as Meeting['status'] })}>{Object.entries(labels).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label></div><label><span>Local ou link da reunião</span><input maxLength={1000} value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Escritório, telefone ou link da sua agenda" /></label>{error && <div className="crm-error" role="alert">{error}</div>}</div><div className="modal-footer"><button type="button" className="btn" onClick={() => setEditing(undefined)} disabled={busy}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Salvando...' : 'Salvar reunião'}</button></div></form></div></div>}
  </div>;
}
