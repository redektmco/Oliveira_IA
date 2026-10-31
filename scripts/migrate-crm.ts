import {readFile} from 'node:fs/promises';
import {createManagementApi, SetupError} from './cloud-setup.js';

// A narrowly scoped migration: no Auth, environment variables, webhook or customer
// content is changed. Management credentials remain in the secure runtime binding.
try {
  const ref = process.env.SUPABASE_PROJECT_REF;
  if (ref !== 'mdzflolthybnzewhpxno') throw new SetupError('Defina SUPABASE_PROJECT_REF=mdzflolthybnzewhpxno para selecionar Felipa IA.');
  const mode = process.argv[2];
  if (!['--check', '--apply'].includes(mode) || process.argv.length !== 3) throw new SetupError('Use --check ou --apply.');
  const api = createManagementApi(process.env.SUPABASE_ACCESS_TOKEN || '');
  const project = await api<{name:string;status:string}>(`/v1/projects/${ref}`);
  if (project.status !== 'ACTIVE_HEALTHY') throw new SetupError('O projeto não está ativo. Nenhuma migração foi aplicada.');
  if (mode === '--apply') {
    const query = await readFile(new URL('../supabase/migrations/202610300003_crm_triage.sql', import.meta.url), 'utf8');
    await api(`/v1/projects/${ref}/database/query`, 'POST', {query});
  }
  const result = await api<Array<{columns:number;functions:number;rls:boolean}>>(`/v1/projects/${ref}/database/query`, 'POST', {
    read_only: true,
    query: `select (select count(*)::int from information_schema.columns where table_schema='public' and table_name='contacts' and column_name in ('job_title','city','owner_name','tags','files','triage','triage_updated_at','triage_message_count','crm_revision')) as columns,
    (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('append_triaged_turn','whatsapp_save_triaged_reply')) as functions,
    (select relrowsecurity and relforcerowsecurity from pg_class where oid='public.contacts'::regclass) as rls;`,
  });
  const verified = result[0]?.columns === 9 && result[0]?.functions === 2 && result[0]?.rls;
  console.log(JSON.stringify({project:project.name,ref,mode,crmReady:Boolean(verified)}));
  if (!verified) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof SetupError ? error.message : 'Migração não confirmada. Consulte o estado antes de repetir; dados sensíveis foram omitidos.');
  process.exitCode = 1;
}
