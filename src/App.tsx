import { Component, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import MfaGate from './components/MfaGate';
import Notifications from './components/Notifications';
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
import { ThemeToggle } from './components/ThemeToggle';
import './lib/theme';
import './index.css';
import './styles/system.css';
import './styles/theme.css';
import './app.css';

const groups: {label: string; items: {id: string; label: string; icon: IconName}[]}[] = [
  {label: 'OPERAÇÃO COMERCIAL', items: [{id:'overview',label:'Visão geral',icon:'grid'},{id:'inbox',label:'Caixa de entrada',icon:'message'},{id:'contacts',label:'Contatos / CRM',icon:'users'},{id:'pipeline',label:'Oportunidades',icon:'pipeline'},{id:'meetings',label:'Reuniões',icon:'calendar'}]},
  {label: 'INTELIGÊNCIA ARTIFICIAL', items: [{id:'agents',label:'Agentes de IA',icon:'spark'},{id:'knowledge',label:'Base de conhecimento',icon:'book'},{id:'playground',label:'Playground',icon:'play'}]},
  {label: 'GESTÃO', items: [{id:'integrations',label:'Integrações',icon:'plug'},{id:'usage',label:'Uso da IA',icon:'chart'},{id:'settings',label:'Configurações',icon:'settings'}]},
];
const pages = groups.flatMap(g => g.items);
function hashPage() {const hash = window.location.hash.slice(1).split('/')[0]; return pages.some(p => p.id === hash) ? hash : 'overview';}
function hasDemoSession() {try {return sessionStorage.getItem('oliveira-demo-session') === 'active';} catch {return false;}}

function Shell({demo, user, onExit}: {demo: boolean; user: User | null; onExit: () => void}) {
  const [page, setPage] = useState(hashPage);
  const [contactId, setContactId] = useState(() => window.location.hash.split('/')[1] || '');
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  const menuButton = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const change = () => { setMobile(media.matches); if (!media.matches) setOpen(false); };
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (!open || !mobile) return;
    sidebar.current?.querySelector<HTMLButtonElement>('.mobile-close')?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
      if (event.key !== 'Tab') return;
      const buttons = sidebar.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
      if (!buttons?.length) return;
      if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons[buttons.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === buttons[buttons.length - 1]) { event.preventDefault(); buttons[0].focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = previousOverflow; menuButton.current?.focus(); };
  }, [open, mobile]);
  const [query, setQuery] = useState('');
  const {error,loading,refresh,data,workspaceName,logo,workspaces,ownerId,switchWorkspace} = useWorkspace();
  const [retryError,setRetryError] = useState('');
  useEffect(() => { const listener = () => { setPage(hashPage()); setContactId(window.location.hash.split('/')[1] || ''); }; window.addEventListener('hashchange',listener); return () => window.removeEventListener('hashchange',listener); }, []);
  const go = (next: string) => {window.location.hash = next; setPage(next);setOpen(false);};
  const profileContact = page === 'contacts' ? data.contacts.find(c => encodeURIComponent(c.id) === contactId) : undefined;
  const profileDeal = page === 'pipeline' ? data.deals.find(d => encodeURIComponent(d.id) === contactId) : undefined;
  const label = pages.find(p => p.id === page)?.label || 'Visão geral';
  const name = user?.email || 'Visitante';
  return <div className="app-shell">
    <a href="#main-content" className="skip-link">Pular para o conteúdo</a>
    <aside ref={sidebar} inert={mobile && !open} className={`sidebar ${open ? 'mobile-open' : ''}`} aria-label="Navegação principal">
      <div className="brand"><img className="brand-logo on-dark" src="/brand/logo-light.svg" alt="V4 Oliveira & Co"/><img className="brand-logo on-light" src="/brand/logo-dark.svg" alt="V4 Oliveira & Co"/><button className="mobile-close icon-btn" aria-label="Fechar menu" onClick={() => setOpen(false)}>×</button></div>
      <div className="org-switcher">{logo?<img className="org-avatar" src={logo} alt=""/>:<span className="org-avatar">{workspaceName.split(" ").filter(Boolean).map(w=>w[0]).slice(0,2).join("")}</span>}<span><b>{workspaceName}</b>{workspaces.length>1?<select aria-label="Selecionar workspace" value={ownerId} onChange={e=>switchWorkspace(e.target.value)}>{workspaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select>:<small>{demo ? 'Demonstração local' : 'Meu workspace'}</small>}</span><Icon name="building" size={15}/></div>
      <nav>{groups.map(group => <div className="nav-group" key={group.label}><div className="nav-label">{group.label}</div>{group.items.map(item => <button key={item.id} className={page === item.id ? 'active' : ''} aria-current={page === item.id ? 'page' : undefined} onClick={() => go(item.id)}><Icon name={item.icon}/><span>{item.label}</span></button>)}</div>)}</nav>
      <div className="sidebar-footer"><button className="help-card" onClick={() => go('settings')}><Icon name="spark"/><div><b>Sua operação começa aqui</b><span>Conexões e próximos passos</span></div><Icon name="chevron" size={14}/></button><button className="user-profile" onClick={onExit} title="Sair"><Avatar name={name}/><span><b>{name}</b><small>{demo ? 'Sair da demonstração' : 'Sair da conta'}</small></span><Icon name="arrow" size={16}/></button></div>
    </aside>
    <div className="main-shell"><header className="topbar"><button ref={menuButton} className="mobile-menu" aria-label="Abrir menu" aria-expanded={open} onClick={() => setOpen(true)}>☰</button><div className="breadcrumb">{profileContact || profileDeal ? <a href={profileContact ? '#contacts' : '#pipeline'}>{profileContact ? 'Contatos' : 'Oportunidades'}</a> : <span>{workspaceName}</span>}<Icon name="chevron" size={13}/><b>{profileContact?.name || profileDeal?.title || label}</b></div><form className="global-search" onSubmit={e => {e.preventDefault(); go('contacts');}}><Icon name="search" size={16}/><input aria-label="Buscar contatos" placeholder="Buscar contatos…" value={query} onChange={e => setQuery(e.target.value)}/><button aria-label="Pesquisar" className="search-submit">↵</button></form><Notifications/><ThemeToggle/><button className="top-avatar" title={name} aria-label="Ir para configurações" onClick={() => go('settings')}>{name.split(/[@.\s_-]+/).filter(Boolean).map(part => part[0]).slice(0,2).join('').toUpperCase() || 'V'}</button></header>
      {demo && <div className="demo-banner"><span><b>Demonstração</b> · Dados locais de exemplo. A IA e os canais externos não estão conectados.</span><button onClick={onExit}>Conectar minha conta →</button></div>}
      <main id="main-content" tabIndex={-1}>{error && <div className="error-banner" role="alert"><span>{error} {retryError}</span><Button disabled={loading} onClick={() => {setRetryError(''); refresh().catch(() => setRetryError('A conexão continua indisponível.'));}}>Tentar novamente</Button></div>}
        {loading && !error && <div role="status" className="loading-bar">Atualizando dados…</div>}
        {page === 'overview' ? <Overview go={go} userName={user?.email ? user.email.split('@')[0].split(/[._-]+/)[0].replace(/^./, c => c.toUpperCase()) : undefined}/> : page === 'contacts' ? <Contacts search={query}/> : page === 'pipeline' ? <Pipeline/> : page === 'meetings' ? <Meetings/> : page === 'agents' ? <Agents/> : page === 'knowledge' ? <Knowledge/> : page === 'playground' ? <Playground/> : page === 'inbox' ? <Inbox/> : <Settings section={page}/>}
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
  const [recovery,setRecovery] = useState(()=>new URLSearchParams(window.location.hash.slice(1)).get('type')==='invite');
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
    // Revoke the session on the server; if the network fails, still clear this device so nobody stays signed in.
    if (!demo && supabase) { const {error} = await supabase.auth.signOut(); if (error) await supabase.auth.signOut({scope:'local'}).catch(() => {}); }
    try { sessionStorage.removeItem('oliveira-demo-session'); } catch { /* The demo works without optional session storage. */ }
    setDemo(false);setUser(null);setAuthError('');window.location.hash = '';
  };
  return <ErrorBoundary>{authError && <div className="error-banner" role="alert">{authError}</div>}{(!user && !demo) || recovery ? <Auth recovery={recovery} onDemo={() => {try {sessionStorage.setItem('oliveira-demo-session','active');} catch { /* optional */ } setDemo(true);}}/> : <MfaGate onExit={()=>{void exit();}}><WorkspaceProvider key={demo ? 'demo' : user!.id} demo={demo} userId={user?.id || null}><Shell demo={demo} user={user} onExit={() => {void exit();}}/></WorkspaceProvider></MfaGate>}</ErrorBoundary>;
}
