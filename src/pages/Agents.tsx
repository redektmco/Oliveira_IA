import { useEffect, useState, type FormEvent } from 'react';
import { useWorkspace } from '../lib/workspace';
import { agentTones, defaultWeights, type Agent, type AgentTone, type CriteriaWeights, type RowInput } from '../lib/types';
import './ai.css';

const blankAgent = (): RowInput<'agents'> => ({
  name: 'Felipa', company: '', greeting: 'Olá! Sou a Felipa, assistente virtual da empresa. Como posso ajudar?',
  system_prompt: 'Você é uma assistente comercial consultiva. Apresente-se como inteligência artificial. Entenda a necessidade do contato, faça uma pergunta de cada vez e use apenas informações confirmadas na base de conhecimento. Quando faltar uma informação, diga que precisa confirmar com a equipe. Nunca invente preços, condições ou disponibilidade de agenda.',
  model: 'claude-haiku-5-5', active: true, qualification_threshold: 75,
});

const errorText = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível concluir a operação. Tente novamente.';

export default function Agents() {
  const { data, demo, loading, create, update, remove } = useWorkspace();
  const [editing, setEditing] = useState<Agent | 'new' | null>(null);
  const [form, setForm] = useState<RowInput<'agents'>>(blankAgent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!editing) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) setEditing(null); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [editing, busy]);

  const openEditor = (agent?: Agent) => {
    setError('');
    setEditing(agent ?? 'new');
    setForm(agent ? {
      name: agent.name, company: agent.company, system_prompt: agent.system_prompt,
      greeting: agent.greeting, model: agent.model.startsWith('claude-haiku-4-5') ? 'claude-haiku-5-5' : agent.model, active: agent.active,
      qualification_threshold: agent.qualification_threshold,
      ...(agent.tone ? { tone: agent.tone, criteria_weights: agent.criteria_weights ?? defaultWeights } : {}),
    } : blankAgent());
  };

  const weights: CriteriaWeights = { ...defaultWeights, ...(form.criteria_weights ?? {}) };
  const weightTotal = weights.budget + weights.need + weights.authority + weights.timing;
  const setWeight = (key: keyof CriteriaWeights, v: number) => setForm({ ...form, tone: form.tone ?? 'consultive', criteria_weights: { ...weights, [key]: Math.max(0, Math.min(100, Math.round(v || 0))) } });

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing || busy) return;
    setError('');
    setBusy(true);
    try {
      const value = { ...form, name: form.name.trim(), company: form.company.trim(), system_prompt: form.system_prompt.trim(), greeting: form.greeting.trim() };
      if (!value.name || !value.company || !value.system_prompt) throw new Error('Preencha nome, empresa e instruções do agente.');
      if (weightTotal <= 0) throw new Error('Defina peso maior que zero em pelo menos um critério.');
      if (!Number.isInteger(value.qualification_threshold) || value.qualification_threshold < 0 || value.qualification_threshold > 100) throw new Error('O limite de qualificação precisa estar entre 0 e 100.');
      // Agentes de contas sem a migração de tom/pesos continuam salvando como antes.
      const customized = value.tone !== undefined && (value.tone !== 'consultive' || Object.values(weights).some((v, i) => v !== Object.values(defaultWeights)[i]) || (editing !== 'new' && editing.tone !== undefined));
      if (!customized) { delete value.tone; delete value.criteria_weights; } else value.criteria_weights = weights;
      if (editing === 'new') await create('agents', value);
      else await update('agents', editing.id, value);
      setEditing(null);
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  };

  const deleteAgent = async (agent: Agent) => {
    if (busy) return;
    if (data.conversations.some(conversation => conversation.agent_id === agent.id)) {
      setError('Este agente está vinculado a conversas. Pause o agente ou exclua as conversas vinculadas antes de removê-lo.');
      return;
    }
    if (!window.confirm(`Excluir o agente “${agent.name}”? Esta ação não pode ser desfeita.`)) return;
    setBusy(true); setError('');
    try { await remove('agents', agent.id); }
    catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  };

  return <div className="content ai-page">
    <div className="page-header"><div><h1 className="page-title">Agentes de IA</h1><p className="page-description">Configure a identidade e as instruções que o Claude usa nas conversas.</p></div><div className="page-actions"><button className="btn btn-primary" onClick={() => openEditor()} disabled={busy}>+ Criar agente</button></div></div>
    {demo && <div className="ai-note">Configurações neste modo são locais. Para conversar com o Claude, conecte a aplicação aos serviços na página de Integrações.</div>}
    {error && !editing && <div className="ai-alert" role="alert">{error}</div>}
    <div className="agent-stats"><div className="card"><span>Agentes ativos</span><b>{data.agents.filter(a => a.active).length}</b><small>de {data.agents.length} configurados</small></div><div className="card"><span>Conversas internas</span><b>{data.conversations.length}</b><small>Registradas neste workspace</small></div><div className="card"><span>Respostas da IA</span><b>{data.messages.filter(m => m.role === 'assistant').length}</b><small>Em conversas salvas</small></div><div className="card"><span>Chamadas concluídas</span><b>{data.ai_usage.filter(u => u.status === 'completed').length}</b><small>Inclui testes no Playground</small></div></div>
    {loading ? <p role="status">Carregando agentes...</p> : !data.agents.length ? <div className="card ai-empty"><b>Seu primeiro agente começa aqui</b><p>Defina sua empresa e suas orientações comerciais. Depois, teste a conversa no Playground.</p><button className="btn btn-primary" onClick={() => openEditor()}>Criar primeiro agente</button></div> : <div className="agents-grid">{data.agents.map(agent => <article className="card agent-card" key={agent.id}>
      <div className="agent-top"><div className="agent-icon tone-0" aria-hidden="true">✦</div><span className={`badge badge-${agent.active ? 'success' : 'warning'}`}>{agent.active ? 'Ativo' : 'Pausado'}</span></div>
      <h2 className="agent-name">{agent.name}</h2><span>{agent.company}</span>
      <p className="ai-muted">{agent.greeting || 'Sem mensagem de apresentação.'}</p>
      <div className="agent-phone">{agent.model}</div>
      <div className="agent-metrics"><div><span>Conversas</span><b>{data.conversations.filter(c => c.agent_id === agent.id).length}</b></div><div><span>Limite de score</span><b>{agent.qualification_threshold} / 100</b></div><div><span>Canal</span><b>Web interno</b></div></div>
      <div className="agent-actions"><button className="btn grow" disabled={busy} onClick={() => openEditor(agent)}>Editar agente</button><button className="btn btn-danger" disabled={busy} onClick={() => { void deleteAgent(agent); }}>Excluir</button></div>
    </article>)}</div>}
    {editing && <div className="modal-overlay"><section className="modal ai-modal" role="dialog" aria-modal="true" aria-labelledby="agent-editor-title">
      <form onSubmit={event => { void save(event); }} className="ai-form">
        <div className="modal-head"><div><h2 id="agent-editor-title" className="page-title">{editing === 'new' ? 'Criar agente' : 'Editar agente'}</h2><p className="ai-muted">As alterações salvas valem nas próximas respostas.</p></div><button type="button" className="btn btn-ghost" aria-label="Fechar editor" onClick={() => setEditing(null)} disabled={busy}>✕</button></div>
        <div className="modal-body">
          {error && <div className="ai-alert" role="alert">{error}</div>}
          <div className="ai-grid"><label className="ai-field">Nome do agente<input autoFocus required maxLength={120} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label><label className="ai-field">Empresa representada<input required maxLength={200} value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} /></label></div>
          <label className="ai-field">Mensagem de apresentação<textarea maxLength={2000} rows={3} value={form.greeting} onChange={e => setForm({ ...form, greeting: e.target.value })} /><small>A apresentação orienta a IA e não é enviada automaticamente ao criar uma conversa.</small></label>
          <label className="ai-field">Instruções comerciais<textarea required maxLength={12000} rows={8} value={form.system_prompt} onChange={e => setForm({ ...form, system_prompt: e.target.value })} /><small>{form.system_prompt.length.toLocaleString('pt-BR')} / 12.000 caracteres. Descreva objetivos, tom de voz, critérios de qualificação e quando encaminhar para uma pessoa.</small></label>
          <fieldset className="ai-channel-choice"><legend>Tom de voz</legend>{(Object.keys(agentTones) as AgentTone[]).map(key => <label key={key} className={(form.tone ?? 'consultive') === key ? 'selected' : ''}><input type="radio" name="tone" checked={(form.tone ?? 'consultive') === key} onChange={() => setForm({ ...form, tone: key, criteria_weights: weights })} /><span><b>{agentTones[key].label}</b><small>{agentTones[key].hint}</small></span></label>)}</fieldset>
          <fieldset className="ai-weights"><legend>Peso de cada critério na nota</legend>
            {([['budget', 'Orçamento'], ['need', 'Necessidade'], ['authority', 'Autoridade'], ['timing', 'Prazo']] as const).map(([key, label]) => <label key={key} className="ai-weight"><span>{label}</span><input type="range" min={0} max={100} step={5} value={weights[key]} onChange={e => setWeight(key, Number(e.target.value))} aria-label={`Peso de ${label}`} /><b>{weightTotal ? Math.round(weights[key] / weightTotal * 100) : 0}%</b></label>)}
            <small>A nota do lead é a média ponderada dos quatro critérios. Os pesos são proporcionais: o que importa é a relação entre eles.</small></fieldset>
          <div className="ai-grid"><label className="ai-field">Modelo Claude<select value={form.model} onChange={e => setForm({ ...form, model: e.target.value })}><option value="claude-haiku-5-5">Haiku 5.5 — rápido e econômico</option><option value="claude-sonnet-4-6">Sonnet 4.6</option></select></label><label className="ai-field">Limite de qualificação (0–100)<input type="number" min={0} max={100} step={1} required value={form.qualification_threshold} onChange={e => setForm({ ...form, qualification_threshold: Number(e.target.value) })} /><small>Referência para qualificação manual; não altera o score de contatos automaticamente.</small></label></div>
          <label className="ai-check"><input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} /> Agente ativo para receber mensagens</label>
          <p className="ai-muted">A chave da Anthropic fica apenas no servidor. As conversas enviadas à IA podem conter dados dos seus contatos; use somente informações necessárias.</p>
        </div><div className="modal-footer"><button type="button" className="btn" disabled={busy} onClick={() => setEditing(null)}>Cancelar</button><button className="btn btn-primary" disabled={busy} type="submit">{busy ? 'Salvando...' : 'Salvar agente'}</button></div>
      </form>
    </section></div>}
  </div>;
}
