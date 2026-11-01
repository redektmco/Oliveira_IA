import {readFile} from 'node:fs/promises';
import {createManagementApi, SetupError} from './cloud-setup.js';

// Aplica 202611060009_agent_tone_weights.sql (aditiva): tom de voz e pesos dos critérios em public.agents.
// Nenhum dado, Auth ou variável de ambiente é alterado. Idempotente.
try {
  const ref = process.env.SUPABASE_PROJECT_REF;
  if (ref !== 'mdzflolthybnzewhpxno') throw new SetupError('Defina SUPABASE_PROJECT_REF=mdzflolthybnzewhpxno para selecionar Felipa IA.');
  const mode = process.argv[2];
  if (!['--check', '--apply'].includes(mode) || process.argv.length !== 3) throw new SetupError('Use --check ou --apply.');
  const api = createManagementApi(process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_TOKEN || '');
  const project = await api<{name:string;status:string}>(`/v1/projects/${ref}`);
  if (project.status !== 'ACTIVE_HEALTHY') throw new SetupError('O projeto não está ativo. Nenhuma migração foi aplicada.');
  const state = () => api<Array<{agents:boolean;tone:boolean;weights:boolean;constraint_ok:boolean}>>(`/v1/projects/${ref}/database/query`, 'POST', {read_only: true, query: `select
    to_regclass('public.agents') is not null as agents,
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='agents' and column_name='tone') as tone,
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='agents' and column_name='criteria_weights') as weights,
    exists(select 1 from pg_constraint where conname='agents_criteria_weights_check') as constraint_ok;`});
  const before = (await state())[0];
  if (!before?.agents) throw new SetupError('A tabela public.agents não existe. Nada foi alterado.');
  console.log('Antes:', JSON.stringify(before));
  if (mode === '--apply') {
    const query = await readFile(new URL('../supabase/migrations/202611060009_agent_tone_weights.sql', import.meta.url), 'utf8');
    await api(`/v1/projects/${ref}/database/query`, 'POST', {query});
    console.log('Depois:', JSON.stringify((await state())[0]));
  }
} catch (error) {
  console.error(error instanceof SetupError ? error.message : 'Falha inesperada ao consultar o Supabase.');
  process.exitCode = 1;
}
