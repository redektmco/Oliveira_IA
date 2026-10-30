import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { useWorkspace } from '../lib/workspace';
import type { Knowledge, RowInput } from '../lib/types';
import './ai.css';

const errorText = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível concluir a operação. Tente novamente.';

export default function KnowledgePage() {
  const { data, demo, loading, create, update, remove } = useWorkspace();
  const [editing, setEditing] = useState<Knowledge | 'new' | null>(null);
  const [form, setForm] = useState<RowInput<'knowledge'>>({ title: '', content: '' });
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const items = useMemo(() => data.knowledge.filter(item => `${item.title} ${item.content}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))), [data.knowledge, search]);

  useEffect(() => {
    if (!editing) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) setEditing(null); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [editing, busy]);

  const openEditor = (item?: Knowledge) => {
    setError(''); setEditing(item ?? 'new');
    setForm(item ? { title: item.title, content: item.content } : { title: '', content: '' });
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing || busy) return;
    setBusy(true); setError('');
    try {
      const value = { title: form.title.trim(), content: form.content.trim() };
      if (!value.title || !value.content) throw new Error('Preencha o título e o conteúdo.');
      if (value.content.length > 20000) throw new Error('O conteúdo deve ter no máximo 20.000 caracteres.');
      if (editing === 'new') await create('knowledge', value);
      else await update('knowledge', editing.id, value);
      setEditing(null);
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  };

  const deleteItem = async (item: Knowledge) => {
    if (!window.confirm(`Excluir “${item.title}” da base de conhecimento?`)) return;
    setError(''); setBusy(true);
    try { await remove('knowledge', item.id); }
    catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  };

  const importText = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(''); setBusy(true);
    try {
      if (!/\.(txt|md)$/i.test(file.name)) throw new Error('Selecione um arquivo .txt ou .md. PDFs não são importados nesta versão.');
      if (file.size > 100000) throw new Error('O arquivo é grande demais. Importe um texto com até 20.000 caracteres.');
      const content = await file.text();
      if (!content.trim() || content.length > 20000) throw new Error('O arquivo deve conter entre 1 e 20.000 caracteres.');
      setForm(current => ({ title: current.title || file.name.replace(/\.(txt|md)$/i, '').slice(0, 200), content }));
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  };

  return <div className="content ai-page">
    <div className="page-header"><div><h1 className="page-title">Base de conhecimento</h1><p className="page-description">Informações comerciais que seus agentes podem consultar para responder com contexto.</p></div><div className="page-actions"><button className="btn btn-primary" disabled={busy} onClick={() => openEditor()}>+ Adicionar conteúdo</button></div></div>
    <div className="ai-note">Adicione serviços, perguntas frequentes e condições aprovadas. Os agentes usam até 30 conteúdos recentes, com até 10 mil caracteres de cada texto e 32 mil no conjunto. Coloque as informações essenciais no início de cada conteúdo.{demo && ' Neste modo, os conteúdos ficam salvos apenas neste navegador.'}</div>
    {error && !editing && <div className="ai-alert" role="alert">{error}</div>}
    <div className="card toolbar"><label className="ai-field" style={{ margin: 0, flex: 1 }}>Buscar conteúdo<input type="search" placeholder="Título ou trecho do texto" value={search} onChange={e => setSearch(e.target.value)} /></label><span className="ai-muted">{items.length} {items.length === 1 ? 'conteúdo' : 'conteúdos'}</span></div>
    {loading ? <p role="status">Carregando base de conhecimento...</p> : !items.length ? <div className="card ai-empty"><b>{search ? 'Nenhum conteúdo encontrado' : 'Adicione o que sua equipe precisa saber'}</b><p>{search ? 'Tente buscar por outro termo.' : 'Comece com um FAQ comercial ou uma descrição dos seus serviços.'}</p>{!search && <button className="btn btn-primary" onClick={() => openEditor()}>Adicionar primeiro conteúdo</button>}</div> : <div className="ai-knowledge-list">{items.map(item => <article key={item.id} className="card ai-list-card"><div><h2 className="ai-card-title">{item.title}</h2><p className="ai-muted">{item.content.length.toLocaleString('pt-BR')} caracteres · Criado em {new Date(item.created_at).toLocaleDateString('pt-BR')}</p><p className="ai-knowledge-excerpt">{item.content.slice(0, 240)}{item.content.length > 240 ? '…' : ''}</p></div><div className="ai-actions"><button className="btn" disabled={busy} onClick={() => openEditor(item)}>Editar conteúdo</button><button className="btn btn-danger" disabled={busy} onClick={() => { void deleteItem(item); }}>Excluir</button></div></article>)}</div>}
    {editing && <div className="modal-overlay"><section role="dialog" aria-modal="true" aria-labelledby="knowledge-editor-title" className="modal ai-modal"><form className="ai-form" onSubmit={event => { void save(event); }}>
      <div className="modal-head"><div><h2 className="page-title" id="knowledge-editor-title">{editing === 'new' ? 'Adicionar conteúdo' : 'Editar conteúdo'}</h2><p className="ai-muted">Texto simples ou Markdown, sem execução de código.</p></div><button type="button" className="btn btn-ghost" aria-label="Fechar editor" disabled={busy} onClick={() => setEditing(null)}>✕</button></div>
      <div className="modal-body">
        {error && <div className="ai-alert" role="alert">{error}</div>}
        <label className="ai-field">Título<input autoFocus required maxLength={200} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></label>
        <label className="ai-field">Importar texto (.txt ou .md)<input type="file" accept=".txt,.md,text/plain,text/markdown" disabled={busy} onChange={event => { void importText(event); }} /><small>A importação substitui o texto do editor. Revise e salve para adicionar à base.</small></label>
        <label className="ai-field">Conteúdo<textarea required maxLength={20000} rows={14} value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} /><small>{form.content.length.toLocaleString('pt-BR')} / 20.000 caracteres</small></label>
      </div><div className="modal-footer"><button type="button" className="btn" disabled={busy} onClick={() => setEditing(null)}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Salvando...' : 'Salvar conteúdo'}</button></div>
    </form></section></div>}
  </div>;
}
