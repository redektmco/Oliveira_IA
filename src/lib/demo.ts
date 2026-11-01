import { emptyState, type DatabaseState } from './types';

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
  return {
    ...emptyState(),
    contacts: [{ id: 'demo-contact', name: 'Contato de exemplo', email: 'exemplo@example.com', phone: '', company: 'Empresa de exemplo', source: 'Demonstração', score: 0, status: 'new', notes: 'Dados fictícios para explorar a interface. Não são enviados ao ambiente real.', created_at: now }],
    agents: [{ id: 'demo-agent', name: 'Felipa', company: 'Oliveira & Co.', system_prompt: 'Você é uma assistente comercial transparente e consultiva. Apresente-se como IA. Entenda a necessidade do contato, o orçamento, sua participação na decisão e o prazo. Faça uma pergunta por vez. Não invente preços, integrações, disponibilidade ou agendamentos. Consulte a base fornecida; quando faltar informação, proponha atendimento humano.', greeting: 'Olá! Sou a Felipa, assistente virtual da Oliveira & Co. Como posso ajudar?', model: 'claude-haiku-4-5-20251001', active: true, qualification_threshold: 75, created_at: now }],
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
  return next;
}
