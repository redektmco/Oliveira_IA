import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useWorkspace } from '../lib/workspace';
import './ai.css';

type Turn = { role: 'user' | 'assistant'; content: string };

function recentContext(turns: Turn[]): Turn[] {
  const context = turns.slice(-20).map((turn) => ({ ...turn, content: turn.content.slice(0, 4000) }));
  while (context.reduce((total, turn) => total + turn.content.length, 0) > 24000) context.shift();
  return context;
}

export default function Playground() {
  const { data, demo, askClaude } = useWorkspace();
  const [agentId, setAgentId] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const [usage, setUsage] = useState({ input_tokens: 0, output_tokens: 0 });
  const bottom = useRef<HTMLDivElement>(null);
  const activeAgents = data.agents.filter((agent) => agent.active);
  const agent = activeAgents.find((item) => item.id === agentId);

  useEffect(() => {
    if (!activeAgents.some((item) => item.id === agentId)) {
      setAgentId(activeAgents[0]?.id ?? '');
      setTurns([]);
    }
  }, [data.agents, agentId]);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [turns, pending]);

  const reset = () => {
    setTurns([]);
    setDraft('');
    setError('');
    setUsage({ input_tokens: 0, output_tokens: 0 });
  };

  async function send(event: FormEvent) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || !agent || pending) return;
    setError('');
    setPending(message);
    try {
      const response = await askClaude({ agentId: agent.id, message, history: recentContext(turns) });
      setTurns((current) => [...current, { role: 'user', content: message }, { role: 'assistant', content: response.text }]);
      setUsage((current) => ({ input_tokens: current.input_tokens + response.usage.input_tokens, output_tokens: current.output_tokens + response.usage.output_tokens }));
      setDraft('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível consultar o Claude. Tente novamente.');
    } finally {
      setPending('');
    }
  }

  return <div className="content ai-page">
    <div className="page-header"><div><h1 className="page-title">Agent Playground</h1><p className="page-description">Converse com seu agente antes de colocá-lo em operação.</p></div><button className="btn" onClick={reset} disabled={Boolean(pending) || turns.length === 0}>Limpar conversa</button></div>
    <div className="ai-note">{demo ? 'Modo demonstração: configure Supabase e a API Anthropic para receber respostas reais.' : 'Teste interno com consumo da API Anthropic. Nenhuma mensagem é enviada ao WhatsApp.'}</div>
    <div className="ai-playground-layout">
      <aside className="card ai-playground-config">
        <label className="ai-field"><span>Agente ativo</span><select value={agentId} onChange={(event) => { setAgentId(event.target.value); reset(); }} disabled={Boolean(pending) || activeAgents.length === 0}><option value="" disabled>Selecione um agente</option>{activeAgents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        {agent ? <><div className="ai-config-detail"><span>Empresa</span><b>{agent.company || 'Não informada'}</b></div><div className="ai-config-detail"><span>Modelo</span><b>{agent.model}</b></div><div className="ai-config-detail"><span>Conhecimento disponível</span><b>{data.knowledge.length} {data.knowledge.length === 1 ? 'documento' : 'documentos'}</b></div><p className="ai-muted">O servidor usa as instruções salvas do agente e o conteúdo cadastrado na base de conhecimento.</p></> : <p className="ai-muted">Crie e ative um agente na área Agentes de IA para começar.</p>}
        <div className="ai-token-summary"><span>Tokens neste teste</span><b>{(usage.input_tokens + usage.output_tokens).toLocaleString('pt-BR')}</b><small>Entrada: {usage.input_tokens.toLocaleString('pt-BR')} · Saída: {usage.output_tokens.toLocaleString('pt-BR')}</small></div>
        <p className="ai-muted">O contexto usa até 20 mensagens recentes, limitado a 24 mil caracteres e 4 mil por mensagem. Este teste não cadastra contatos nem agenda reuniões.</p>
      </aside>
      <section className="card ai-playground-chat" aria-label="Conversa de teste">
        <div className="ai-chat-heading"><span className="ai-spark" aria-hidden="true">✦</span><div><b>{agent?.name ?? 'Seu agente de IA'}</b><span>{pending ? 'Claude está respondendo…' : 'Ambiente de teste'}</span></div></div>
        <div className="ai-chat-messages" aria-live="polite" aria-busy={Boolean(pending)}>
          {turns.length === 0 && !pending && <div className="ai-empty"><span className="ai-empty-symbol" aria-hidden="true">✦</span><h2>Teste uma conversa comercial</h2><p>Escreva como um potencial cliente. A resposta seguirá a configuração do agente.</p>{agent?.greeting && <blockquote>{agent.greeting}</blockquote>}</div>}
          {turns.map((turn, index) => <div className={`ai-chat-bubble ${turn.role}`} key={index}><span>{turn.role === 'user' ? 'Você · Cliente de teste' : `${agent?.name ?? 'Agente'} · Claude`}</span><p>{turn.content}</p></div>)}
          {pending && <><div className="ai-chat-bubble user"><span>Você · Cliente de teste</span><p>{pending}</p></div><div className="ai-chat-pending" role="status">Gerando resposta…</div></>}
          <div ref={bottom} />
        </div>
        <form className="ai-chat-composer" onSubmit={send}>
          {error && <div className="ai-alert" role="alert">{error}</div>}
          <label className="ai-field"><span className="ai-sr-only">Mensagem de teste</span><textarea maxLength={4000} rows={3} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ex.: Tenho uma equipe de 6 vendedores e quero melhorar o atendimento…" disabled={Boolean(pending) || !agent} /></label>
          <div className="ai-actions"><small className="ai-muted">{draft.length}/4.000 caracteres</small><button className="btn btn-primary" disabled={Boolean(pending) || !draft.trim() || !agent || demo}>{pending ? 'Enviando…' : 'Enviar ao Claude'}</button></div>
        </form>
      </section>
    </div>
  </div>;
}
