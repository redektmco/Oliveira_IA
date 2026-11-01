/**
 * Automações (workflows) no estilo Twenty CRM: um gatilho e uma lista de passos.
 * Compartilhado entre o painel (editor) e o servidor (validação e execução).
 */
export type WorkflowObject = 'contacts' | 'deals' | 'meetings' | 'deal_tasks';
export type TriggerType = 'record.created' | 'record.updated' | 'message.received' | 'schedule' | 'manual';
export type FilterOp = 'eq' | 'neq' | 'contains' | 'not_contains' | 'gt' | 'lt' | 'empty' | 'not_empty' | 'changed' | 'older_than_days' | 'newer_than_days';
export type WorkflowFilter = { field: string; op: FilterOp; value?: string | number | boolean | null };
export type ScheduleEvery = 'hour' | 'day' | 'week';
export type WorkflowTrigger = {
  type: TriggerType;
  /** Objeto observado (record.*), ou percorrido a cada disparo (schedule, opcional). */
  object?: WorkflowObject;
  /** record.updated: só dispara quando um destes campos muda. Vazio = qualquer mudança. */
  fields?: string[];
  /** Condições sobre o registro do gatilho (todas precisam valer). */
  filters?: WorkflowFilter[];
  /** message.received: limita a um canal. */
  channel?: 'whatsapp' | 'email' | 'instagram' | 'widget' | 'web' | '';
  schedule?: { every: ScheduleEvery; at?: string; weekday?: number };
};
export type StepType = 'condition' | 'update_record' | 'create_record' | 'tag_contact' | 'send_whatsapp' | 'send_email' | 'http_request' | 'ai_generate' | 'delay' | 'notify';
export type CreatableObject = 'contacts' | 'deals' | 'deal_tasks' | 'contact_notes' | 'deal_notes';
export type WorkflowStep = { id: string; type: StepType; name?: string; config: Record<string, any> };
export type WorkflowStatus = 'draft' | 'active' | 'paused';
export type Workflow = {
  id: string; name: string; description: string; status: WorkflowStatus; trigger: WorkflowTrigger; steps: WorkflowStep[];
  created_via: 'panel' | 'assistant'; run_count: number; last_run_at: string | null; created_at: string; updated_at: string;
};
export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'stopped';
export type RunLogEntry = { id: string; type: StepType; status: 'ok' | 'failed' | 'skipped' | 'waiting' | 'stopped'; at: string; detail?: string; error?: string };
export type WorkflowRun = { id: string; workflow_id: string; status: RunStatus; trigger_kind: string; record_table: string | null; record_id: string | null; log: RunLogEntry[]; error: string | null; created_at: string; finished_at: string | null; available_at: string };

export const MAX_STEPS = 20;
export const MAX_DELAY_MINUTES = 30 * 24 * 60;

