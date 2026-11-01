import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Icon, type IconName } from '../components/ui';
import { useWorkspace } from '../lib/workspace';
import {
  createFields, creatableLabels, defaultStepConfig, describeTrigger, filterOpLabels, MAX_STEPS, newStepId, noValueOps, objectFields, objectLabels, stepHints, stepLabels,
  triggerHints, triggerLabels, weekdays,
  type CreatableObject, type FilterOp, type RunLogEntry, type StepType, type TriggerType, type Workflow, type WorkflowFilter, type WorkflowObject, type WorkflowRun, type WorkflowStep, type WorkflowTrigger,
} from '../lib/workflow-types';
import './workflows.css';

type ListResult = { available: boolean; workflows: Workflow[]; runs: WorkflowRun[] };
const TZ = 'America/Sao_Paulo';
const stepIcon: Record<StepType, IconName> = { condition: 'filter', update_record: 'edit', create_record: 'plus', tag_contact: 'target', send_whatsapp: 'whatsapp', send_email: 'send', http_request: 'globe', ai_generate: 'spark', delay: 'clock', notify: 'bell' };
const triggerIcon: Record<TriggerType, IconName> = { 'record.created': 'plus', 'record.updated': 'edit', 'message.received': 'message', schedule: 'calendar', manual: 'play' };
const statusLabel: Record<Workflow['status'], string> = { draft: 'Rascunho', active: 'Ativa', paused: 'Pausada' };
const runLabel: Record<WorkflowRun['status'], string> = { pending: 'Na fila', running: 'Executando', completed: 'Concluída', failed: 'Falhou', stopped: 'Parada' };
const logLabel: Record<RunLogEntry['status'], string> = { ok: 'ok', failed: 'falhou', skipped: 'não executado', waiting: 'aguardando', stopped: 'parou' };
const errorText = (e: unknown) => e instanceof Error ? e.message : 'Não foi possível concluir a operação.';
const when = (iso: string | null) => iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const stepGroups: { label: string; items: StepType[] }[] = [
  { label: 'Fluxo', items: ['condition', 'delay'] },
  { label: 'Registros', items: ['update_record', 'create_record', 'tag_contact'] },
  { label: 'Comunicação', items: ['send_whatsapp', 'send_email', 'notify'] },
  { label: 'Integrações e IA', items: ['http_request', 'ai_generate'] },
];

const blank = (): Omit<Workflow, 'id' | 'created_at' | 'updated_at' | 'run_count' | 'last_run_at' | 'created_via'> => ({ name: 'Nova automação', description: '', status: 'draft', trigger: { type: 'record.created', object: 'contacts', filters: [] }, steps: [] });

const templates: { title: string; text: string; icon: IconName; build: () => ReturnType<typeof blank> }[] = [
  { title: 'Boas-vindas no WhatsApp', text: 'Novo contato com telefone recebe uma mensagem.', icon: 'whatsapp', build: () => ({ ...blank(), name: 'Boas-vindas para novo lead', trigger: { type: 'record.created', object: 'contacts', filters: [{ field: 'phone', op: 'not_empty' }] }, steps: [{ id: 's1', type: 'send_whatsapp', config: { text: 'Olá, {{contact.name}}! Recebemos seu contato e em breve um especialista fala com você.' } }] }) },
  { title: 'Tarefa na etapa Proposta', text: 'Quando a oportunidade vai para Proposta, cria follow-up em 2 dias.', icon: 'pipeline', build: () => ({ ...blank(), name: 'Follow-up de proposta', trigger: { type: 'record.updated', object: 'deals', fields: ['stage'], filters: [{ field: 'stage', op: 'eq', value: 'proposal' }] }, steps: [{ id: 's1', type: 'create_record', config: { object: 'deal_tasks', fields: { title: 'Fazer follow-up da proposta de {{deal.title}}', due_in_days: 2 } } }] }) },
  { title: 'Oportunidade parada', text: 'Todo dia às 9h, avisa sobre negócios sem mudança há 7 dias.', icon: 'clock', build: () => ({ ...blank(), name: 'Alerta de oportunidade parada', trigger: { type: 'schedule', object: 'deals', schedule: { every: 'day', at: '09:00' }, filters: [{ field: 'stage', op: 'neq', value: 'won' }, { field: 'stage', op: 'neq', value: 'lost' }, { field: 'stage_changed_at', op: 'older_than_days', value: 7 }] }, steps: [{ id: 's1', type: 'notify', config: { title: 'Oportunidade parada há 7 dias: {{deal.title}}' } }, { id: 's2', type: 'create_record', config: { object: 'deal_tasks', fields: { title: 'Retomar contato: {{deal.title}}', due_in_days: 0 } } }] }) },
  { title: 'Lead qualificado → webhook', text: 'Envia o lead para Zapier, n8n ou Make.', icon: 'globe', build: () => ({ ...blank(), name: 'Enviar lead qualificado', trigger: { type: 'record.updated', object: 'contacts', fields: ['status'], filters: [{ field: 'status', op: 'eq', value: 'qualified' }] }, steps: [{ id: 's1', type: 'http_request', config: { method: 'POST', url: 'https://', body: '', headers: {} } }] }) },
];

