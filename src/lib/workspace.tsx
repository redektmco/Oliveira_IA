import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import { deleteDemoRow, loadDemo, saveDemo } from './demo';
import { emptyState, type DatabaseState, type EditableTable, type RowInput, type Tables } from './types';

export type ChatRequest = { agentId: string; conversationId?: string; message: string; history?: {role: 'user' | 'assistant'; content: string}[] };
export type ChatResult = { text: string; usage: {input_tokens: number; output_tokens: number}; conversationId?: string };
interface Workspace {
  data: DatabaseState; demo: boolean; loading: boolean; error: string | null;
  refresh: (silent?: boolean) => Promise<void>;
  create: <K extends EditableTable>(table: K, input: RowInput<K>) => Promise<Tables[K]>;
  update: <K extends EditableTable>(table: K, id: string, patch: Partial<RowInput<K>>) => Promise<void>;
  remove: (table: EditableTable, id: string) => Promise<void>;
  askClaude: (request: ChatRequest) => Promise<ChatResult>;
}
const Context = createContext<Workspace | null>(null);
export function useWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error('Workspace indisponível.');
  return value;
}

export function WorkspaceProvider({demo, userId, children}: {demo: boolean; userId: string | null; children: ReactNode}) {
  const [data, setData] = useState<DatabaseState>(() => demo ? loadDemo() : emptyState());
  const dataRef = useRef(data);
  const [loading, setLoading] = useState(!demo);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const replace = useCallback((next: DatabaseState) => { dataRef.current = next; setData(next); }, []);
  const refresh = useCallback(async (silent = false) => {
    if (demo) return;
    if (!supabase || !userId) throw new Error('Faça login para acessar seus dados.');
    const current = ++generation.current;
    if (!silent) setLoading(true);
    try {
      const keys = Object.keys(emptyState()) as (keyof DatabaseState)[];
      const results = await Promise.all(keys.map(async k => {
        const rows: unknown[] = [];
        for (let offset = 0; ; offset += 500) {
          const result = await supabase!.from(k).select('*').eq('user_id', userId).order('created_at', {ascending: true}).order('id').range(offset, offset + 499);
          if (result.error) throw new Error('Não foi possível carregar os dados. Verifique a migração do Supabase e as permissões de acesso.');
          rows.push(...result.data);
          if (result.data.length < 500) break;
          if (rows.length >= 20000) throw new Error('Este workspace excedeu 20 mil registros em uma área. É necessário ampliar a paginação da interface para esse volume.');
        }
        return rows;
      }));
      if (current !== generation.current) return;
      const next = Object.fromEntries(keys.map((key, i) => [key, results[i]])) as unknown as DatabaseState;
      replace(next); setError(null);
    } catch (e) {
      if (current === generation.current) setError(e instanceof Error ? e.message : 'Erro ao carregar dados.');
      throw e;
    } finally { if (current === generation.current) setLoading(false); }
  }, [demo, userId, replace]);
  useEffect(() => { refresh().catch(() => {}); return () => { generation.current++; }; }, [refresh]);
  const commitDemo = (next: DatabaseState) => {
    try { saveDemo(next); } catch { throw new Error('O navegador não permitiu salvar a demonstração. Libere armazenamento local e tente novamente.'); }
    replace(next);
  };
  const create = async <K extends EditableTable>(table: K, input: RowInput<K>): Promise<Tables[K]> => {
    if (demo) {
      const row = {...input, id: crypto.randomUUID(), created_at: new Date().toISOString()} as Tables[K];
      commitDemo({...dataRef.current, [table]: [...dataRef.current[table], row]});
      return row;
    }
    if (!supabase || !userId) throw new Error('Sessão expirada. Faça login novamente.');
    const {data: row, error: failure} = await supabase.from(table).insert({...input, user_id: userId}).select().single();
    if (failure) throw new Error('Não foi possível salvar. Verifique os campos e tente novamente.');
    replace({...dataRef.current, [table]: [...dataRef.current[table], row]});
    // The write already committed. A later read failure must not invite a duplicate save.
    await refresh().catch(() => {}); return row as Tables[K];
  };
  const update = async <K extends EditableTable>(table: K, id: string, patch: Partial<RowInput<K>>) => {
    if (demo) { commitDemo({...dataRef.current, [table]: dataRef.current[table].map(row => row.id === id ? {...row, ...patch} : row)}); return; }
    if (!supabase || !userId) throw new Error('Sessão expirada. Faça login novamente.');
    const {data: rows, error: failure} = await supabase.from(table).update(patch as Record<string, unknown>).eq('id', id).eq('user_id', userId).select('*');
    if (failure || !rows?.length) throw new Error('Não foi possível atualizar. O registro pode ter sido removido.');
    replace({...dataRef.current, [table]: dataRef.current[table].map(row => row.id === id ? rows[0] : row)});
    await refresh().catch(() => {});
  };
  const remove = async (table: EditableTable, id: string) => {
    if (demo) { commitDemo(deleteDemoRow(dataRef.current, table, id)); return; }
    if (!supabase || !userId) throw new Error('Sessão expirada. Faça login novamente.');
    const {data: rows, error: failure} = await supabase.from(table).delete().eq('id', id).eq('user_id', userId).select('id');
    if (failure || !rows?.length) throw new Error('Não foi possível excluir. Verifique registros relacionados.');
    replace(deleteDemoRow(dataRef.current, table, id));
    await refresh().catch(() => {});
  };
  const askClaude = async (request: ChatRequest): Promise<ChatResult> => {
    if (demo) throw new Error('A demonstração não chama o Claude. Configure Supabase e Anthropic, entre com sua conta e crie um agente para testar a IA real.');
    const {data: session} = await supabase!.auth.getSession();
    if (!session.session) throw new Error('Sua sessão expirou. Entre novamente.');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 55000);
    try {
      const response = await fetch('/api/chat', {method: 'POST', headers: {'Content-Type': 'application/json', Authorization: `Bearer ${session.session.access_token}`}, body: JSON.stringify(request), signal: controller.signal});
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'O Claude não respondeu. Tente novamente.');
      return result as ChatResult;
    } catch(e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw new Error('O tempo de resposta foi excedido. Atualize a conversa antes de tentar novamente.');
      throw e;
    } finally { window.clearTimeout(timeout); await refresh().catch(() => {}); }
  };
  return <Context.Provider value={{data,demo,loading,error,refresh,create,update,remove,askClaude}}>{children}</Context.Provider>;
}