export const objectLabels: Record<WorkflowObject, string> = { contacts: 'Contato', deals: 'Oportunidade', meetings: 'Reunião', deal_tasks: 'Tarefa' };
export const creatableLabels: Record<CreatableObject, string> = { contacts: 'Contato', deals: 'Oportunidade', deal_tasks: 'Tarefa', contact_notes: 'Nota no contato', deal_notes: 'Nota na oportunidade' };
export const triggerLabels: Record<TriggerType, string> = {
  'record.created': 'Registro criado', 'record.updated': 'Registro atualizado', 'message.received': 'Mensagem recebida', schedule: 'Agendado', manual: 'Manual',
};
export const triggerHints: Record<TriggerType, string> = {
  'record.created': 'Quando um contato, oportunidade, reunião ou tarefa é criado.',
  'record.updated': 'Quando um registro muda (ex.: etapa da oportunidade).',
  'message.received': 'Quando um cliente manda mensagem em um canal.',
  schedule: 'Em um horário fixo; pode percorrer registros que atendem às condições.',
  manual: 'Só quando alguém clica em Executar (ou pede ao assistente).',
};
export const stepLabels: Record<StepType, string> = {
  condition: 'Condição', update_record: 'Atualizar registro', create_record: 'Criar registro', tag_contact: 'Etiquetas do contato',
  send_whatsapp: 'Enviar WhatsApp', send_email: 'Enviar e-mail', http_request: 'Requisição HTTP', ai_generate: 'Gerar com IA', delay: 'Aguardar', notify: 'Notificar equipe',
};
export const stepHints: Record<StepType, string> = {
  condition: 'Continua só se as condições valerem.',
  update_record: 'Altera campos do registro do gatilho, do contato ou da oportunidade.',
  create_record: 'Cria contato, oportunidade, tarefa ou nota.',
  tag_contact: 'Adiciona ou remove etiquetas do contato.',
  send_whatsapp: 'Mensagem real para o telefone do contato.',
  send_email: 'E-mail pela conta Google conectada.',
  http_request: 'Chama um endpoint HTTPS (Zapier, n8n, Make…).',
  ai_generate: 'Pede um texto ao Claude e usa nos próximos passos.',
  delay: 'Espera minutos, horas ou dias antes de seguir.',
  notify: 'Notificação no sino do painel.',
};
export const filterOpLabels: Record<FilterOp, string> = {
  eq: 'é igual a', neq: 'é diferente de', contains: 'contém', not_contains: 'não contém', gt: 'é maior que', lt: 'é menor que',
  empty: 'está vazio', not_empty: 'está preenchido', changed: 'mudou', older_than_days: 'há mais de N dias', newer_than_days: 'há menos de N dias',
};
export const noValueOps: FilterOp[] = ['empty', 'not_empty', 'changed'];