export default function Workflows({ routeId, go }: { routeId?: string; go?: (page: string) => void }) {
  const { api, role, demo } = useWorkspace();
  const [list, setList] = useState<ListResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { setList(await api<ListResult>('workflows.list')); setError(''); } catch (e) { setError(errorText(e)); }
  }, [api]);
  useEffect(() => { void load(); }, [load, routeId]);
  const open = (id: string) => { window.location.hash = `workflows/${id}`; };
  const create = async (value: ReturnType<typeof blank>) => {
    if (busy) return; setBusy(true); setError('');
    try { const { workflow } = await api<{ workflow: Workflow }>('workflows.save', { workflow: value }); open(workflow.id); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const askAssistant = () => {
    try { sessionStorage.setItem('oliveira-assistant-draft', 'Crie uma automação: quando '); } catch { /* optional */ }
    go?.('overview');
  };

  if (role === 'seller') return <div className="content"><div className="wf-empty"><Icon name="bolt" /><h2>Automações</h2><p>Somente administradores e gestores criam e editam automações.</p></div></div>;
  if (routeId) return <Editor key={routeId} id={decodeURIComponent(routeId)} onChanged={load} />;

  const workflows = list?.workflows || [];
  const names = new Map(workflows.map(w => [w.id, w.name]));
  return <div className="content wf-page">
    <div className="page-header">
      <div><h1 className="page-title">Automações</h1><p className="page-description">Gatilho + passos que rodam sozinhos: quando algo acontece no CRM, a automação atualiza registros, manda mensagens ou chama outros sistemas.</p></div>
      <div className="page-actions">
        {!demo && <button type="button" className="btn" onClick={askAssistant}><Icon name="spark" size={16} />Pedir ao assistente</button>}
        <button type="button" className="btn btn-primary" disabled={busy || list?.available === false} onClick={() => void create(blank())}><Icon name="plus" size={16} />Nova automação</button>
      </div>
    </div>
    {error && <div className="wf-alert" role="alert">{error}</div>}
    {list?.available === false && <div className="wf-alert warn">As automações ainda não estão disponíveis neste workspace. Aplique a migração <code>202611050008_workflows.sql</code> no Supabase.</div>}
    {demo && <div className="wf-alert info">Demonstração: você pode montar automações, mas elas não executam ações. Entre com sua conta para ativá-las.</div>}

    <section className="wf-templates" aria-label="Modelos">
      {templates.map(t => <button type="button" key={t.title} disabled={busy || list?.available === false} onClick={() => void create(t.build())}>
        <span className="wf-template-ico"><Icon name={t.icon} size={16} /></span><b>{t.title}</b><small>{t.text}</small>
      </button>)}
    </section>

    <section className="wf-card">
      <div className="wf-card-head"><h2>Suas automações</h2><span>{workflows.length}</span></div>
      {!list ? <p className="wf-muted">Carregando…</p> : workflows.length === 0 ? <div className="wf-empty small"><Icon name="bolt" /><p>Nenhuma automação ainda. Use um modelo acima, crie do zero ou peça ao assistente da tela inicial: <i>“quando uma oportunidade for ganha, crie uma tarefa de onboarding”</i>.</p></div>
        : <div className="wf-table-wrap"><table className="wf-table">
          <thead><tr><th>Nome</th><th>Gatilho</th><th>Status</th><th>Passos</th><th>Execuções</th><th>Última execução</th></tr></thead>
          <tbody>{workflows.map(w => <tr key={w.id} onClick={() => open(w.id)} tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') open(w.id); }}>
            <td><span className="wf-name"><Icon name="bolt" size={14} />{w.name}{w.created_via === 'assistant' && <em title="Criada pelo assistente de IA"><Icon name="spark" size={11} /></em>}</span></td>
            <td className="wf-muted">{describeTrigger(w.trigger)}</td>
            <td><span className={`wf-status ${w.status}`}>{statusLabel[w.status]}</span></td>
            <td>{w.steps.length}</td><td>{w.run_count}</td><td className="wf-muted">{when(w.last_run_at)}</td>
          </tr>)}</tbody>
        </table></div>}
    </section>

    {(list?.runs?.length || 0) > 0 && <section className="wf-card">
      <div className="wf-card-head"><h2>Execuções recentes</h2></div>
      <RunList runs={list!.runs} names={names} />
    </section>}
  </div>;
}

function RunList({ runs, names, steps }: { runs: WorkflowRun[]; names?: Map<string, string>; steps?: WorkflowStep[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return <ul className="wf-runs">{runs.map(r => <li key={r.id} className={open === r.id ? 'open' : ''}>
    <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
      <span className={`wf-run-dot ${r.status}`} aria-hidden="true" />
      <span className="wf-run-main"><b>{names ? names.get(r.workflow_id) || 'Automação' : runLabel[r.status]}</b><small>{names ? `${runLabel[r.status]} · ` : ''}{r.trigger_kind === 'manual' ? 'manual' : r.trigger_kind === 'schedule' ? 'agendada' : r.trigger_kind}{r.error ? ` · ${r.error}` : ''}</small></span>
      <span className="wf-muted">{when(r.created_at)}</span><Icon name="chevron" size={13} />
    </button>
    {open === r.id && <ol className="wf-log">{r.log.length === 0 ? <li className="wf-muted">{r.status === 'pending' ? `Na fila desde ${when(r.available_at)}.` : 'Sem passos registrados.'}</li> : r.log.map((entry, i) => {
      const step = steps?.find(s => s.id === entry.id);
      return <li key={i} className={entry.status}><span>{entry.id === 'trigger' ? 'Gatilho' : step?.name || stepLabels[entry.type] || entry.type}</span><em>{logLabel[entry.status]}</em><small>{entry.error || entry.detail || ''}</small></li>;
    })}</ol>}
  </li>)}</ul>;
}

type Selection = 'trigger' | string;
function Editor({ id, onChanged }: { id: string; onChanged: () => void }) {
  const { api, demo } = useWorkspace();
  const [saved, setSaved] = useState<Workflow | null>(null);
  const [draft, setDraft] = useState<Workflow | null>(null);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [tab, setTab] = useState<'flow' | 'runs'>('flow');
  const [selected, setSelected] = useState<Selection | null>('trigger');
  const [adding, setAdding] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  /** full=false só atualiza execuções e status, preservando edições não salvas. */
  const load = useCallback(async (full = true) => {
    try {
      const r = await api<{ workflow: Workflow; runs: WorkflowRun[] }>('workflows.get', { id });
      setRuns(r.runs); setSaved(r.workflow); setError('');
      setDraft(d => full || !d ? r.workflow : { ...d, status: r.workflow.status, run_count: r.workflow.run_count, last_run_at: r.workflow.last_run_at });
    } catch (e) { setError(errorText(e)); }
  }, [api, id]);
  useEffect(() => { void load(true); }, [load]);
  const dirty = Boolean(saved && draft && JSON.stringify({ n: draft.name, d: draft.description, t: draft.trigger, s: draft.steps }) !== JSON.stringify({ n: saved.name, d: saved.description, t: saved.trigger, s: saved.steps }));
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (!draft) return <div className="content wf-page"><a className="wf-back" href="#workflows"><Icon name="chevronLeft" size={14} />Automações</a>{error ? <div className="wf-alert" role="alert">{error}</div> : <p className="wf-muted">Carregando…</p>}</div>;

  const patch = (next: Partial<Workflow>) => { setDraft({ ...draft, ...next }); setNotice(''); };
  const setTrigger = (trigger: WorkflowTrigger) => patch({ trigger });
  const setStep = (index: number, step: WorkflowStep) => patch({ steps: draft.steps.map((s, i) => i === index ? step : s) });
  const addStep = (index: number, type: StepType) => {
    const step: WorkflowStep = { id: newStepId(draft.steps), type, config: defaultStepConfig(type) };
    const steps = [...draft.steps]; steps.splice(index, 0, step); patch({ steps }); setSelected(step.id); setAdding(null);
  };
  const moveStep = (index: number, delta: number) => { const steps = [...draft.steps]; const [s] = steps.splice(index, 1); steps.splice(index + delta, 0, s); patch({ steps }); };
  const removeStep = (index: number) => { const steps = draft.steps.filter((_, i) => i !== index); patch({ steps }); setSelected('trigger'); };

  const save = async () => {
    setBusy(true); setError('');
    try { const { workflow } = await api<{ workflow: Workflow }>('workflows.save', { workflow: { id: draft.id, name: draft.name, description: draft.description, trigger: draft.trigger, steps: draft.steps } }); setSaved(workflow); setDraft(workflow); setNotice('Salvo.'); onChanged(); return true; }
    catch (e) { setError(errorText(e)); return false; } finally { setBusy(false); }
  };
  const setStatus = async (status: Workflow['status']) => {
    if (dirty && !(await save())) return;
    if (status === 'active' && !window.confirm(`Ativar “${draft.name}”? A partir de agora ela executa ações reais (${draft.steps.map(s => stepLabels[s.type].toLowerCase()).join(', ')}).`)) return;
    setBusy(true); setError('');
    try { const { workflow } = await api<{ workflow: Workflow }>('workflows.status', { id: draft.id, status }); setSaved(workflow); setDraft(workflow); setNotice(status === 'active' ? 'Automação ativada.' : 'Automação pausada.'); onChanged(); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const runNow = async () => {
    if (dirty && !(await save())) return;
    const needsRecord = draft.trigger.type === 'record.created' || draft.trigger.type === 'record.updated';
    let recordId: string | undefined;
    if (needsRecord || draft.trigger.type === 'manual') {
      const input = window.prompt(needsRecord ? `Execução manual: cole o ID do registro (${objectLabels[draft.trigger.object!].toLowerCase()}) que deve ser usado. O ID aparece no endereço da ficha.` : 'Opcional: cole o ID de um contato para usar como {{contact}} (ou deixe em branco).') ?? null;
      if (input === null) return;
      recordId = input.trim().split('/').pop() || undefined;
      if (needsRecord && !recordId) return;
    }
    if (!window.confirm('Executar agora? As ações são reais (mensagens, atualizações e chamadas externas).')) return;
    setBusy(true); setError('');
    try { await api('workflows.run', { id: draft.id, recordId }); setNotice('Execução iniciada. O resultado aparece em Execuções.'); setTab('runs'); setTimeout(() => void load(false), 2500); setTimeout(() => void load(false), 8000); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!window.confirm(`Excluir “${draft.name}” e todo o histórico de execuções? Esta ação não pode ser desfeita.`)) return;
    setBusy(true);
    try { await api('workflows.delete', { id: draft.id }); onChanged(); window.location.hash = 'workflows'; }
    catch (e) { setError(errorText(e)); setBusy(false); }
  };

  const selectedIndex = draft.steps.findIndex(s => s.id === selected);
  const selectedStep = selectedIndex >= 0 ? draft.steps[selectedIndex] : null;
  return <div className="content wf-page wf-editor-page">
    <div className="wf-editor-head">
      <a className="wf-back" href="#workflows" onClick={e => { if (dirty && !window.confirm('Sair sem salvar as alterações?')) e.preventDefault(); }}><Icon name="chevronLeft" size={14} />Automações</a>
      <div className="wf-title-row">
        <input className="wf-title" aria-label="Nome da automação" value={draft.name} maxLength={120} onChange={e => patch({ name: e.target.value })} />
        <span className={`wf-status ${draft.status}`}>{statusLabel[draft.status]}</span>
        {draft.created_via === 'assistant' && <span className="wf-chip"><Icon name="spark" size={11} />Criada pelo assistente</span>}
        <div className="wf-head-actions">
          {dirty && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>Salvar</button>}
          {!demo && <button type="button" className="btn" disabled={busy} onClick={() => void runNow()} title="Executa uma vez agora"><Icon name="play" size={15} />Executar</button>}
          {draft.status === 'active'
            ? <button type="button" className="btn" disabled={busy} onClick={() => void setStatus('paused')}>Pausar</button>
            : <button type="button" className="btn btn-primary" disabled={busy || demo} onClick={() => void setStatus('active')} title={demo ? 'Indisponível na demonstração' : undefined}><Icon name="bolt" size={15} />Ativar</button>}
          <button type="button" className="btn btn-ghost wf-danger" disabled={busy} onClick={() => void remove()} aria-label="Excluir automação" title="Excluir"><Icon name="trash" size={15} /></button>
        </div>
      </div>
      <input className="wf-desc" aria-label="Descrição" placeholder="Descrição (opcional)" value={draft.description} maxLength={2000} onChange={e => patch({ description: e.target.value })} />
      {error && <div className="wf-alert" role="alert">{error}</div>}
      {notice && !error && <div className="wf-alert ok" role="status">{notice}</div>}
      <div className="wf-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'flow'} className={tab === 'flow' ? 'active' : ''} onClick={() => setTab('flow')}>Fluxo</button>
        <button type="button" role="tab" aria-selected={tab === 'runs'} className={tab === 'runs' ? 'active' : ''} onClick={() => { setTab('runs'); void load(false); }}>Execuções <span>{runs.length}</span></button>
      </div>
    </div>

    {tab === 'runs' ? <section className="wf-card">{runs.length ? <RunList runs={runs} steps={draft.steps} /> : <p className="wf-muted">Nenhuma execução ainda.</p>}</section> :
      <div className="wf-workspace">
        <div className="wf-canvas" onClick={e => { if (e.target === e.currentTarget) setAdding(null); }}>
          <Node icon={triggerIcon[draft.trigger.type]} kicker="Gatilho" title={triggerLabels[draft.trigger.type]} summary={describeTrigger(draft.trigger) + ((draft.trigger.filters?.length || 0) ? ` · ${draft.trigger.filters!.length} condição(ões)` : '')} active={selected === 'trigger'} trigger onClick={() => setSelected('trigger')} />
          {draft.steps.map((step, i) => <div className="wf-node-wrap" key={step.id}>
            <Connector onAdd={() => setAdding(adding === i ? null : i)} open={adding === i} onPick={type => addStep(i, type)} disabled={draft.steps.length >= MAX_STEPS} />
            <Node icon={stepIcon[step.type]} kicker={`Passo ${i + 1}`} title={step.name || stepLabels[step.type]} summary={stepSummary(step)} active={selected === step.id} onClick={() => setSelected(step.id)}
              tools={<>
                <button type="button" aria-label="Mover para cima" disabled={i === 0} onClick={e => { e.stopPropagation(); moveStep(i, -1); }}>↑</button>
                <button type="button" aria-label="Mover para baixo" disabled={i === draft.steps.length - 1} onClick={e => { e.stopPropagation(); moveStep(i, 1); }}>↓</button>
                <button type="button" aria-label="Remover passo" onClick={e => { e.stopPropagation(); removeStep(i); }}><Icon name="trash" size={12} /></button>
              </>} />
          </div>)}
          <Connector end onAdd={() => setAdding(adding === draft.steps.length ? null : draft.steps.length)} open={adding === draft.steps.length} onPick={type => addStep(draft.steps.length, type)} disabled={draft.steps.length >= MAX_STEPS} />
          {draft.steps.length === 0 && <p className="wf-canvas-hint">Adicione o primeiro passo: o que deve acontecer quando o gatilho disparar?</p>}
        </div>
        <aside className="wf-panel" aria-label="Configuração">
          {selected === 'trigger' ? <TriggerForm trigger={draft.trigger} onChange={setTrigger} />
            : selectedStep ? <StepForm key={selectedStep.id} step={selectedStep} index={selectedIndex} trigger={draft.trigger} previous={draft.steps.slice(0, selectedIndex)} onChange={s => setStep(selectedIndex, s)} />
              : <p className="wf-muted">Selecione o gatilho ou um passo para configurar.</p>}
        </aside>
      </div>}
  </div>;
}

function Node({ icon, kicker, title, summary, active, trigger, onClick, tools }: { icon: IconName; kicker: string; title: string; summary: string; active: boolean; trigger?: boolean; onClick: () => void; tools?: ReactNode }) {
  return <div className={`wf-node ${active ? 'active' : ''} ${trigger ? 'trigger' : ''}`} role="button" tabIndex={0} onClick={onClick} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}>
    <span className="wf-node-ico"><Icon name={icon} size={15} /></span>
    <span className="wf-node-text"><small>{kicker}</small><b>{title}</b><span>{summary}</span></span>
    {tools && <span className="wf-node-tools">{tools}</span>}
  </div>;
}
function Connector({ onAdd, open, onPick, end, disabled }: { onAdd: () => void; open: boolean; onPick: (t: StepType) => void; end?: boolean; disabled?: boolean }) {
  return <div className={`wf-connector ${end ? 'end' : ''}`}>
    <i aria-hidden="true" />
    <button type="button" className="wf-add" onClick={e => { e.stopPropagation(); onAdd(); }} disabled={disabled} aria-expanded={open} aria-label="Adicionar passo" title={disabled ? `Máximo de ${MAX_STEPS} passos` : 'Adicionar passo'}><Icon name="plus" size={12} /></button>
    {open && <div className="wf-picker" role="menu">{stepGroups.map(g => <div key={g.label}><small>{g.label}</small>{g.items.map(t => <button type="button" role="menuitem" key={t} onClick={() => onPick(t)}><Icon name={stepIcon[t]} size={14} /><span><b>{stepLabels[t]}</b><em>{stepHints[t]}</em></span></button>)}</div>)}</div>}
  </div>;
}

function stepSummary(s: WorkflowStep): string {
  const c = s.config;
  switch (s.type) {
    case 'condition': return (c.filters as WorkflowFilter[] || []).map(f => `${f.field} ${filterOpLabels[f.op]}${f.value !== undefined && !noValueOps.includes(f.op) ? ` ${f.value}` : ''}`).join(c.match === 'any' ? ' ou ' : ' e ') || 'Sem condições';
    case 'update_record': return `${{ trigger: 'Registro do gatilho', contact: 'Contato', deal: 'Oportunidade' }[c.target as string] || ''}: ${Object.keys(c.fields || {}).join(', ') || 'nenhum campo'}`;
    case 'create_record': return `${creatableLabels[c.object as CreatableObject] || ''}${c.fields?.title || c.fields?.name || c.fields?.content ? `: ${c.fields.title || c.fields.name || c.fields.content}` : ''}`;
    case 'tag_contact': return [...(c.add || []).map((t: string) => `+${t}`), ...(c.remove || []).map((t: string) => `−${t}`)].join(' ') || 'Sem etiquetas';
    case 'send_whatsapp': return c.text || 'Sem texto';
    case 'send_email': return `${c.to} · ${c.subject || 'sem assunto'}`;
    case 'http_request': return `${c.method} ${c.url}`;
    case 'ai_generate': return c.prompt || 'Sem instrução';
    case 'delay': return durationText(Number(c.minutes));
    case 'notify': return c.title || 'Sem título';
  }
}
function durationText(minutes: number) {
  if (minutes >= 1440 && minutes % 1440 === 0) return `${minutes / 1440} dia(s)`;
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60} hora(s)`;
  return `${minutes} minuto(s)`;
}

// ---------- Formulários ----------
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="wf-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
function variablesFor(trigger: WorkflowTrigger, previous: WorkflowStep[]) {
  const vars = ['contact.name', 'contact.email', 'contact.phone', 'contact.company', 'deal.title', 'deal.value', 'deal.stage'];
  if (trigger.object) vars.unshift(...objectFields[trigger.object].slice(0, 4).map(f => `record.${f.key}`));
  if (trigger.type === 'message.received') vars.unshift('record.content', 'record.channel');
  for (const s of previous) { if (s.type === 'ai_generate') vars.push(`steps.${s.id}.text`); if (s.type === 'http_request') vars.push(`steps.${s.id}.body`); }
  return [...new Set([...vars, 'today', 'now'])];
}
function TemplateText({ value, onChange, vars, rows = 0, placeholder, label, hint }: { value: string; onChange: (v: string) => void; vars: string[]; rows?: number; placeholder?: string; label: string; hint?: string }) {
  return <div className="wf-field">
    <span>{label}</span>
    {rows ? <textarea rows={rows} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} /> : <input value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />}
    <div className="wf-vars" aria-label="Inserir variável">{vars.map(v => <button type="button" key={v} onClick={() => onChange(`${value}{{${v}}}`)}>{`{{${v}}}`}</button>)}</div>
    {hint && <small>{hint}</small>}
  </div>;
}

function FilterRows({ filters, onChange, fields, freePath }: { filters: WorkflowFilter[]; onChange: (f: WorkflowFilter[]) => void; fields: { key: string; label: string; options?: Record<string, string> }[]; freePath?: boolean }) {
  const set = (i: number, f: WorkflowFilter) => onChange(filters.map((x, j) => j === i ? f : x));
  return <div className="wf-filters">
    {filters.map((f, i) => {
      const meta = fields.find(x => x.key === f.field);
      return <div className="wf-filter" key={i}>
        <select aria-label="Campo" value={meta ? f.field : freePath ? '__custom' : f.field} onChange={e => set(i, { ...f, field: e.target.value === '__custom' ? '' : e.target.value, value: '' })}>
          {!meta && !freePath && <option value={f.field}>{f.field || 'Escolha…'}</option>}
          {fields.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
          {freePath && <option value="__custom">Outro caminho…</option>}
        </select>
        {!meta && freePath && <input aria-label="Caminho do campo" placeholder="ex.: steps.s2.status" value={f.field} onChange={e => set(i, { ...f, field: e.target.value })} />}
        <select aria-label="Operador" value={f.op} onChange={e => set(i, { ...f, op: e.target.value as FilterOp, value: noValueOps.includes(e.target.value as FilterOp) ? undefined : f.value ?? '' })}>
          {(Object.keys(filterOpLabels) as FilterOp[]).map(op => <option key={op} value={op}>{filterOpLabels[op]}</option>)}
        </select>
        {!noValueOps.includes(f.op) && (meta?.options && ['eq', 'neq'].includes(f.op)
          ? <select aria-label="Valor" value={String(f.value ?? '')} onChange={e => set(i, { ...f, value: e.target.value })}><option value="">Escolha…</option>{Object.entries(meta.options).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          : <input aria-label="Valor" type={['older_than_days', 'newer_than_days'].includes(f.op) ? 'number' : 'text'} min={0} value={String(f.value ?? '')} placeholder={['older_than_days', 'newer_than_days'].includes(f.op) ? 'dias' : 'valor'} onChange={e => set(i, { ...f, value: ['older_than_days', 'newer_than_days'].includes(f.op) ? Number(e.target.value) : e.target.value })} />)}
        <button type="button" className="wf-x" aria-label="Remover condição" onClick={() => onChange(filters.filter((_, j) => j !== i))}><Icon name="close" size={12} /></button>
      </div>;
    })}
    <button type="button" className="wf-link" onClick={() => onChange([...filters, { field: fields[0]?.key || '', op: 'eq', value: '' }])} disabled={filters.length >= 10}><Icon name="plus" size={12} />Adicionar condição</button>
  </div>;
}

function TriggerForm({ trigger, onChange }: { trigger: WorkflowTrigger; onChange: (t: WorkflowTrigger) => void }) {
  const setType = (type: TriggerType) => {
    if (type === 'record.created' || type === 'record.updated') onChange({ type, object: trigger.object || 'contacts', filters: trigger.object ? trigger.filters || [] : [] });
    else if (type === 'message.received') onChange({ type, channel: '', filters: [] });
    else if (type === 'schedule') onChange({ type, schedule: { every: 'day', at: '09:00' }, filters: [] });
    else onChange({ type });
  };
  const fields = trigger.type === 'message.received' ? [{ key: 'content', label: 'Texto da mensagem' }, { key: 'channel', label: 'Canal' }] : trigger.object ? objectFields[trigger.object] : [];
  return <div className="wf-form">
    <header><span className="wf-node-ico"><Icon name={triggerIcon[trigger.type]} size={15} /></span><div><small>Gatilho</small><h3>Quando a automação começa</h3></div></header>
    <div className="wf-trigger-types">{(Object.keys(triggerLabels) as TriggerType[]).map(t => <button type="button" key={t} className={trigger.type === t ? 'active' : ''} onClick={() => setType(t)}><Icon name={triggerIcon[t]} size={14} /><span><b>{triggerLabels[t]}</b><em>{triggerHints[t]}</em></span></button>)}</div>
    {(trigger.type === 'record.created' || trigger.type === 'record.updated' || trigger.type === 'schedule' || trigger.type === 'manual') && <Field label={trigger.type === 'schedule' ? 'Percorrer registros (opcional)' : trigger.type === 'manual' ? 'Registro usado (opcional)' : 'Objeto'} hint={trigger.type === 'schedule' ? 'Com um objeto, a automação roda uma vez para cada registro que atende às condições (até 100 por disparo).' : undefined}>
      <select value={trigger.object || ''} onChange={e => onChange({ ...trigger, object: (e.target.value || undefined) as WorkflowObject | undefined, fields: [], filters: [] })}>
        {(trigger.type === 'schedule' || trigger.type === 'manual') && <option value="">Nenhum</option>}
        {(Object.keys(objectLabels) as WorkflowObject[]).map(o => <option key={o} value={o}>{objectLabels[o]}</option>)}
      </select>
    </Field>}
    {trigger.type === 'record.updated' && trigger.object && <div className="wf-field"><span>Só quando estes campos mudarem</span>
      <div className="wf-checks">{objectFields[trigger.object].filter(f => f.key !== 'created_at').map(f => <label key={f.key}><input type="checkbox" checked={trigger.fields?.includes(f.key) || false} onChange={e => onChange({ ...trigger, fields: e.target.checked ? [...(trigger.fields || []), f.key] : (trigger.fields || []).filter(x => x !== f.key) })} />{f.label}</label>)}</div>
      <small>Nenhum marcado = qualquer mudança.</small></div>}
    {trigger.type === 'message.received' && <Field label="Canal"><select value={trigger.channel || ''} onChange={e => onChange({ ...trigger, channel: e.target.value as WorkflowTrigger['channel'] })}><option value="">Todos</option><option value="whatsapp">WhatsApp</option><option value="email">E-mail</option><option value="instagram">Instagram</option><option value="widget">Widget do site</option></select></Field>}
    {trigger.type === 'schedule' && <div className="wf-row">
      <Field label="Frequência"><select value={trigger.schedule?.every || 'day'} onChange={e => onChange({ ...trigger, schedule: { every: e.target.value as 'hour', at: trigger.schedule?.at || '09:00', weekday: trigger.schedule?.weekday ?? 1 } })}><option value="hour">A cada hora</option><option value="day">Todo dia</option><option value="week">Toda semana</option></select></Field>
      {trigger.schedule?.every === 'week' && <Field label="Dia"><select value={trigger.schedule.weekday ?? 1} onChange={e => onChange({ ...trigger, schedule: { ...trigger.schedule!, weekday: Number(e.target.value) } })}>{weekdays.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></Field>}
      {trigger.schedule?.every !== 'hour' && <Field label="Horário"><input type="time" value={trigger.schedule?.at || '09:00'} onChange={e => onChange({ ...trigger, schedule: { ...trigger.schedule!, at: e.target.value } })} /></Field>}
    </div>}
    {fields.length > 0 && trigger.type !== 'manual' && <div className="wf-field"><span>Condições {trigger.type === 'schedule' ? 'dos registros' : '(opcional)'}</span><FilterRows filters={trigger.filters || []} fields={fields} onChange={filters => onChange({ ...trigger, filters })} /></div>}
    {trigger.type === 'schedule' && <p className="wf-note">O agendador do servidor verifica as automações a cada poucos minutos; o disparo acontece na primeira verificação depois do horário.</p>}
  </div>;
}

function StepForm({ step, index, trigger, previous, onChange }: { step: WorkflowStep; index: number; trigger: WorkflowTrigger; previous: WorkflowStep[]; onChange: (s: WorkflowStep) => void }) {
  const c = step.config, vars = useMemo(() => variablesFor(trigger, previous), [trigger, previous]);
  const set = (config: Record<string, any>) => onChange({ ...step, config: { ...c, ...config } });
  return <div className="wf-form">
    <header><span className="wf-node-ico"><Icon name={stepIcon[step.type]} size={15} /></span><div><small>Passo {index + 1} · {stepLabels[step.type]}</small><h3>{stepHints[step.type]}</h3></div></header>
    <Field label="Nome do passo (opcional)"><input value={step.name || ''} maxLength={80} placeholder={stepLabels[step.type]} onChange={e => onChange({ ...step, name: e.target.value || undefined })} /></Field>
    {step.type === 'condition' && <ConditionForm config={c} trigger={trigger} previous={previous} onChange={set} />}
    {step.type === 'update_record' && <UpdateForm config={c} trigger={trigger} vars={vars} onChange={set} />}
    {step.type === 'create_record' && <CreateForm config={c} vars={vars} onChange={set} />}
    {step.type === 'tag_contact' && <>
      <Field label="Adicionar etiquetas" hint="Separe por vírgula."><input value={(c.add || []).join(', ')} onChange={e => set({ add: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })} /></Field>
      <Field label="Remover etiquetas" hint="Separe por vírgula."><input value={(c.remove || []).join(', ')} onChange={e => set({ remove: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })} /></Field>
    </>}
    {step.type === 'send_whatsapp' && <><TemplateText label="Mensagem" rows={5} value={c.text || ''} vars={vars} onChange={text => set({ text })} hint="Vai para o telefone do contato relacionado, pela fila do WhatsApp, com a assinatura “Equipe”. A fila aceita não prova entrega." /></>}
    {step.type === 'send_email' && <>
      <TemplateText label="Para" value={c.to || ''} vars={['contact.email']} onChange={to => set({ to })} />
      <TemplateText label="Assunto" value={c.subject || ''} vars={vars} onChange={subject => set({ subject })} />
      <TemplateText label="Texto" rows={6} value={c.text || ''} vars={vars} onChange={text => set({ text })} hint="Enviado pela conta Google conectada em Configurações, respeitando horário e limite diário de e-mails." />
    </>}
    {step.type === 'http_request' && <HttpForm config={c} vars={vars} onChange={set} />}
    {step.type === 'ai_generate' && <TemplateText label="Instrução para a IA" rows={6} value={c.prompt || ''} vars={vars} onChange={prompt => set({ prompt })} placeholder="Ex.: Escreva uma mensagem curta de boas-vindas para {{contact.name}}, da empresa {{contact.company}}." hint={`O texto gerado fica disponível nos próximos passos como {{steps.${step.id}.text}}. Cada execução conta no limite diário de IA.`} />}
    {step.type === 'delay' && <DelayForm minutes={Number(c.minutes) || 60} onChange={minutes => set({ minutes })} />}
    {step.type === 'notify' && <TemplateText label="Título da notificação" value={c.title || ''} vars={vars} onChange={title => set({ title })} hint="Aparece no sino do painel (para o responsável do contato, quando houver)." />}
  </div>;
}

function ConditionForm({ config, trigger, previous, onChange }: { config: Record<string, any>; trigger: WorkflowTrigger; previous: WorkflowStep[]; onChange: (c: Record<string, any>) => void }) {
  const fields = useMemo(() => {
    const out: { key: string; label: string; options?: Record<string, string> }[] = [];
    if (trigger.object) out.push(...objectFields[trigger.object].map(f => ({ key: `record.${f.key}`, label: `${objectLabels[trigger.object!]}: ${f.label}`, options: f.options })));
    if (trigger.object !== 'contacts') out.push(...objectFields.contacts.map(f => ({ key: `contact.${f.key}`, label: `Contato: ${f.label}`, options: f.options })));
    if (trigger.object !== 'deals') out.push(...objectFields.deals.map(f => ({ key: `deal.${f.key}`, label: `Oportunidade: ${f.label}`, options: f.options })));
    for (const s of previous) if (s.type === 'ai_generate') out.push({ key: `steps.${s.id}.text`, label: `Texto da IA (${s.id})` });
    return out;
  }, [trigger, previous]);
  return <>
    <Field label="Continuar quando"><select value={config.match || 'all'} onChange={e => onChange({ match: e.target.value })}><option value="all">Todas as condições valerem</option><option value="any">Qualquer condição valer</option></select></Field>
    <div className="wf-field"><span>Condições</span><FilterRows filters={config.filters || []} fields={fields} freePath onChange={filters => onChange({ filters })} /></div>
  </>;
}
function UpdateForm({ config, trigger, vars, onChange }: { config: Record<string, any>; trigger: WorkflowTrigger; vars: string[]; onChange: (c: Record<string, any>) => void }) {
  const target = config.target || (trigger.object ? 'trigger' : 'contact');
  const object: WorkflowObject = target === 'contact' ? 'contacts' : target === 'deal' ? 'deals' : trigger.object || 'contacts';
  const writable = objectFields[object].filter(f => f.writable);
  const fields = Object.entries(config.fields || {}) as [string, any][];
  const setFields = (entries: [string, any][]) => onChange({ target, fields: Object.fromEntries(entries) });
  return <>
    <Field label="Registro a atualizar"><select value={target} onChange={e => onChange({ target: e.target.value, fields: {} })}>
      {trigger.object && <option value="trigger">{objectLabels[trigger.object]} do gatilho</option>}
      {trigger.object !== 'contacts' && <option value="contact">Contato relacionado</option>}
      {trigger.object !== 'deals' && <option value="deal">Oportunidade relacionada</option>}
    </select></Field>
    <div className="wf-field"><span>Campos</span>
      {fields.map(([key, value], i) => {
        const meta = writable.find(f => f.key === key);
        return <div className="wf-filter" key={i}>
          <select aria-label="Campo" value={key} onChange={e => setFields(fields.map((x, j) => j === i ? [e.target.value, ''] : x))}>{writable.filter(f => f.key === key || !fields.some(([k]) => k === f.key)).map(f => <option key={f.key} value={f.key}>{f.label}</option>)}</select>
          {meta?.options ? <select aria-label="Valor" value={String(value ?? '')} onChange={e => setFields(fields.map((x, j) => j === i ? [key, e.target.value] : x))}><option value="">Escolha…</option>{Object.entries(meta.options).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            : <input aria-label="Valor" value={String(value ?? '')} placeholder={meta?.kind === 'number' ? 'número ou {{variável}}' : meta?.kind === 'date' ? 'AAAA-MM-DD' : 'texto ou {{variável}}'} onChange={e => setFields(fields.map((x, j) => j === i ? [key, e.target.value] : x))} />}
          <button type="button" className="wf-x" aria-label="Remover campo" onClick={() => setFields(fields.filter((_, j) => j !== i))}><Icon name="close" size={12} /></button>
        </div>;
      })}
      {writable.some(f => !fields.some(([k]) => k === f.key)) && <button type="button" className="wf-link" onClick={() => setFields([...fields, [writable.find(f => !fields.some(([k]) => k === f.key))!.key, '']])}><Icon name="plus" size={12} />Adicionar campo</button>}
      <small>Variáveis: {vars.slice(0, 6).map(v => `{{${v}}}`).join(' ')}</small>
    </div>
  </>;
}
function CreateForm({ config, vars, onChange }: { config: Record<string, any>; vars: string[]; onChange: (c: Record<string, any>) => void }) {
  const object = (config.object || 'deal_tasks') as CreatableObject;
  return <>
    <Field label="Criar" hint={object === 'deal_tasks' || object === 'deal_notes' ? 'Vinculada à oportunidade relacionada ao gatilho.' : object === 'contact_notes' ? 'Vinculada ao contato relacionado.' : object === 'deals' ? 'Vinculada ao contato relacionado, quando houver.' : undefined}>
      <select value={object} onChange={e => onChange({ object: e.target.value, fields: {} })}>{(Object.keys(creatableLabels) as CreatableObject[]).map(o => <option key={o} value={o}>{creatableLabels[o]}</option>)}</select>
    </Field>
    {createFields[object].map(f => f.kind === 'enum' ? <Field key={f.key} label={f.label}><select value={String(config.fields?.[f.key] ?? '')} onChange={e => onChange({ fields: { ...config.fields, [f.key]: e.target.value } })}><option value="">Padrão</option>{Object.entries(f.options || {}).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      : f.kind === 'number' ? <Field key={f.key} label={f.label}><input type="text" inputMode="decimal" value={String(config.fields?.[f.key] ?? '')} onChange={e => onChange({ fields: { ...config.fields, [f.key]: e.target.value } })} /></Field>
        : <TemplateText key={f.key} label={`${f.label}${f.required ? ' *' : ''}`} rows={f.key === 'content' || f.key === 'notes' || f.key === 'description' ? 3 : 0} value={String(config.fields?.[f.key] ?? '')} vars={vars} onChange={v => onChange({ fields: { ...config.fields, [f.key]: v } })} />)}
  </>;
}
function HttpForm({ config, vars, onChange }: { config: Record<string, any>; vars: string[]; onChange: (c: Record<string, any>) => void }) {
  const headers = Object.entries(config.headers || {}) as [string, string][];
  const setHeaders = (h: [string, string][]) => onChange({ headers: Object.fromEntries(h) });
  return <>
    <div className="wf-row"><Field label="Método"><select value={config.method || 'POST'} onChange={e => onChange({ method: e.target.value })}>{['POST', 'GET', 'PUT', 'PATCH'].map(m => <option key={m}>{m}</option>)}</select></Field>
      <Field label="URL"><input value={config.url || ''} placeholder="https://hooks.zapier.com/…" onChange={e => onChange({ url: e.target.value })} /></Field></div>
    {config.method !== 'GET' && <TemplateText label="Corpo (opcional)" rows={6} value={config.body || ''} vars={vars} onChange={body => onChange({ body })} placeholder={'{"nome": "{{contact.name}}", "email": "{{contact.email}}"}'} hint="Vazio = envia em JSON o registro do gatilho, o contato, a oportunidade e os resultados dos passos." />}
    <div className="wf-field"><span>Cabeçalhos (opcional)</span>
      {headers.map(([k, v], i) => <div className="wf-filter" key={i}><input aria-label="Cabeçalho" value={k} placeholder="Authorization" onChange={e => setHeaders(headers.map((x, j) => j === i ? [e.target.value, x[1]] : x))} /><input aria-label="Valor" value={v} onChange={e => setHeaders(headers.map((x, j) => j === i ? [x[0], e.target.value] : x))} /><button type="button" className="wf-x" aria-label="Remover cabeçalho" onClick={() => setHeaders(headers.filter((_, j) => j !== i))}><Icon name="close" size={12} /></button></div>)}
      {headers.length < 5 && <button type="button" className="wf-link" onClick={() => setHeaders([...headers, ['', '']])}><Icon name="plus" size={12} />Adicionar cabeçalho</button>}
      <small>Só endpoints HTTPS públicos. A resposta fica disponível como {'{{steps.<id>.body}}'}. Cabeçalhos ficam salvos na automação; prefira tokens de uso restrito.</small>
    </div>
  </>;
}
function DelayForm({ minutes, onChange }: { minutes: number; onChange: (m: number) => void }) {
  const unit = minutes % 1440 === 0 ? 1440 : minutes % 60 === 0 ? 60 : 1;
  return <div className="wf-row">
    <Field label="Esperar"><input type="number" min={1} value={minutes / unit} onChange={e => onChange(Math.max(1, Math.round(Number(e.target.value) || 1)) * unit)} /></Field>
    <Field label="Unidade"><select value={unit} onChange={e => onChange(Math.max(1, Math.round(minutes / unit)) * Number(e.target.value))}><option value={1}>minutos</option><option value={60}>horas</option><option value={1440}>dias</option></select></Field>
  </div>;
}
