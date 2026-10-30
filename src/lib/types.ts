export type Contact = { id: string; name: string; email: string; phone: string; company: string; source: string; score: number; status: 'new' | 'qualifying' | 'qualified' | 'unqualified'; notes: string; created_at: string };
export type DealStage = 'new' | 'qualifying' | 'qualified' | 'meeting' | 'proposal' | 'won' | 'lost';
export type Deal = { id: string; contact_id: string | null; title: string; value: number; stage: DealStage; created_at: string };
export type Agent = { id: string; name: string; company: string; system_prompt: string; greeting: string; model: string; active: boolean; qualification_threshold: number; created_at: string };
export type Knowledge = { id: string; title: string; content: string; created_at: string };
export type Conversation = { id: string; contact_id: string | null; agent_id: string | null; channel: 'web' | 'whatsapp'; status: 'ai' | 'human' | 'closed'; created_at: string };
export type Message = { id: string; conversation_id: string; role: 'user' | 'assistant' | 'human'; content: string; delivery_status?: string; created_at: string };
export type Meeting = { id: string; contact_id: string | null; title: string; starts_at: string; duration: number; location: string; status: 'scheduled' | 'completed' | 'cancelled'; created_at: string };
export type Usage = { id: string; model: string; input_tokens: number; output_tokens: number; status: 'pending' | 'completed' | 'failed'; created_at: string };
export interface Tables { contacts: Contact; deals: Deal; agents: Agent; knowledge: Knowledge; conversations: Conversation; messages: Message; meetings: Meeting; ai_usage: Usage }
export type Table = keyof Tables;
export type DatabaseState = { [K in Table]: Tables[K][] };
export type EditableTable = Exclude<Table, 'ai_usage'>;
export type RowInput<K extends Table> = Omit<Tables[K], 'id' | 'created_at'>;
export const emptyState = (): DatabaseState => ({ contacts: [], deals: [], agents: [], knowledge: [], conversations: [], messages: [], meetings: [], ai_usage: [] });
export const stages: Record<DealStage, string> = { new: 'Novo lead', qualifying: 'Em qualificação', qualified: 'Qualificado', meeting: 'Reunião agendada', proposal: 'Proposta', won: 'Ganho', lost: 'Perdido' };
export const contactStatuses: Record<Contact['status'], string> = { new: 'Novo', qualifying: 'Em qualificação', qualified: 'Qualificado', unqualified: 'Não qualificado' };
