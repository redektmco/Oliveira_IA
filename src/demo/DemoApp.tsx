import { useEffect, useState, type ReactNode } from 'react';
import { Avatar, Icon, type IconName } from '../components/ui';
import { ThemeToggle } from '../components/ThemeToggle';
import '../lib/theme';
import '../index.css';
import '../styles/system.css';
import '../styles/theme.css';
import '../app.css';
import '../pages/ai.css';
import '../pages/crm.css';
import '../pages/pipeline.css';
import '../pages/home.css';
import '../styles/brand.css';
import './demo.css';
import { chapters, frameIndex, frames, navTarget, type CaptionIcon } from './script';
import { useDemo, useDemoKeys } from './state';
import { DIcon, initials, type DName } from './ui';
import { Closing, Cover, Problem, Results } from './scenes-full';
import InboxScene from './scenes-inbox';
import { MeetingsScene, PipelineScene, ProfileScene } from './scenes-crm';
import { AgentScene, AssistantScene, IntegrationsScene, KnowledgeScene } from './scenes-ai';
import Presenter from './Presenter';

const groups: { label: string; items: { id: string; label: string; icon: IconName }[] }[] = [
  { label: 'OPERAÇÃO COMERCIAL', items: [{ id: 'overview', label: 'Visão geral', icon: 'grid' }, { id: 'inbox', label: 'Caixa de entrada', icon: 'message' }, { id: 'contacts', label: 'Contatos / CRM', icon: 'users' }, { id: 'pipeline', label: 'Oportunidades', icon: 'pipeline' }, { id: 'meetings', label: 'Reuniões', icon: 'calendar' }] },
  { label: 'INTELIGÊNCIA ARTIFICIAL', items: [{ id: 'agents', label: 'Agentes de IA', icon: 'spark' }, { id: 'knowledge', label: 'Base de conhecimento', icon: 'book' }, { id: 'playground', label: 'Playground', icon: 'play' }] },
  { label: 'GESTÃO', items: [{ id: 'integrations', label: 'Integrações', icon: 'plug' }, { id: 'usage', label: 'Uso da IA', icon: 'chart' }, { id: 'settings', label: 'Configurações', icon: 'settings' }] },
];
const pageLabel = Object.fromEntries(groups.flatMap((g) => g.items).map((item) => [item.id, item.label]));
const captionIcon: Record<CaptionIcon, DName> = { zap: 'bolt', user: 'user', target: 'target', calendar: 'calendar', repeat: 'repeat', chart: 'chart', shield: 'shield', plug: 'plug', spark: 'spark', check: 'check', message: 'message', clock: 'clock' };
const fill = (text: string, company: string) => text.replace(/\{empresa\}/g, company);

function Dock({ index, go, next, prev, jump, company }: { index: number; go: (i: number) => void; next: () => void; prev: () => void; jump: (c: number) => void; company: string }) {
  const frame = frames[index], chapter = chapters[frame.c], step = chapter.steps[frame.s];
  const last = index === frames.length - 1;
  return <div className="dm-dock" data-full={chapter.full ? 'true' : undefined} role="region" aria-label="Controles da demonstração">
    <div className="dm-dock-main">
      {!chapter.full && <div className="dm-cap" key={index}>
        <span className="dm-cap-ic"><DIcon name={captionIcon[step.icon]} size={20} /></span>
        <div><em>{frame.c + 1}. {chapter.title} · {frame.s + 1}/{chapter.steps.length}</em><b>{fill(step.title, company)}</b><small>{fill(step.text, company)}</small></div>
      </div>}
      {chapter.full && <div className="dm-cap plain"><b>{chapter.title}</b></div>}
      <div className="dm-dock-btns">
        {step.hot && <span className="dm-hint"><i /> Clique no destaque</span>}
        <button className="dm-nav" onClick={prev} disabled={index === 0} aria-label="Passo anterior"><DIcon name="chevronLeft" size={18} /></button>
        <button className="dm-next" onClick={next} disabled={last} aria-label="Próximo passo">{last ? 'Fim' : 'Próximo'} <DIcon name="chevron" size={18} /></button>
      </div>
    </div>
    <div className="dm-rail" role="tablist" aria-label="Capítulos">
      {chapters.map((c, ci) => {
        const first = frameIndex(ci), done = index >= first + c.steps.length, current = ci === frame.c;
        return <button key={c.id} role="tab" aria-selected={current} className={`dm-seg ${current ? 'current' : ''} ${done ? 'done' : ''}`} style={{ flexGrow: c.steps.length }} onClick={() => jump(ci)} title={`${ci + 1}. ${c.title}`}>
          <span className="dm-seg-bar"><i style={{ width: current ? `${((frame.s + 1) / c.steps.length) * 100}%` : done ? '100%' : '0%' }} /></span>
          <span className="dm-seg-label">{ci + 1}</span>
        </button>;
      })}
    </div>
  </div>;
}

