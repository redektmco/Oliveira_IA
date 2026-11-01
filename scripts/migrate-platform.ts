import {readFile} from 'node:fs/promises';
import {createManagementApi, SetupError} from './cloud-setup.js';

// Aplica 202611070010_platform_limits.sql (aditiva): workspaces de clientes da agência,
// membro oculto e limite do chat de IA (janela de 5h + diário). Nenhum dado, Auth ou variável é alterado. Idempotente.
try {
  const ref = process.env.SUPABASE_PROJECT_REF;
  if (ref !== 'mdzflolthybnzewhpxno') throw new SetupError('Defina SUPABASE_PROJECT_REF=mdzflolthybnzewhpxno para selecionar Felipa IA.');
  const mode = process.argv[2];
  if (!['--check', '--apply'].includes(mode) || process.argv.length !== 3) throw new SetupError('Use --check ou --apply.');
  const api = createManagementApi(process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_TOKEN || '');
  const project = await api<{name:string;status:string}>(`/v1/projects/${ref}`);
  if (project.status !== 'ACTIVE_HEALTHY') throw new SetupError('O projeto não está ativo. Nenhuma migração foi aplicada.');
  const state = () => api<Array<{members:boolean;hidden:boolean;platform:boolean;windows:boolean;kind:boolean;cost:boolean;reserve:boolean;usage:boolean}>>(`/v1/projects/${ref}/database/query`, 'POST', {read_only: true, query: `select
    to_regclass('public.workspace_members') is not null as members,
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='workspace_members' and column_name='hidden') as hidden,
    to_regclass('public.platform_workspaces') is not null as platform,
    to_regclass('public.ai_chat_windows') is not null as windows,
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='ai_usage' and column_name='kind') as kind,
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='ai_usage' and column_name='cost_micros') as cost,
    to_regprocedure('public.reserve_ai_usage(uuid,text,text,uuid,bigint,bigint,text)') is not null as reserve,
    to_regprocedure('public.ai_chat_usage(uuid,uuid,text)') is not null as usage;`});
  const before = (await state())[0];
  if (!before?.members) throw new SetupError('A migração de equipe (202610310003_workspace.sql) não foi aplicada. Nada foi alterado.');
  console.log('Antes:', JSON.stringify(before));
  if (mode === '--apply') {
    const query = await readFile(new URL('../supabase/migrations/202611070010_platform_limits.sql', import.meta.url), 'utf8');
    await api(`/v1/projects/${ref}/database/query`, 'POST', {query});
    console.log('Depois:', JSON.stringify((await state())[0]));
  }
} catch (error) {
  console.error(error instanceof SetupError ? error.message : 'Falha inesperada ao consultar o Supabase.');
  process.exitCode = 1;
}
