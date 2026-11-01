import { useEffect, useRef, useState, type FormEvent } from 'react';
import { contactStatuses, type Contact, type RowInput } from '../lib/types';
import { useWorkspace } from '../lib/workspace';
import './crm.css';
import {formatPhone} from '../lib/phone';
import ContactProfile from './ContactProfile';
import { Icon } from '../components/ui';

const PAGE_SIZE = 10;
const palette = [['#e0e7ff', '#4338ca'], ['#ffe4e6', '#be123c'], ['#dcfce7', '#15803d'], ['#fef3c7', '#b45309'], ['#e0f2fe', '#0369a1']];
const avatarStyle = (name: string) => { const [background, color] = palette[[...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % palette.length]; return { background, color }; };
const initials = (name: string) => name.split(/\s+/).filter(Boolean).map(part => part[0]).slice(0, 2).join('').toLocaleUpperCase('pt-BR') || '?';
const scoreTone = (score: number) => score >= 70 ? 'high' : score >= 40 ? 'mid' : 'low';

const blankContact = (): RowInput<'contacts'> => ({ name: '', company: '', email: '', phone: '', source: 'Manual', score: 0, status: 'new', notes: '', job_title: '', city: '', owner_name: '', tags: [] });
export function contactsCsv(contacts: Contact[],phoneFormat?:string): string {
  const cell = (value: unknown) => {
    let content = String(value ?? '');
    if (/^[\s]*[=+\-@\t\r]/.test(content)) content = `'${content}`;
    return `"${content.replace(/"/g, '""')}"`;
  };
  const rows = [['Nome', 'Empresa', 'E-mail', 'Telefone', 'Origem', 'Score', 'Status', 'Notas'], ...contacts.map(c => [c.name, c.company, c.email, phoneFormat?formatPhone(c.phone,phoneFormat):c.phone, c.source, c.score, contactStatuses[c.status], c.notes])];
  return '\uFEFF' + rows.map(row => row.map(cell).join(';')).join('\r\n');
}
function exportContacts(contacts: Contact[],phoneFormat?:string) {
  const url = URL.createObjectURL(new Blob([contactsCsv(contacts,phoneFormat)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = `contatos-${new Date().toISOString().slice(0,10)}.csv`; link.click(); URL.revokeObjectURL(url);
}

export default function Contacts({ search = '' }: { search?: string }) {
  const { data, loading, create, update, remove,phoneFormat } = useWorkspace();
  const [selectedId, setSelectedId] = useState(() => window.location.hash.split('/')[1] || '');
  useEffect(() => { const change = () => setSelectedId(window.location.hash.split('/')[1] || ''); window.addEventListener('hashchange', change); return () => window.removeEventListener('hashchange', change); }, []);
  const selected = data.contacts.find(c => encodeURIComponent(c.id) === selectedId);
  const [query, setQuery] = useState(search);
  const [status, setStatus] = useState('all');
  const [editing, setEditing] = useState<Contact | null | undefined>(undefined);
  const [form, setForm] = useState(blankContact);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);
  const newButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => setQuery(search), [search]);
  useEffect(() => {
    if (editing === undefined) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    modalRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) setEditing(undefined);
      if (e.key !== 'Tab') return;
      const nodes = modalRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,textarea');
      if (!nodes?.length) return;
      if (e.shiftKey && document.activeElement === nodes[0]) { e.preventDefault(); nodes[nodes.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === nodes[nodes.length - 1]) { e.preventDefault(); nodes[0].focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); if (previousFocus?.isConnected) previousFocus.focus(); else newButtonRef.current?.focus(); };
  }, [editing, busy]);
  const [origin, setOrigin] = useState('all');
  const [page, setPage] = useState(0);
  const norm = (value: string) => value.toLocaleLowerCase('pt-BR');
  const matchesQuery = (c: Contact) => norm(`${c.name} ${c.company} ${c.email} ${c.phone}`).includes(norm(query));
  const matchesOrigin = (c: Contact) => origin === 'all' || (c.source || 'Não informada') === origin;
  const filtered = data.contacts.filter(c => matchesQuery(c) && matchesOrigin(c) && (status === 'all' || c.status === status));
  const statusCount = (value: string) => data.contacts.filter(c => matchesQuery(c) && matchesOrigin(c) && (value === 'all' || c.status === value)).length;
  const origins = [...new Set(data.contacts.map(c => c.source || 'Não informada'))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  useEffect(() => setPage(0), [query, status, origin]);
  const open = (contact: Contact | null) => { setEditing(contact); setError(''); setSuccess(''); setForm(contact ? { name: contact.name, company: contact.company, email: contact.email, phone: contact.phone, source: contact.source, score: contact.score, status: contact.status, notes: contact.notes, job_title: contact.job_title ?? '', city: contact.city ?? '', owner_name: contact.owner_name ?? '' } : blankContact()); };
  const field = <K extends keyof RowInput<'contacts'>>(key: K, value: RowInput<'contacts'>[K]) => setForm(prev => ({ ...prev, [key]: value }));
  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const input = { ...form, name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(), company: form.company.trim(), source: form.source.trim(), notes: form.notes.trim() };
      if (!input.name) throw new Error('Informe o nome do contato.');
      if (!Number.isFinite(input.score) || input.score < 0 || input.score > 100) throw new Error('O score deve estar entre 0 e 100.');
      if (editing) await update('contacts', editing.id, input); else await create('contacts', input);
      setEditing(undefined); setSuccess(editing ? 'Contato atualizado.' : 'Contato criado.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o contato.'); }
    finally { setBusy(false); }
  };
  const deleteContact = async (contact: Contact) => {
    if ([...data.deals, ...data.meetings, ...data.conversations].some(record => record.contact_id === contact.id)) {
      setError('Este contato possui oportunidades, reuniões ou conversas vinculadas. Remova esses vínculos antes de excluir o contato.');
      setSuccess('');
      return;
    }
    if (!window.confirm(`Excluir ${contact.name}? Esta ação remove o cadastro do contato.`)) return;
    setBusy(true); setError(''); setSuccess('');
    try { await remove('contacts', contact.id); setSuccess('Contato excluído.'); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível excluir o contato.'); } finally { setBusy(false); }
  };
  const segments = [['all', 'Todos'], ...Object.entries(contactStatuses)].filter(([value]) => value === 'all' || value === status || statusCount(value) > 0);
  return <div className={selected ? "" : "content v2-page"}>
    {selected ? <ContactProfile key={selected.id} contact={selected} onEdit={() => open(selected)}/> : <>
    <div className="page-header"><div><h1 className="page-title">Contatos</h1><p className="page-description">Clique em um contato para ver histórico, resumo da IA e qualificação.</p></div><div className="page-actions"><button className="v2-secondary" onClick={() => exportContacts(filtered,phoneFormat)} disabled={!filtered.length}><Icon name="download" size={16}/>Exportar CSV</button><button ref={newButtonRef} className="v2-primary" onClick={() => open(null)}><Icon name="plus" size={16}/>Novo contato</button></div></div>
    <div className="v2-toolbar"><div className="v2-segments" role="group" aria-label="Filtrar por qualificação">{segments.map(([value, label]) => <button key={value} type="button" aria-pressed={status === value} className={status === value ? 'active' : ''} onClick={() => setStatus(value)}>{label}<span>{statusCount(value)}</span></button>)}</div>
      <label className="v2-search"><Icon name="search" size={16}/><input aria-label="Buscar contatos" placeholder="Buscar por nome, empresa, telefone ou e-mail…" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <label className="v2-origin"><Icon name="filter" size={16}/><select aria-label="Filtrar por origem" value={origin} onChange={e => setOrigin(e.target.value)}><option value="all">Todas as origens</option>{origins.map(item => <option key={item} value={item}>{item}</option>)}</select><Icon name="chevron" size={14}/></label></div>
    {error && editing === undefined && <div className="crm-error" role="alert">{error}</div>}{success && <div className="crm-success" role="status">{success}</div>}
    {loading ? <div className="crm-loading" role="status">Carregando contatos...</div> : !filtered.length ? <div className="v2-card crm-empty"><b>{data.contacts.length ? 'Nenhum contato encontrado' : 'Seu próximo cliente começa aqui'}</b><p>{data.contacts.length ? 'Tente outro termo ou altere o filtro.' : 'Cadastre seu primeiro contato para criar oportunidades e iniciar conversas.'}</p>{!data.contacts.length && <button className="btn btn-primary" onClick={() => open(null)}>Cadastrar primeiro contato</button>}</div> : <div className="v2-card v2-table-wrap"><table className="v2-table"><thead><tr><th>CONTATO</th><th>TELEFONE / E-MAIL</th><th>ORIGEM</th><th>SCORE</th><th>STATUS</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>{visible.map(contact => { const whatsapp = /whats/i.test(contact.source); const tone = scoreTone(contact.score); return <tr key={contact.id}>
      <td><div className="v2-contact"><span className="v2-avatar" style={avatarStyle(contact.name)} aria-hidden="true">{initials(contact.name)}</span><div><a className="v2-name" href={`#contacts/${encodeURIComponent(contact.id)}`}>{contact.name}</a><small>{contact.company || 'Empresa não informada'}</small></div></div></td>
      <td><span className="v2-phone">{formatPhone(contact.phone,phoneFormat) || 'Sem telefone'}</span><small>{contact.email || 'Sem e-mail'}</small></td>
      <td><span className={`v2-chip ${whatsapp ? 'whatsapp' : ''}`}>{whatsapp && <Icon name="whatsapp" size={13}/>}{contact.source || 'Não informada'}</span></td>
      <td><div className="v2-score"><i><em className={tone} style={{ width: `${Math.max(0, Math.min(100, contact.score))}%` }}/></i><b className={contact.score ? '' : 'zero'}>{contact.score}/100</b></div></td>
      <td><span className={`v2-status ${contact.status}`}><i/>{contactStatuses[contact.status]}</span></td>
      <td><div className="v2-actions"><a className="v2-btn" href={`#contacts/${encodeURIComponent(contact.id)}`} aria-label={`Abrir ficha de ${contact.name}`}>Abrir ficha</a><button className="v2-btn v2-icon-btn" onClick={() => open(contact)} disabled={busy} aria-label={`Editar ${contact.name}`} title="Editar"><Icon name="edit" size={16}/></button><button className="v2-btn v2-icon-btn v2-danger" onClick={() => void deleteContact(contact)} disabled={busy} aria-label={`Excluir ${contact.name}`} title="Excluir"><Icon name="trash" size={16}/></button></div></td></tr>; })}</tbody></table>
      <div className="v2-table-foot"><span>Mostrando {visible.length} de {filtered.length} contatos{filtered.length !== data.contacts.length ? ` (${data.contacts.length} no total)` : ''}</span><div><button type="button" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Anterior</button><button type="button" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>Próxima</button></div></div></div>}
    </>}
    {editing !== undefined && <div className="modal-overlay"><div ref={modalRef} className="modal crm-modal" role="dialog" aria-modal="true" aria-labelledby="contact-dialog-title"><form onSubmit={e => void save(e)}><div className="modal-head"><div><h2 className="page-title" id="contact-dialog-title">{editing ? 'Editar contato' : 'Novo contato'}</h2><span>Informações usadas na sua operação comercial.</span></div><button type="button" className="btn btn-ghost" aria-label="Fechar formulário" onClick={() => setEditing(undefined)} disabled={busy}>✕</button></div><div className="modal-body"><div className="form-grid"><label><span>Nome *</span><input required maxLength={150} value={form.name} onChange={e => field('name', e.target.value)} autoComplete="name" /></label><label><span>Empresa</span><input maxLength={150} value={form.company} onChange={e => field('company', e.target.value)} autoComplete="organization" /></label><label><span>E-mail</span><input type="email" maxLength={254} value={form.email} onChange={e => field('email', e.target.value)} autoComplete="email" /></label><label><span>Telefone com DDI</span><input type="tel" maxLength={30} placeholder="+55 11 99999-9999" value={form.phone} onChange={e => field('phone', e.target.value)} autoComplete="tel" /></label><label><span>Cargo</span><input maxLength={150} value={form.job_title ?? ""} onChange={e => field("job_title", e.target.value)}/></label><label><span>Cidade</span><input maxLength={150} value={form.city ?? ""} onChange={e => field("city", e.target.value)}/></label><label><span>Responsável comercial</span><input maxLength={150} value={form.owner_name ?? ""} onChange={e => field("owner_name", e.target.value)}/></label><label><span>Origem</span><input maxLength={100} value={form.source} onChange={e => field('source', e.target.value)} placeholder="Site, indicação, Meta Ads..." /></label><label><span>Score de qualificação</span><input type="number" min="0" max="100" step="1" required value={form.score} onChange={e => field('score', e.target.valueAsNumber)} /></label><label className="full"><span>Status</span><select value={form.status} onChange={e => field('status', e.target.value as Contact['status'])}>{Object.entries(contactStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div><label><span>Notas comerciais</span><textarea maxLength={12000} value={form.notes} onChange={e => field('notes', e.target.value)} placeholder="Necessidades, contexto e próximos passos..." /></label>{error && <div className="crm-error" role="alert">{error}</div>}</div><div className="modal-footer"><button type="button" className="btn" onClick={() => setEditing(undefined)} disabled={busy}>Cancelar</button><button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Salvando...' : 'Salvar contato'}</button></div></form></div></div>}
  </div>;
}
