import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Agent, Contact, Conversation, Knowledge, Message, Triage } from '../src/lib/types.js';
import type { ChatRepository } from './chat.js';
import { HttpError } from './validation.js';

export type ServerConfig = { supabaseUrl: string; anonKey: string; serviceKey: string; anthropicKey: string; configuredModel?: string; dailyRequestLimit?: string };

export function configPresence(env: NodeJS.ProcessEnv = process.env) {
  return {
    supabase: Boolean((env.SUPABASE_URL || env.VITE_SUPABASE_URL) && (env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY)),
    database: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
    anthropic: Boolean(env.ANTHROPIC_API_KEY || env.AI_SECRET_CLAUDE),
  };
}

export function serverConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const presence = configPresence(env);
  if (!presence.supabase || !presence.database || !presence.anthropic) {
    throw new HttpError(503, 'A IA ainda precisa ser configurada no servidor: Supabase, chave de serviço e chave da API Anthropic.');
  }
  const supabaseUrl = (env.SUPABASE_URL || env.VITE_SUPABASE_URL)!.trim();
  let url: URL;
  try { url = new URL(supabaseUrl); } catch { throw new HttpError(503, 'A URL do Supabase está configurada incorretamente.'); }
  if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) {
    throw new HttpError(503, 'Configure uma URL HTTPS válida para o Supabase.');
  }
  return {
    supabaseUrl,
    anonKey: (env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY)!.trim(),
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
    anthropicKey: (env.ANTHROPIC_API_KEY || env.AI_SECRET_CLAUDE)!.trim(),
    configuredModel: env.ANTHROPIC_MODEL,
    dailyRequestLimit: env.AI_DAILY_REQUEST_LIMIT,
  };
}

export function databaseError(error: { code?: string } | null): never {
  if (error?.code && ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(error.code)) {
    throw new HttpError(503, 'O banco ainda não está preparado. Aplique a migração Supabase documentada no projeto.');
  }
  throw new HttpError(503, 'Não foi possível acessar o banco de dados. Verifique o projeto Supabase e tente novamente.');
}

export class SupabaseChatRepository implements ChatRepository {
  constructor(private readonly auth: SupabaseClient, private readonly admin: SupabaseClient) {}

  async contactMessages(userId: string, contactId: string): Promise<Message[]> {
    const { data, error } = await this.admin.from('messages').select('id, conversation_id, role, content, created_at, conversations!inner(contact_id, user_id)').eq('user_id', userId).eq('conversations.user_id', userId).eq('conversations.contact_id', contactId).not('delivery_status', 'in', '(failed,canceled,uncertain,queued,sending)').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(80);
    if (error) databaseError(error);
    return ((data || []) as Message[]).reverse();
  }

  async contact(userId: string, id: string): Promise<Contact | null> {
    const { data, error } = await this.admin.from('contacts').select('*').eq('user_id', userId).eq('id', id).maybeSingle();
    if (error) databaseError(error);
    return data as Contact | null;
  }

  async appendTriagedTurn(userId: string, conversationId: string, contact: Contact, user: string, assistant: string, triage: Triage): Promise<void> {
    const { error } = await this.admin.rpc('append_triaged_turn', {
      p_user_id: userId, p_conversation_id: conversationId, p_contact_id: contact.id,
      p_expected_revision: contact.crm_revision ?? 0, p_user_content: user,
      p_assistant_content: assistant, p_triage: triage,
    });
    if (error?.code === 'P0001') {
      if (error.message === 'CRM_CHANGED') throw new HttpError(409, 'A ficha ou conversa mudou durante a análise. Atualize e tente novamente.');
      if (error.message === 'CONVERSATION_NOT_AI') throw new HttpError(409, 'A IA foi pausada ou a conversa foi encerrada antes de salvar a resposta.');
    }
    if (error) databaseError(error);
  }

  async authenticate(token: string) {
    let result;
    try { result = await this.auth.auth.getUser(token); }
    catch { throw new HttpError(503, 'Não foi possível verificar sua sessão. Tente novamente.'); }
    if (result.error) {
      if (result.error.status && result.error.status >= 500) throw new HttpError(503, 'O serviço de autenticação está indisponível.');
      throw new HttpError(401, 'Sua sessão expirou. Entre novamente.');
    }
    if (!result.data.user) throw new HttpError(401, 'Sua sessão expirou. Entre novamente.');
    return { id: result.data.user.id };
  }

  async agent(userId: string, id: string): Promise<Agent | null> {
    const { data, error } = await this.admin.from('agents').select('*').eq('user_id', userId).eq('id', id).maybeSingle();
    if (error) databaseError(error);
    return data as Agent | null;
  }

  async conversation(userId: string, id: string): Promise<Conversation | null> {
    const { data, error } = await this.admin.from('conversations').select('*').eq('user_id', userId).eq('id', id).maybeSingle();
    if (error) databaseError(error);
    return data as Conversation | null;
  }

  async messages(userId: string, conversationId: string): Promise<Message[]> {
    const { data, error } = await this.admin.from('messages').select('*').eq('user_id', userId).eq('conversation_id', conversationId).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(40);
    if (error) databaseError(error);
    return ((data || []) as Message[]).reverse();
  }

  async knowledge(userId: string): Promise<Knowledge[]> {
    const { data, error } = await this.admin.from('knowledge').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(30);
    if (error) databaseError(error);
    return (data || []) as Knowledge[];
  }

  async reserveUsage(userId: string, model: string, limit: number): Promise<string> {
    const { data, error } = await this.admin.rpc('reserve_ai_request', { p_user_id: userId, p_model: model, p_daily_limit: limit });
    if (error?.code === 'P0001' && error.message === 'AI_DAILY_LIMIT_REACHED') {
      throw new HttpError(429, 'Você atingiu o limite diário de chamadas de IA. O limite é renovado à meia-noite UTC.');
    }
    if (error || typeof data !== 'string') databaseError(error);
    return data;
  }

  async completeUsage(userId: string, id: string, usage: { input_tokens: number; output_tokens: number }): Promise<void> {
    const { error } = await this.admin.from('ai_usage').update({ status: 'completed', input_tokens: usage.input_tokens, output_tokens: usage.output_tokens }).eq('user_id', userId).eq('id', id);
    if (error) databaseError(error);
  }

  async failUsage(userId: string, id: string): Promise<void> {
    const { error } = await this.admin.from('ai_usage').update({ status: 'failed' }).eq('user_id', userId).eq('id', id);
    if (error) databaseError(error);
  }

  async appendTurn(userId: string, conversationId: string, user: string, assistant: string): Promise<void> {
    const { error } = await this.admin.rpc('append_ai_turn', { p_user_id: userId, p_conversation_id: conversationId, p_user_content: user, p_assistant_content: assistant });
    if (error?.code === 'P0001' && error.message === 'CONVERSATION_NOT_AI') {
      throw new HttpError(409, 'A IA foi pausada ou a conversa foi encerrada antes de salvar a resposta.');
    }
    if (error) databaseError(error);
  }
}

export function createRepository(config: ServerConfig): SupabaseChatRepository {
  const options = {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: {
      fetch: (input: string | URL | Request, init?: RequestInit) => fetch(input, {
        ...init,
        signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000),
      }),
    },
  };
  return new SupabaseChatRepository(
    createClient(config.supabaseUrl, config.anonKey, options),
    createClient(config.supabaseUrl, config.serviceKey, options),
  );
}
