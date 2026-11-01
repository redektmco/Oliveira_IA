import {readFile} from 'node:fs/promises';
import {createManagementApi, SetupError} from './cloud-setup.js';

// Aplica 202611080011_haiku_5_5.sql (aditiva, idempotente): permite claude-haiku-5-5, move agentes de Haiku 4.5
// para Haiku 5.5 e recalcula o custo equivalente. Nenhum outro dado, Auth ou variável é alterado.
try {
  const ref = process.env.SUPABASE_PROJECT_REF;
  if (ref !== 'mdzflolthybnzewhpxno') throw new SetupError('Defina SUPABASE_PROJECT_REF=mdzflolthybnzewhpxno para selecionar Felipa IA.');
  const mode = process.argv[2];
  if (!['--check', '--apply'].includes(mode) || process.argv.length !== 3) throw new SetupError('Use --check ou --apply.');
  const api = createManagementApi(process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_TOKEN || '');
  const project = await api<{name:string;status:string}>(`/v1/projects/${ref}`);
  if (project.status !== 'ACTIVE_HEALTHY') throw new SetupError('O projeto não está ativo. Nenhuma migração foi aplicada.');
  const state = () => api<Array<Record<string, unknown>>>(`/v1/projects/${ref}/database/query`, 'POST', {read_only: true, query: `select
    to_regprocedure('public.reserve_ai_usage(uuid,text,text,uuid,bigint,bigint,text)') is not null as platform_ready,
    coalesce((select pg_get_constraintdef(oid) like '%claude-haiku-5-5%' from pg_constraint where conname='agents_model_check'),false) as agents_allow_haiku55,
    coalesce((select prosrc like '%claude-haiku-5-5%' from pg_proc where proname='reserve_ai_usage' limit 1),false) as usage_allows_haiku55,
    (select json_object_agg(model,n) from (select model,count(*) n from public.agents group by model) m) as agents_by_model;`});
  const before = (await state())[0];
  if (!before?.platform_ready) throw new SetupError('Aplique antes 202611070010_platform_limits.sql (npm run platform:migrate). Nada foi alterado.');
  console.log('Antes:', JSON.stringify(before));
  if (mode === '--apply') {
    const query = await readFile(new URL('../supabase/migrations/202611080011_haiku_5_5.sql', import.meta.url), 'utf8');
    await api(`/v1/projects/${ref}/database/query`, 'POST', {query});
    console.log('Depois:', JSON.stringify((await state())[0]));
  }
} catch (error) {
  console.error(error instanceof SetupError ? error.message : 'Falha inesperada ao consultar o Supabase.');
  process.exitCode = 1;
}
