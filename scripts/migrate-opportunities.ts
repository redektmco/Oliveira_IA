import {readFile} from 'node:fs/promises';
import {createManagementApi, SetupError} from './cloud-setup.js';

// Applies only 202611020005_opportunities.sql (additive): opportunity record, outbound WhatsApp start
// and the client message guard. No Auth, environment variable, webhook or customer content is changed.
try {
  const ref = process.env.SUPABASE_PROJECT_REF;
  if (ref !== 'mdzflolthybnzewhpxno') throw new SetupError('Defina SUPABASE_PROJECT_REF=mdzflolthybnzewhpxno para selecionar Felipa IA.');
  const mode = process.argv[2];
  if (!['--check', '--apply'].includes(mode) || process.argv.length !== 3) throw new SetupError('Use --check ou --apply.');
  const api = createManagementApi(process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_TOKEN || '');
  const project = await api<{name:string;status:string}>(`/v1/projects/${ref}`);
  if (project.status !== 'ACTIVE_HEALTHY') throw new SetupError('O projeto não está ativo. Nenhuma migração foi aplicada.');
  const prerequisites = await api<Array<{ready:boolean}>>(`/v1/projects/${ref}/database/query`, 'POST', {read_only: true, query: `select
    to_regprocedure('public.workspace_contact_access(uuid,uuid)') is not null and to_regprocedure('public.workspace_direct_access(uuid)') is not null
    and to_regprocedure('public.whatsapp_enqueue_human(uuid,uuid,uuid,text)') is not null and to_regclass('public.calendar_accounts') is not null as ready;`});
  if (!prerequisites[0]?.ready) throw new SetupError('As migrações anteriores (workspace e automação comercial) não estão aplicadas. Nada foi alterado.');
  if (mode === '--apply') {
    const query = await readFile(new URL('../supabase/migrations/202611020005_opportunities.sql', import.meta.url), 'utf8');
    await api(`/v1/projects/${ref}/database/query`, 'POST', {query});
  }
  const result = await api<Array<{columns:number;tables:number;functions:number;triggers:number;rls:boolean}>>(`/v1/projects/${ref}/database/query`, 'POST', {
    read_only: true,
    query: `select (select count(*)::int from information_schema.columns where table_schema='public' and table_name='deals' and column_name in ('assigned_to','close_date','probability','next_step','lost_reason','description','updated_at','stage_changed_at','closed_at','last_actor')) as columns,
    (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('deal_tasks','deal_notes','deal_events') and c.relrowsecurity and c.relforcerowsecurity) as tables,
    (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('workspace_deal_access','deal_before_write','deal_after_write','messages_client_guard','whatsapp_start_human')) as functions,
    (select count(*)::int from pg_trigger where tgname in ('deals_before_write','deals_after_write','messages_client_guard')) as triggers,
    (select relrowsecurity and relforcerowsecurity from pg_class where oid='public.deals'::regclass) as rls;`,
  });
  const r = result[0];
  const verified = r?.columns === 10 && r?.tables === 3 && r?.functions === 5 && r?.triggers === 3 && r?.rls;
  console.log(JSON.stringify({project:project.name,ref,mode,opportunitiesReady:Boolean(verified),detail:r}));
  if (!verified) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof SetupError ? error.message : 'Migração não confirmada. Consulte o estado antes de repetir; dados sensíveis foram omitidos.');
  process.exitCode = 1;
}