function Shell({ nav, company, onNav, children }: { nav: string | null; company: string; onNav: (id: string) => void; children: ReactNode }) {
  return <div className="app-shell dm-shell">
    <aside className="sidebar" aria-label="Navegação principal">
      <div className="brand"><img className="brand-logo on-dark" src="/brand/logo-light.svg" alt="V4 Oliveira & Co" /><img className="brand-logo on-light" src="/brand/logo-dark.svg" alt="V4 Oliveira & Co" /></div>
      <div className="org-switcher"><span className="org-avatar">{initials(company)}</span><span><b>{company}</b><small>SDR AI + CRM</small></span><Icon name="building" size={15} /></div>
      <nav>{groups.map((group) => <div className="nav-group" key={group.label}><div className="nav-label">{group.label}</div>{group.items.map((item) => <button key={item.id} className={nav === item.id ? 'active' : ''} aria-current={nav === item.id ? 'page' : undefined} onClick={() => onNav(item.id)} tabIndex={-1}><Icon name={item.icon} /><span>{item.label}</span></button>)}</div>)}</nav>
      <div className="sidebar-footer"><div className="user-profile"><Avatar name="Equipe Comercial" /><span><b>Equipe Comercial</b><small>Administrador</small></span></div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb"><span>{company}</span><Icon name="chevron" size={13} /><b>{nav ? pageLabel[nav] : ''}</b></div>
        <span className="dm-fake">Demonstração · dados fictícios</span>
        <div className="global-search"><Icon name="search" size={16} /><span className="dm-ph">Buscar contatos…</span></div>
        <span className="icon-btn" aria-hidden="true"><Icon name="bell" size={17} /><i /></span><ThemeToggle /><span className="top-avatar" aria-hidden="true">EC</span></header>
      <main id="main-content">{children}</main>
    </div>
  </div>;
}

export default function DemoApp() {
  const presenter = /^\/demo\/apresentador/.test(window.location.pathname);
  const demo = useDemo();
  const { index, frame, setFrame, next, prev, company } = demo;
  const [hud, setHud] = useState(true);
  const [notes, setNotes] = useState(false);
  const chapter = chapters[frame.c];

  useEffect(() => { document.title = presenter ? 'Painel da apresentadora · Demo V4 Oliveira' : `Demonstração · ${company}`; }, [presenter, company]);
  const screen = `${chapter.id}${chapter.id === 'controle' ? frame.s : ''}`;
  useEffect(() => { window.scrollTo(0, 0); }, [screen]);
  useEffect(() => { document.documentElement.classList.add('dm-on'); return () => document.documentElement.classList.remove('dm-on'); }, []);
  useDemoKeys({
    next, prev, first: () => setFrame(0), last: () => setFrame(frames.length - 1), chapter: (c) => { if (c < chapters.length) setFrame(frameIndex(c)); },
    extra: (key) => {
      if (presenter) return;
      if (key === 'h') setHud((value) => !value);
      if (key === 'n') setNotes((value) => !value);
      if (key === 'p') window.open('/demo/apresentador', 'oliveira-demo-presenter', 'width=560,height=860');
      if (key === 'f') { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.().catch(() => {}); }
      if (key === 't') document.querySelector<HTMLButtonElement>('.theme-toggle')?.click();
    },
  });
  if (presenter) return <Presenter demo={demo} />;

  const jump = (c: number) => setFrame(frameIndex(c));
  const step = frame.s, go = next;
  let scene: ReactNode;
  switch (chapter.id) {
    case 'capa': scene = <Cover company={demo.rawCompany} setCompany={demo.setCompany} start={next} />; break;
    case 'problema': scene = <Problem step={step} company={company} go={go} />; break;
    case 'inbox': scene = <InboxScene step={step} company={company} go={go} />; break;
    case 'crm': scene = <ProfileScene step={step} company={company} go={go} />; break;
    case 'agenda': scene = <MeetingsScene step={step} company={company} go={go} />; break;
    case 'funil': scene = <PipelineScene step={step} company={company} go={go} />; break;
    case 'assistente': scene = <AssistantScene step={step} company={company} go={go} />; break;
    case 'controle': scene = step === 0 ? <AgentScene step={step} company={company} go={go} /> : step === 1 ? <KnowledgeScene step={step} company={company} go={go} /> : <InboxScene mode="handoff" step={step - 2} company={company} go={go} />; break;
    case 'integracoes': scene = <IntegrationsScene step={step} company={company} go={go} />; break;
    case 'resultados': scene = <Results step={step} company={company} go={go} />; break;
    default: scene = <Closing step={step} company={company} go={go} />;
  }
  const navActive = chapter.id === 'controle' ? (step === 0 ? 'agents' : step === 1 ? 'knowledge' : 'inbox') : chapter.nav;
  return <div className="dm-root" data-full={chapter.full ? 'true' : 'false'} data-hud={hud ? 'true' : 'false'} data-chapter={chapter.id}>
    <div className="dm-progress" style={{ transform: `scaleX(${(index + 1) / frames.length})` }} aria-hidden="true" />
    {chapter.full ? <div className="dm-stage" key={`${chapter.id}`}>{scene}</div>
      : <Shell nav={navActive} company={company} onNav={(id) => { const target = navTarget[id]; if (target !== undefined) jump(target); }}><div className="dm-scene" key={`${chapter.id}-${chapter.id === 'controle' ? step : 'c'}`}>{scene}</div></Shell>}
    {hud && index > 0 && <Dock index={index} go={setFrame} next={next} prev={prev} jump={jump} company={company} />}
    {notes && <aside className="dm-notes" aria-label="Notas da apresentadora"><b>Notas · só você vê</b><ul>{chapter.steps[frame.s].say.map((line) => <li key={line}>{fill(line, company)}</li>)}</ul>{chapter.steps[frame.s].tip && <p>{fill(chapter.steps[frame.s].tip!, company)}</p>}</aside>}
  </div>;
}
