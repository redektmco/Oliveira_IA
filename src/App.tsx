import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import Auth from './components/Auth';
import { Avatar, Button, Icon, type IconName } from './components/ui';
import { supabase } from './lib/supabase';
import { WorkspaceProvider, useWorkspace } from './lib/workspace';
import Overview from './pages/Overview';
import Contacts from './pages/Contacts';
import Pipeline from './pages/Pipeline';
import Meetings from './pages/Meetings';
import Agents from './pages/Agents';
import Knowledge from './pages/Knowledge';
import Playground from './pages/Playground';
import Inbox from './pages/Inbox';
import Settings from './pages/Settings';
import './app.css';

const groups: {label: string; items: {id: string; label: string; icon: IconName}[]}[] = [
  {label: 'OPERAÇÃO COMERCIAL', items: [{id:'overview',label:'Visão geral',icon:'grid'},{id:'inbox',label:'Caixa de entrada',icon:'message'},{id:'contacts',label:'Contatos',icon:'users'},{id:'pipeline',label:'Pipeline de vendas',icon:'pipeline'},{id:'meetings',label:'Reuniões',icon:'calendar'}]},
  {label: 'INTELIGÊNCIA ARTIFICIAL', items: [{id:'agents',label:'Agentes de IA',icon:'spark'},{id:'knowledge',label:'Base de conhecimento',icon:'book'},{id:'playground',label:'Playground',icon:'play'}]},
  {label: 'GESTÃO', items: [{id:'integrations',label:'Integrações',icon:'plug'},{id:'usage',label:'Uso da IA',icon:'chart'},{id:'settings',label:'Configurações',icon:'settings'}]},
];
const pages = groups.flatMap(g => g.items);
function hashPage() {const hash = window.location.hash.slice(1); return pages.some(p => p.id === hash) ? hash : 'overview';}
function hasDemoSession() {try {return sessionStorage.getItem('oliveira-demo-session') === 'active';} catch {return false;}}

function Shell({demo, user, onExit}: {demo: boolean; user: User | null; onExit: () => void}) {
  const [page, setPage] = useState(hashPage);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const {error,loading,refresh} = useWorkspace();
  const [retryError,setRetryError] = useState('');
  useEffect(() => { const listener = () => setPage(hashPage()); window.addEventListener('hashchange',listener); return () => window.removeEventListener('hashchange',listener); }, []);
  const go = (next: string) => {window.location.hash = next; setPage(next);setOpen(false);};
  const label = pages.find(p => p.id === page)?.label || 'Visão geral';
  const name = user?.email || 'Visitante';
  return <div className="app-shell">
    <a href="#main-content" className="skip-link">Pular para o conteúdo</a>
    <aside className={`sidebar ${open ? 'mobile-open' : ''}`} aria-label="Navegação principal">
      <div className="brand"><span className="brand-mark">V4</span><div><b>SDR AI</b><span>por Oliveira & Co.</span></div><button className="mobile-close icon-btn" aria-label="Fechar menu" onClick={() => setOpen(false)}>×</button></div>
      <div className="org-switcher"><span className="org-avatar">OC</span><span><b>Oliveira & Co.</b><small>{demo ? 'Demonstração local' : 'Meu workspace'}</small></span><Icon name="building" size={15}/></div>
      <nav>{groups.map(group => <div className="nav-group" key={group.label}><div className="nav-label">{group.label}</div>{group.items.map(item => <button key={item.id} className={page === item.id ? 'active' : ''} aria-current={page === item.id ? 'page' : undefined} onClick={() => go(item.id)}><Icon name={item.icon}/><span>{item.label}</span></button>)}</div>)}</nav>
      <div className="sidebar-footer"><button className="help-card" onClick={() => go('settings')}><Icon name="spark"/><div><b>Sua operação começa aqui</b><span>Conexões e próximos passos</span></div><Icon name="chevron" size={14}/></button><button className="user-profile" onClick={onExit} title="Sair"><Avatar name={name}/><span><b>{name}</b><small>{demo ? 'Sair da demonstração' : 'Sair da conta'}</small></span><Icon name="arrow" size={16}/></button></div>
    </aside>
    <div className="main-shell"><header className="topbar"><button className="mobile-menu" aria-label="Abrir menu" onClick={() => setOpen(true)}>☰</button><div className="breadcrumb"><span>Oliveira & Co.</span><Icon name="chevron" size={13}/><b>{label}</b></div><form className="global-search" onSubmit={e => {e.preventDefault(); go('contacts');}}><Icon name="search" size={16}/><input aria-label="Buscar contatos" placeholder="Buscar contatos…" value={query} onChange={e => setQuery(e.target.value)}/><button aria-label="Pesquisar" className="search-submit">↵</button></form><button className="top-avatar" title={name} aria-label="Ir para configurações" onClick={() => go('settings')}>OC</button></header>
      {demo && <div className="demo-banner"><span><b>Demonstração</b> · Dados locais de exemplo. A IA e os canais externos não estão conectados.</span><button onClick={onExit}>Conectar minha conta →</button></div>}
      <main id="main-content" tabIndex={-1}>{error && <div className="error-banner" role="alert"><span>{error} {retryError}</span><Button disabled={loading} onClick={() => {setRetryError(''); refresh().catch(() => setRetryError('A conexão continua indisponível.'));}}>Tentar novamente</Button></div>}
        {loading && !error && <div role="status" className="loading-bar">Atualizando dados…</div>}
        {page === 'overview' ? <Overview go={go}/> : page === 'contacts' ? <Contacts search={query}/> : page === 'pipeline' ? <Pipeline/> : page === 'meetings' ? <Meetings/> : page === 'agents' ? <Agents/> : page === 'knowledge' ? <Knowledge/> : page === 'playground' ? <Playground/> : page === 'inbox' ? <Inbox/> : <Settings section={page}/>}
      </main>
    </div>{open && <button className="sidebar-backdrop" aria-label="Fechar menu" onClick={() => setOpen(false)}/>}
  </div>;
}

