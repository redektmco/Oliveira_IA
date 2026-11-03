import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from './ui';
import { useWorkspace } from '../lib/workspace';
import { roleLabels } from '../lib/settings-types';

const initials = (name: string) => name.split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
/** Matiz estável por nome, para diferenciar os workspaces na lista sem depender de logo. */
const hue = (text: string) => [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

function Mark({ name, logo, current }: { name: string; logo?: string; current?: boolean }) {
  if (logo) return <img className="ws-mark" src={logo} alt="" />;
  return <span className={`ws-mark${current ? ' current' : ''}`} style={current ? undefined : { ['--ws-hue' as string]: hue(name) }}>{initials(name)}</span>;
}

const UpDown = () => <svg className="ws-updown" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" /></svg>;

type MenuProps = Pick<ReturnType<typeof useWorkspace>, 'workspaces' | 'ownerId' | 'userId' | 'workspaceName' | 'logo' | 'role' | 'demo' | 'platformAdmin' | 'switchWorkspace'> & { onManage?: () => void };

/** Seletor de workspace da barra lateral: mostra o workspace atual e troca entre os disponíveis. */
export function WorkspaceSwitcher({ onManage }: { onManage?: () => void }) {
  return <WorkspaceMenu {...useWorkspace()} onManage={onManage} />;
}

export function WorkspaceMenu({ workspaces, ownerId, userId, workspaceName, logo, role, demo, platformAdmin, switchWorkspace, onManage }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), search = useRef<HTMLInputElement>(null), list = useRef<HTMLDivElement>(null);
  const listId = useId();

  const subtitle = demo ? 'Demonstração local' : ownerId === userId ? (platformAdmin ? 'Agência' : 'Meu workspace') : platformAdmin ? 'Acesso da agência' : roleLabels[role];
  const interactive = !demo && (workspaces.length > 1 || platformAdmin);
  const showSearch = workspaces.length > 5;
  const items = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('pt-BR');
    const sorted = [...workspaces].sort((a, b) => (a.id === ownerId ? -1 : b.id === ownerId ? 1 : a.name.localeCompare(b.name, 'pt-BR')));
    return q ? sorted.filter(w => w.name.toLocaleLowerCase('pt-BR').includes(q)) : sorted;
  }, [workspaces, ownerId, query]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    (showSearch ? search.current : list.current)?.focus();
    return () => document.removeEventListener('pointerdown', close);
  }, [open, showSearch]);
  useEffect(() => { setActive(0); }, [query, open]);
  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' }); }, [active]);

  const choose = (id: string) => { setOpen(false); setQuery(''); if (id !== ownerId) switchWorkspace(id); trigger.current?.focus(); };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); setActive(i => Math.min(items.length - 1, i + 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(i => Math.max(0, i - 1)); }
    else if (event.key === 'Home') { event.preventDefault(); setActive(0); }
    else if (event.key === 'End') { event.preventDefault(); setActive(items.length - 1); }
    else if (event.key === 'Enter' && items[active]) { event.preventDefault(); choose(items[active].id); }
    else if (event.key === 'Tab') setOpen(false);
  };

  const card = <><Mark name={workspaceName} logo={logo} current /><span className="ws-text"><b title={workspaceName}>{workspaceName}</b><small>{subtitle}</small></span></>;
  if (!interactive) return <div className="org-switcher ws-static">{card}<Icon name="building" size={15} /></div>;

  return <div className={`ws-switcher${open ? ' open' : ''}`} ref={root}>
    <button ref={trigger} type="button" className="org-switcher ws-trigger" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined} aria-label={`Trocar workspace (atual: ${workspaceName})`} onClick={() => setOpen(o => !o)} onKeyDown={event => { if (event.key === 'ArrowDown' && !open) { event.preventDefault(); setOpen(true); } }}>
      {card}<UpDown />
    </button>
    {open && <div className="ws-menu" onKeyDown={onKey}>
      <div className="ws-menu-head"><span>Workspaces</span><span className="ws-count">{workspaces.length}</span></div>
      {showSearch && <label className="ws-search"><Icon name="search" size={14} /><input ref={search} value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar workspace…" aria-label="Buscar workspace" aria-controls={listId} aria-activedescendant={items[active] ? `${listId}-${active}` : undefined} /></label>}
      <div className="ws-list" id={listId} role="listbox" aria-label="Workspaces disponíveis" ref={list} tabIndex={showSearch ? -1 : 0} aria-activedescendant={!showSearch && items[active] ? `${listId}-${active}` : undefined}>
        {items.map((w, index) => { const current = w.id === ownerId; return <div key={w.id} id={`${listId}-${index}`} data-index={index} role="option" aria-selected={current} className={`ws-option${index === active ? ' active' : ''}${current ? ' current' : ''}`} onPointerMove={() => setActive(index)} onClick={() => choose(w.id)}>
          <Mark name={w.name} current={current} />
          <span className="ws-text"><b title={w.name}>{w.name}</b><small>{w.id === userId ? 'Meu workspace' : platformAdmin ? 'Cliente' : roleLabels[w.role] ?? 'Compartilhado'}</small></span>
          {current && <Icon name="check" size={15} />}
        </div>; })}
        {!items.length && <p className="ws-empty">Nenhum workspace com “{query.trim()}”.</p>}
      </div>
      {platformAdmin && onManage && <button type="button" className="ws-manage" onClick={() => { setOpen(false); onManage(); }}><Icon name="building" size={15} /><span>Gerenciar clientes</span><Icon name="chevron" size={13} /></button>}
    </div>}
  </div>;
}
