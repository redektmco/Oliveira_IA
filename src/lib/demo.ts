import { emptyState, type DatabaseState, type Deal, type DealStage } from './types';

const key = 'oliveira-ia-demo-v1';
export function loadDemo(): DatabaseState {
  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (['contacts','deals','agents','knowledge','conversations','messages','meetings','ai_usage'].every(k => Array.isArray(parsed[k]))) {
        // Upgrade only the original sample identity; retain saved CRM data and custom agents.
        const data = {...emptyState(), ...parsed} as DatabaseState;
        return {...data, agents: data.agents.map(agent => agent.id === 'demo-agent' && agent.name === 'Ana SDR'
          ? {...agent, name: 'Felipa', greeting: agent.greeting === 'Olá! Sou a Ana, assistente virtual da Oliveira & Co. Como posso ajudar?'
            ? 'Olá! Sou a Felipa, assistente virtual da Oliveira & Co. Como posso ajudar?'
            : agent.greeting}
          : agent)};
      }
    }
  } catch { /* Storage may be unavailable in private mode. */ }
  const now = new Date().toISOString();
  const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString();
  const deal = (id: string, title: string, value: number, stage: DealStage, close: number, extra: Partial<Deal> = {}): Deal => ({ id, contact_id: 'demo-contact', title, value, stage, created_at: day(-20), updated_at: day(-2), stage_changed_at: day(-4), closed_at: stage === 'won' || stage === 'lost' ? day(-1) : null, assigned_to: 'demo', close_date: day(close).slice(0, 10), probability: null, next_step: '', lost_reason: '', description: '', ...extra });
  return {
    ...emptyState(),
    contacts: [{ id: 'demo-contact', name: 'Contato de exemplo', email: 'exemplo@example.com', phone: '', company: 'Empresa de exemplo', source: 'Demonstração', score: 0, status: 'new', notes: 'Dados fictícios para explorar a interface. Não são enviados ao ambiente real.', created_at: now }],
    deals: [
      deal('demo-deal-1', 'Implantação SDR IA · Empresa de exemplo', 18000, 'proposal', 9, { next_step: 'Revisar proposta com o diretor comercial', description: 'Oportunidade fictícia para explorar a ficha.' }),
      deal('demo-deal-2', 'Plano anual · Empresa de exemplo', 42000, 'meeting', 21),
      deal('demo-deal-3', 'Projeto piloto · Empresa de exemplo', 6500, 'qualifying', 35),
      deal('demo-deal-4', 'Expansão regional · Empresa de exemplo', 9000, 'won', -1),
    ],
    deal_tasks: [
      { id: 'demo-task-1', deal_id: 'demo-deal-1', title: 'Enviar proposta revisada', due_at: day(-1), done_at: null, assigned_to: 'demo', created_at: day(-3) },
      { id: 'demo-task-2', deal_id: 'demo-deal-1', title: 'Confirmar decisores na reunião', due_at: day(2), done_at: null, assigned_to: 'demo', created_at: day(-2) },
    ],
    deal_events: [
      { id: 'demo-event-1', deal_id: 'demo-deal-1', kind: 'created', detail: { stage: 'new', value: 18000 }, actor_id: null, created_at: day(-20) },
      { id: 'demo-event-2', deal_id: 'demo-deal-1', kind: 'stage', detail: { from: 'meeting', to: 'proposal' }, actor_id: 'demo', created_at: day(-4) },
    ],
    agents: [{ id: 'demo-agent', name: 'Felipa', company: 'Oliveira & Co.', system_prompt: 'Você é uma assistente comercial transparente e consultiva. Apresente-se como IA. Entenda a necessidade do contato, o orçamento, sua participação na decisão e o prazo. Faça uma pergunta por vez. Não invente preços, integrações, disponibilidade ou agendamentos. Consulte a base fornecida; quando faltar informação, proponha atendimento humano.', greeting: 'Olá! Sou a Felipa, assistente virtual da Oliveira & Co. Como posso ajudar?', model: 'claude-haiku-5-5', active: true, qualification_threshold: 75, created_at: now }],
  };
}
export function saveDemo(data: DatabaseState) { localStorage.setItem(key, JSON.stringify(data)); }

export function deleteDemoRow(data: DatabaseState, table: keyof DatabaseState, id: string): DatabaseState {
  const next = { ...data, [table]: data[table].filter(row => row.id !== id) };
  if (table === 'contacts') {
    if (data.deals.some(d => d.contact_id === id) || data.meetings.some(m => m.contact_id === id) || data.conversations.some(c => c.contact_id === id)) throw new Error('Remova os vínculos com oportunidades, reuniões e conversas antes de excluir este contato.');
  }
  if (table === 'agents' && data.conversations.some(c => c.agent_id === id)) throw new Error('Exclua as conversas vinculadas antes de excluir este agente. Você também pode desativá-lo.');
  if (table === 'conversations') next.messages = next.messages.filter(m => m.conversation_id !== id);
  if (table === 'deals') { next.deal_tasks = next.deal_tasks.filter(t => t.deal_id !== id); next.deal_notes = next.deal_notes.filter(n => n.deal_id !== id); next.deal_events = next.deal_events.filter(e => e.deal_id !== id); }
  return next;
}