/** Campos que aparecem no editor (e que o servidor aceita em filtros e atualizações). */
export const objectFields: Record<WorkflowObject, { key: string; label: string; kind: 'text' | 'number' | 'date' | 'enum' | 'tags'; options?: Record<string, string>; writable?: boolean }[]> = {
  contacts: [
    { key: 'name', label: 'Nome', kind: 'text', writable: true }, { key: 'email', label: 'E-mail', kind: 'text', writable: true }, { key: 'phone', label: 'Telefone', kind: 'text', writable: true },
    { key: 'company', label: 'Empresa', kind: 'text', writable: true }, { key: 'job_title', label: 'Cargo', kind: 'text', writable: true }, { key: 'city', label: 'Cidade', kind: 'text', writable: true },
    { key: 'source', label: 'Origem', kind: 'text', writable: true },
    { key: 'status', label: 'Status', kind: 'enum', writable: true, options: { new: 'Novo', qualifying: 'Em qualificação', qualified: 'Qualificado', unqualified: 'Não qualificado' } },
    { key: 'score', label: 'Score', kind: 'number' }, { key: 'tags', label: 'Etiquetas', kind: 'tags' }, { key: 'notes', label: 'Observações', kind: 'text', writable: true },
    { key: 'created_at', label: 'Criado em', kind: 'date' },
  ],
  deals: [
    { key: 'title', label: 'Título', kind: 'text', writable: true }, { key: 'value', label: 'Valor', kind: 'number', writable: true },
    { key: 'stage', label: 'Etapa', kind: 'enum', writable: true, options: { new: 'Novo lead', qualifying: 'Em qualificação', qualified: 'Qualificado', meeting: 'Reunião agendada', proposal: 'Proposta', won: 'Ganho', lost: 'Perdido' } },
    { key: 'probability', label: 'Probabilidade', kind: 'number', writable: true }, { key: 'close_date', label: 'Previsão de fechamento', kind: 'date', writable: true },
    { key: 'next_step', label: 'Próximo passo', kind: 'text', writable: true }, { key: 'lost_reason', label: 'Motivo da perda', kind: 'text', writable: true },
    { key: 'description', label: 'Descrição', kind: 'text', writable: true }, { key: 'stage_changed_at', label: 'Etapa mudou em', kind: 'date' },
    { key: 'updated_at', label: 'Atualizado em', kind: 'date' }, { key: 'created_at', label: 'Criado em', kind: 'date' },
  ],
  meetings: [
    { key: 'title', label: 'Título', kind: 'text', writable: true }, { key: 'starts_at', label: 'Início', kind: 'date' }, { key: 'location', label: 'Local', kind: 'text', writable: true },
    { key: 'status', label: 'Status', kind: 'enum', writable: true, options: { scheduled: 'Agendada', completed: 'Realizada', cancelled: 'Cancelada' } },
    { key: 'source', label: 'Origem', kind: 'enum', options: { manual: 'Manual', ai: 'IA' } }, { key: 'created_at', label: 'Criada em', kind: 'date' },
  ],
  deal_tasks: [
    { key: 'title', label: 'Título', kind: 'text', writable: true }, { key: 'due_at', label: 'Vencimento', kind: 'date' }, { key: 'done_at', label: 'Concluída em', kind: 'date' },
    { key: 'created_at', label: 'Criada em', kind: 'date' },
  ],
};
/** Campos aceitos em "Criar registro". */
export const createFields: Record<CreatableObject, { key: string; label: string; required?: boolean; kind?: 'number' | 'enum'; options?: Record<string, string> }[]> = {
  contacts: [{ key: 'name', label: 'Nome', required: true }, { key: 'email', label: 'E-mail' }, { key: 'phone', label: 'Telefone' }, { key: 'company', label: 'Empresa' }, { key: 'source', label: 'Origem' }, { key: 'notes', label: 'Observações' }],
  deals: [{ key: 'title', label: 'Título', required: true }, { key: 'value', label: 'Valor', kind: 'number' }, { key: 'stage', label: 'Etapa', kind: 'enum', options: objectFields.deals[2].options }, { key: 'next_step', label: 'Próximo passo' }, { key: 'description', label: 'Descrição' }],
  deal_tasks: [{ key: 'title', label: 'Título', required: true }, { key: 'due_in_days', label: 'Vence em (dias)', kind: 'number' }],
  contact_notes: [{ key: 'content', label: 'Texto da nota', required: true }],
  deal_notes: [{ key: 'content', label: 'Texto da nota', required: true }],
};
export const weekdays = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export function newStepId(existing: { id: string }[]) {
  let n = existing.length + 1;
  while (existing.some(step => step.id === `s${n}`)) n++;
  return `s${n}`;
}
export function defaultStepConfig(type: StepType): Record<string, any> {
  switch (type) {
    case 'condition': return { filters: [{ field: 'status', op: 'eq', value: '' }], target: 'trigger' };
    case 'update_record': return { target: 'trigger', fields: {} };
    case 'create_record': return { object: 'deal_tasks', fields: { title: '' } };
    case 'tag_contact': return { add: [], remove: [] };
    case 'send_whatsapp': return { text: 'Olá, {{contact.name}}! ' };
    case 'send_email': return { to: '{{contact.email}}', subject: '', text: '' };
    case 'http_request': return { method: 'POST', url: 'https://', body: '' };
    case 'ai_generate': return { prompt: '' };
    case 'delay': return { minutes: 60 };
    case 'notify': return { title: '' };
  }
}

/** Resumo legível do gatilho (lista e chat). */
export function describeTrigger(t: WorkflowTrigger): string {
  if (t.type === 'manual') return 'Manual';
  if (t.type === 'message.received') return `Mensagem recebida${t.channel ? ` (${t.channel})` : ''}`;
  if (t.type === 'schedule') {
    const s = t.schedule || { every: 'day' as const };
    const when = s.every === 'hour' ? 'A cada hora' : s.every === 'week' ? `${[0, 6].includes(s.weekday ?? 1) ? 'Todo' : 'Toda'} ${weekdays[s.weekday ?? 1]?.toLowerCase()} às ${s.at || '09:00'}` : `Todo dia às ${s.at || '09:00'}`;
    return t.object ? `${when} · ${objectLabels[t.object]}s` : when;
  }
  const obj = t.object ? objectLabels[t.object] : 'Registro';
  const feminine = t.object === 'deals' || t.object === 'meetings' || t.object === 'deal_tasks';
  const verb = t.type === 'record.created' ? (feminine ? 'criada' : 'criado') : (feminine ? 'atualizada' : 'atualizado');
  const fields = t.type === 'record.updated' && t.object && t.fields?.length ? ` (${t.fields.map(key => objectFields[t.object!].find(f => f.key === key)?.label.toLowerCase() || key).join(', ')})` : '';
  return `${obj} ${verb}${fields}`;
}
