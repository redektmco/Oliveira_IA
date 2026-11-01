import {readFile} from 'node:fs/promises';
import {createManagementApi, SetupError} from './cloud-setup.js';

// Applies the home assistant history (202611040007, if missing), the automations migration (202611050008) and the
// dedicated scheduler (workflows-scheduler.sql). All additive. No Auth, environment variable or customer content changes.
try {
  const ref = process.env.SUPABASE_PROJECT_REF;
  if (ref !== 'mdzflolthybnzewhpxno') throw new SetupError('Defina SUPABASE_PROJECT_REF=mdzflolthybnzewhpxno para selecionar Felipa IA.');
  const mode = process.argv[2];
  if (!['--check', '--apply'].includes(mode) || process.argv.length !== 3) throw new SetupError('Use --check ou --apply.');
  const api = createManagementApi(process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_TOKEN || '');
  const project = await api<{name:string;status:string}>(`/v1/projects/${ref}`);
  if (project.status !== 'ACTIVE_HEALTHY') throw new SetupError('O projeto não está ativo. Nenhuma migração foi aplicada.');
  const query = (sql: string, read_only = false) => api<any[]>(`/v1/projects/${ref}/database/query`, 'POST', {query: sql, ...(read_only ? {read_only} : {})});
  const ready = await query(`select to_regclass('public.deal_tasks') is not null and to_regprocedure('public.workspace_rate(text,timestamptz,integer)') is not null
    and exists(select 1 from vault.decrypted_secrets where name='felipa_whatsapp_worker') as ready;`, true);
  if (!ready[0]?.ready) throw new SetupError('Faltam migrações anteriores (oportunidades/workspace) ou o segredo do worker no Vault. Nada foi alterado.');
  if (mode === '--apply') {
    for (const file of ['migrations/202611040007_assistant.sql', 'migrations/202611050008_workflows.sql', 'workflows-scheduler.sql'])
      await query(await readFile(new URL(`../supabase/${file}`, import.meta.url), 'utf8'));
  }
  const result = await query(`select
    (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('workflows','workflow_runs','workflow_events','assistant_threads','assistant_messages') and c.relrowsecurity and c.relforcerowsecurity) as tables,
    (select count(*)::int from pg_trigger where tgname='workflow_capture') as triggers,
    (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('workflow_capture','workflow_claim_events','workflow_claim_runs','workflow_dispatch_pending')) as functions,
    exists(select 1 from cron.job where jobname='oliveira_workflows' and active) as scheduler;`, true);
  const r = result[0];
  const verified = r?.tables === 5 && r?.triggers === 5 && r?.functions === 4 && r?.scheduler;
  console.log(JSON.stringify({project:project.name,ref,mode,workflowsReady:Boolean(verified),detail:r}));
  if (!verified) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof SetupError ? error.message : 'Migração não confirmada. Consulte o estado antes de repetir; dados sensíveis foram omitidos.');
  process.exitCode = 1;
}
