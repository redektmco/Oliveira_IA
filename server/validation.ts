export const ALLOWED_MODELS = [
  'claude-haiku-5-5',
  'claude-sonnet-4-6',
] as const;

export const DEFAULT_MODEL = 'claude-haiku-5-5';
/** Agentes salvos com Haiku 4.5 passam a usar Haiku 5.5. */
const LEGACY_MODELS: Record<string, string> = { 'claude-haiku-4-5': 'claude-haiku-5-5', 'claude-haiku-4-5-20251001': 'claude-haiku-5-5' };
export const MAX_BODY_BYTES = 64 * 1024;
export const MAX_MESSAGE_CHARACTERS = 4_000;
export const MAX_HISTORY_CHARACTERS = 24_000;

export type ChatMessage = { role: 'user' | 'assistant'; content: string };
export type ChatInput = { agentId: string; conversationId?: string; message: string; history: ChatMessage[] };

export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseBearerToken(header: unknown): string {
  if (typeof header !== 'string') throw new HttpError(401, 'Entre na sua conta para usar a IA.');
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/i.exec(header);
  if (!match || match[1].length > 8_192) throw new HttpError(401, 'Sessão inválida. Entre novamente.');
  return match[1];
}

export function parseChatInput(rawBody: unknown): ChatInput {
  let body = rawBody;
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') {
    if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) throw new HttpError(413, 'A mensagem excede o tamanho permitido.');
    try { body = JSON.parse(body); } catch { throw new HttpError(400, 'Envie um corpo JSON válido.'); }
  }
  if (!isRecord(body)) throw new HttpError(400, 'Envie os dados da conversa em JSON.');
  let bodyBytes: number;
  try { bodyBytes = Buffer.byteLength(JSON.stringify(body), 'utf8'); } catch { throw new HttpError(400, 'Corpo JSON inválido.'); }
  if (bodyBytes > MAX_BODY_BYTES) throw new HttpError(413, 'A mensagem excede o tamanho permitido.');
  if (Object.keys(body).some((key) => !['agentId', 'conversationId', 'message', 'history'].includes(key))) {
    throw new HttpError(400, 'O pedido contém campos não suportados.');
  }
  if (typeof body.agentId !== 'string' || !uuid.test(body.agentId)) throw new HttpError(400, 'Selecione um agente válido.');
  if (body.conversationId !== undefined && (typeof body.conversationId !== 'string' || !uuid.test(body.conversationId))) {
    throw new HttpError(400, 'Conversa inválida.');
  }
  if (typeof body.message !== 'string' || !body.message.trim()) throw new HttpError(400, 'Escreva uma mensagem.');
  const message = body.message.trim();
  if (message.length > MAX_MESSAGE_CHARACTERS) throw new HttpError(400, 'Use até 4.000 caracteres por mensagem.');
  if (body.history !== undefined && !Array.isArray(body.history)) throw new HttpError(400, 'Histórico inválido.');
  const history: ChatMessage[] = [];
  if (Array.isArray(body.history)) {
    if (body.history.length > 20) throw new HttpError(400, 'O histórico deve conter no máximo 20 mensagens.');
    let total = 0;
    for (const item of body.history) {
      if (!isRecord(item) || !['user', 'assistant'].includes(String(item.role)) || typeof item.content !== 'string' || !item.content.trim()) {
        throw new HttpError(400, 'O histórico contém uma mensagem inválida.');
      }
      const content = item.content.trim();
      if (content.length > MAX_MESSAGE_CHARACTERS) throw new HttpError(400, 'Cada mensagem do histórico deve ter até 4.000 caracteres.');
      total += content.length;
      if (total > MAX_HISTORY_CHARACTERS) throw new HttpError(400, 'O histórico excede o limite de 24.000 caracteres.');
      history.push({ role: item.role as ChatMessage['role'], content });
    }
  }
  if (body.conversationId && history.length) throw new HttpError(400, 'Conversas salvas usam o histórico do servidor.');
  return { agentId: body.agentId, conversationId: body.conversationId as string | undefined, message, history };
}

export function resolveModel(agentModel: string | null | undefined, configuredModel?: string): string {
  const requested = agentModel?.trim() || configuredModel?.trim() || DEFAULT_MODEL;
  const model = LEGACY_MODELS[requested] ?? requested;
  if (!(ALLOWED_MODELS as readonly string[]).includes(model)) {
    throw new HttpError(400, 'Modelo não habilitado. Use Claude Haiku 5.5 ou Claude Sonnet 4.6 nas configurações do agente.');
  }
  return model;
}

export function dailyLimit(raw?: string): number {
  if (raw === undefined || raw === '') return 50;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 10_000) {
    throw new HttpError(503, 'O limite diário de IA está configurado incorretamente.');
  }
  return value;
}

/** Provider errors must not return credentials, request bodies or upstream messages. */
export function publicError(error: unknown): { status: number; error: string } {
  if (error instanceof HttpError) return { status: error.status, error: error.message };
  const upstream = isRecord(error) ? error.status : undefined;
  if (upstream === 401 || upstream === 403) return { status: 502, error: 'A Anthropic recusou a credencial do servidor. Verifique a chave e o acesso ao modelo na Vercel.' };
  if (upstream === 402) return { status: 502, error: 'A conta da API Anthropic está sem créditos disponíveis.' };
  if (upstream === 400 && isRecord(error) && typeof error.message === 'string' && /credit balance.{0,30}too low|insufficient.{0,20}credit/i.test(error.message)) {
    return { status: 502, error: 'A conta da API Anthropic está sem créditos disponíveis.' };
  }
  if (upstream === 404) return { status: 502, error: 'O modelo configurado não está disponível nesta conta Anthropic.' };
  if (upstream === 429) return { status: 429, error: 'A API Anthropic atingiu seu limite temporário. Aguarde e tente novamente.' };
  if (isRecord(error) && (error.name === 'APIConnectionTimeoutError' || error.name === 'AbortError')) {
    return { status: 504, error: 'A IA demorou para responder. Aguarde e tente novamente.' };
  }
  return { status: 502, error: 'Não foi possível concluir a resposta. Tente novamente e confira a configuração do servidor.' };
}
