export type Criterion = { score: number | null; evidence: string };
export type Triage = { summary: string; next_action: string; criteria: Record<'budget' | 'need' | 'authority' | 'timing', Criterion>; score: number; status: 'qualifying' | 'qualified' | 'unqualified' };
export type Contact = { id: string; name: string; email: string; phone: string; company: string; source: string; score: number; status: 'new' | 'qualifying' | 'qualified' | 'unqualified'; notes: string; assigned_to?: string | null; qualification?: {budget?: number;need?:number;authority?:number;timeline?:number};ai_summary?:string;ai_next_action?:string;summary_at?:string|null;consent_at?:string|null;consent_text?:string;created_at: string; job_title?: string; city?: string; owner_name?: string; tags?: string[]; files?: { id: string; name: string; url: string }[]; triage?: Triage | null; triage_updated_at?: string | null; triage_message_count?: number; crm_revision?: number };
export type DealStage = 'new' | 'qualifying' | 'qualified' | 'meeting' | 'proposal' | 'won' | 'lost';
export type Deal = { id: string; contact_id: string | null; title: string; value: number; stage: DealStage; created_at: string; assigned_to?: string | null; close_date?: string | null; probability?: number | null; next_step?: string; lost_reason?: string; description?: string; updated_at?: string; stage_changed_at?: string; closed_at?: string | null };
export type DealTask = { id: string; deal_id: string; title: string; due_at: string | null; done_at: string | null; assigned_to: string | null; created_at: string };
export type DealNote = { id: string; deal_id: string; content: string; author?: string; created_at: string };
export type DealEvent = { id: string; deal_id: string; kind: 'created' | 'stage' | 'value' | 'owner' | 'close_date'; detail: Record<string, any>; actor_id: string | null; created_at: string };
export type Agent = { id: string; name: string; company: string; system_prompt: string; greeting: string; model: string; active: boolean; qualification_threshold: number; created_at: string };
export type Knowledge = { id: string; title: string; content: string; created_at: string };
export type Conversation = { id: string; contact_id: string | null; agent_id: string | null; channel: 'web' | 'whatsapp' | 'email' | 'instagram' | 'widget'; external_id?: string | null; status: 'ai' | 'human' | 'closed'; created_at: string };
export type Message = { id: string; conversation_id: string; role: 'user' | 'assistant' | 'human'; content: string; delivery_status?: string; created_at: string };
export type Meeting = { id: string; contact_id: string | null; title: string; starts_at: string; duration: number; location: string; status: 'scheduled' | 'completed' | 'cancelled'; created_at: string; source?: 'manual' | 'ai'; assigned_to?: string | null; calendar_event_id?: string };
export type Usage = { id: string; model: string; input_tokens: number; output_tokens: number; status: 'pending' | 'completed' | 'failed'; created_at: string };
export type ContactNote = {id:string;contact_id:string;content:string;author?:string;created_at:string};
export type ContactFile = {id:string;contact_id:string;name:string;mime:string;bytes:number;storage_path:string;created_at:string};
export interface Tables { deal_tasks: DealTask; deal_notes: DealNote; deal_events: DealEvent; contact_notes: ContactNote; contact_files: ContactFile; contacts: Contact; deals: Deal; agents: Agent; knowledge: Knowledge; conversations: Conversation; messages: Message; meetings: Meeting; ai_usage: Usage }
export type Table = keyof Tables;
export type DatabaseState = { [K in Table]: Tables[K][] };
export type EditableTable = Exclude<Table, 'ai_usage' | 'contact_files' | 'deal_events'>;
export type RowInput<K extends Table> = Omit<Tables[K], 'id' | 'created_at'>;
export const emptyState = (): DatabaseState => ({ deal_tasks: [], deal_notes: [], deal_events: [], contact_notes: [], contact_files: [], contacts: [], deals: [], agents: [], knowledge: [], conversations: [], messages: [], meetings: [], ai_usage: [] });
export const stages: Record<DealStage, string> = { new: 'Novo lead', qualifying: 'Em qualificação', qualified: 'Qualificado', meeting: 'Reunião agendada', proposal: 'Proposta', won: 'Ganho', lost: 'Perdido' };
/** Default win probability per stage, used when the deal has no explicit probability. */
export const stageProbability: Record<DealStage, number> = { new: 10, qualifying: 20, qualified: 40, meeting: 60, proposal: 80, won: 100, lost: 0 };
export const openStages: DealStage[] = ['new', 'qualifying', 'qualified', 'meeting', 'proposal'];
export const lostReasons = ['Sem orçamento', 'Escolheu um concorrente', 'Sem resposta', 'Sem fit com a solução', 'Adiou a decisão', 'Outro'];
export const dealProbability = (deal: Pick<Deal, 'probability' | 'stage'>) => deal.probability ?? stageProbability[deal.stage];
export const contactStatuses: Record<Contact['status'], string> = { new: 'Novo', qualifying: 'Em qualificação', qualified: 'Qualificado', unqualified: 'Não qualificado' };