class ErrorBoundary extends Component<{children: ReactNode},{failed:boolean}> {
  state = {failed: false};
  static getDerivedStateFromError() {return {failed:true};}
  componentDidCatch(_error: Error, _info: ErrorInfo) { /* Avoid logging private conversation content. */ }
  render() {return this.state.failed ? <div className="empty-state"><h1>Não foi possível abrir esta tela.</h1><p>Atualize a página para tentar novamente. Seus dados salvos serão preservados.</p><button className="btn" onClick={() => window.location.reload()}>Atualizar</button></div> : this.props.children;}
}
export default function App() {
  const [user,setUser] = useState<User | null>(null);
  const [checking,setChecking] = useState(Boolean(supabase));
  const [demo,setDemo] = useState(hasDemoSession);
  const [recovery,setRecovery] = useState(false);
  const [authError,setAuthError] = useState('');
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({data,error}) => {if (active) {setUser(data.session?.user || null);setChecking(false);if (error) setAuthError('Sessão indisponível. Entre novamente.');}}).catch(() => {if (active) setChecking(false);});
    const {data: listener} = supabase.auth.onAuthStateChange((event,session) => {setUser(session?.user || null);setChecking(false);if (event === 'PASSWORD_RECOVERY') setRecovery(true);});
    return () => {active = false;listener.subscription.unsubscribe();};
  }, []);
  if (checking) return <div className="empty-state" role="status">Carregando sua sessão…</div>;
  const exit = async () => {
    if (!demo && supabase) { const {error} = await supabase.auth.signOut(); if (error) {setAuthError('Não foi possível sair. Verifique sua conexão e tente novamente.');return;} }
    try { sessionStorage.removeItem('oliveira-demo-session'); } catch { /* The demo works without optional session storage. */ }
    setDemo(false);setUser(null);setAuthError('');window.location.hash = '';
  };
  return <ErrorBoundary>{authError && <div className="error-banner" role="alert">{authError}</div>}{(!user && !demo) || recovery ? <Auth recovery={recovery} onDemo={() => {try {sessionStorage.setItem('oliveira-demo-session','active');} catch { /* optional */ } setDemo(true);}}/> : <WorkspaceProvider key={demo ? 'demo' : user!.id} demo={demo} userId={user?.id || null}><Shell demo={demo} user={user} onExit={() => {void exit();}}/></WorkspaceProvider>}</ErrorBoundary>;
}
