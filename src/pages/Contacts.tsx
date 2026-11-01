import { useEffect, useRef, useState, type FormEvent } from 'react';
import { contactStatuses, type Contact, type RowInput } from '../lib/types';
import { useWorkspace } from '../lib/workspace';
import './crm.css';
import {formatPhone} from '../lib/phone';
import ContactProfile from './ContactProfile';

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
  const filtered = data.contacts.filter(c => `${c.name} ${c.company} ${c.email} ${c.phone}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')) && (status === 'all' || c.status === status));
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
  return <div className={selected ? "" : "content"}>
    {selected ? <ContactProfile key={selected.id} contact={selected} onEdit={() => open(selected)}/> : <>
    <div className="page-header"><div><h1 className="page-title">Contatos</h1><p className="page-description">Clique no nome ou em Abrir ficha para ver histórico, resumo da IA e qualificação do cliente.</p></div><div className="page-actions"><button className="btn" onClick={() => exportContacts(filtered,phoneFormat)} disabled={!filtered.length}>Exportar CSV</button><button ref={newButtonRef} className="btn btn-primary" onClick={() => open(null)}>+ Novo contato</button></div></div>
    <div className="crm-toolbar"><div className="search-box"><input aria-label="Buscar contatos" placeholder="Buscar por nome, empresa, telefone ou e-mail..." value={query} onChange={e => setQuery(e.target.value)} /></div><select aria-label="Filtrar por qualificação" value={status} onChange={e => setStatus(e.target.value)}><option value="all">Todos os status</option>{Object.entries(contactStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><span className="crm-note">{filtered.length} de {data.contacts.length} contatos</span></div>
    {error && editing === undefined && <div className="crm-error" role="alert">{error}</div>}{success && <div className="crm-success" role="status">{success}</div>}
    {loading ? <div className="crm-loading" role="status">Carregando contatos...</div> : !filtered.length ? <div className="card crm-empty"><b>{data.contacts.length ? 'Nenhum contato encontrado' : 'Seu próximo cliente começa aqui'}</b><p>{data.contacts.length ? 'Tente outro termo ou altere o filtro.' : 'Cadastre seu primeiro contato para criar oportunidades e iniciar conversas.'}</p>{!data.contacts.length && <button className="btn btn-primary" onClick={() => open(null)}>Cadastrar primeiro contato</button>}</div> : <div className="table-card"><table className="crm-table"><thead><tr><th>NOME / EMPRESA</th><th>CONTATO</th><th>ORIGEM</th><th>SCORE</th><th>STATUS</th><th>AÇÕES</th></tr></thead><tbody>{filtered.map(contact => <tr key={contact.id}><td><a className="contact-name-link" href={`#contacts/${encodeURIComponent(contact.id)}`}>{contact.name}</a><small>{contact.company || 'Empresa não informada'}</small></td><td>{contact.email || 'Sem e-mail'}<br /><small className="crm-note">{formatPhone(contact.phone,phoneFormat) || 'Sem telefone'}</small></td><td>{contact.source || 'Não informada'}</td><td><span className="crm-score">{contact.score}/100</span></td><td><span className={`badge ${contact.status === 'qualified' ? 'badge-success' : contact.status === 'unqualified' ? 'badge-danger' : 'badge-neutral'}`}>{contactStatuses[contact.status]}</span></td><td><div className="crm-actions"><a className="btn" href={`#contacts/${encodeURIComponent(contact.id)}`} aria-label={`Abrir ficha de ${contact.name}`}>Abrir ficha</a><button className="btn" onClick={() => open(contact)} disabled={busy} aria-label={`Editar ${contact.name}`}>Editar</button><button className="btn crm-danger" onClick={() => void deleteContact(contact)} disabled={busy} aria-label={`Excluir ${contact.name}`}>Excluir</button></div></td></tr>)}</tbody></table></div>}
    </>}
    {editing !== undefined && <div className="modal-overlay"><div ref={modalRef} className="modal crm-modal" role="dialog" aria-modal="true" aria-labelledby="contact-dialog-title"><form onSubmit={e => void save(e)}><div className="modal-head"><div><h2 className="page-title" id="contact-dialog-title">{editing ? 'Editar contato' : 'Novo contato'}</h2><span>Informações usadas na sua operação comercial.</span></div><button type="button" className="btn btn-ghost" aria-label="Fechar formulário" onClick={() => setEditing(undefined)} disabled={busy}>✕</button></div><div className="modal-body"><div className="form-grid"><label><span>Nome *</span><input required maxLength={150} value={form.name} onChange={e => field('name', e.target.value)} autoComplete="name" /></label><label><span>Empresa</span><input maxLength={150} value={form.company} onChange={e => field('company', e.target.value)} autoComplete="organization" /></label><label><span>E-mail</span><input type="email" maxLength={254} value={form.email} onChange={e => field('email', e.target.value)} autoComplete="email" /></label><label><span>Telefone com DDI</span><input type="tel" maxLength={30} placeholder="+55 11 99999-9999" value={form.phone} onChange={e => field('phone', e.target.value)} autoComplete="tel" /></label><label><span>Cargo</span><input maxLength={150} value={form.job_title ?? ""} onChange={e => field("job_title", e.target.value)}/></label><label><span>Cidade</span><input maxLength={150} value={form.city ?? ""} onChange={e => field("city", e.target.value)}/></label><label><span>Responsável comercial</span><input maxLength={150} value={form.owner_name ?? ""} onChange={e => field("owner_name", e.target.value)}/></label><label><span>Origem</span><input maxLength={100} value={form.source} onChange={e => field('source', e.target.value)} placeholder="Site, indicação, Meta Ads..." /></label><label><span>Score de qualificação</span><input type="number" min="0" max="100" step="1" required value={form.score} onChange={e => field('score', e.target.valueAsNumber)} /></label><label className="full"><span>Status</span><select value={form.status} onChange={e => field('status', e.target.value as Contact['status'])}>{Object.entries(contactStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div><label><span>Notas comerciais</span><textarea maxLength={12000} value={form.notes} onChange={e => field('notes', e.target.value)} placeholder="Necessidades, contexto e próximos passos..." /></label>{error && <div className="crm-error" role="alert">{error}</div>}</div><div className="modal-footer"><button type="button" className="btn" onClick={() => setEditing(undefined)} disabled={busy}>Cancelar</button><button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Salvando...' : 'Salvar contato'}</button></div></form></div></div>}
  </div>;
}
