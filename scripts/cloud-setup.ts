import {randomBytes} from 'node:crypto';

export class SetupError extends Error {}
export type ManagementApi = <T>(path: string, method?: 'GET'|'POST'|'PATCH', body?: unknown) => Promise<T>;
export type Organization = {id: string; slug: string; name: string};
export type Project = {id?: string; ref?: string; name: string; organization_slug: string; status: string};
export type SetupOptions = {organizationSlug?: string; projectRef?: string; name: string; region: string; siteUrl: string};
export type SetupPlan = {organization: Organization; project: Project|null; options: SetupOptions};
type ProjectKey = {name: string; type?: string|null; api_key?: string|null};
export type DeploymentVariable = {key: string; value: string; type: 'plain'|'sensitive'; target: ['production']};

export const defaultOptions: SetupOptions = {
  name: 'oliveira-ia', region: 'sa-east-1', siteUrl: 'https://ai.v4oliveira.com.br',
};
const projectRef = (project: Project) => {
  const ref = project.ref || project.id || '';
  if (!/^[a-z]{20}$/.test(ref)) throw new SetupError('O Supabase não retornou uma referência válida para o projeto.');
  return ref;
};

export function createManagementApi(token: string, fetcher: typeof fetch = fetch): ManagementApi {
  if (!token.trim()) throw new SetupError('SUPABASE_ACCESS_TOKEN não está disponível. Associe o valor ao requisito existente nas configurações seguras do ambiente.');
  return async <T>(path: string, method: 'GET'|'POST'|'PATCH' = 'GET', body?: unknown): Promise<T> => {
    if (!path.startsWith('/v1/')) throw new SetupError('Endpoint de gerenciamento não permitido.');
    let response: Response;
    try {
      response = await fetcher(`https://api.supabase.com${path}`, {
        method, headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
        ...(body === undefined ? {} : {body: JSON.stringify(body)}), signal: AbortSignal.timeout(25_000), redirect:'error',
      });
    } catch {
      throw new SetupError('Não foi possível concluir a requisição ao Supabase. Consulte novamente o estado antes de repetir uma criação.');
    }
    // Never propagate upstream bodies: auth configuration and API key responses contain secrets.
    if (!response.ok) {
      if (response.status === 401) throw new SetupError('Supabase HTTP 401: o token de gerenciamento não foi aplicado ou não foi aceito. Confira o vínculo existente, sem gerar uma credencial duplicada.');
      if (response.status === 403) throw new SetupError('Supabase HTTP 403: a conta não autorizou esta operação ou o acesso foi bloqueado.');
      if (response.status === 429) throw new SetupError('Supabase HTTP 429: aguarde antes de executar novamente.');
      throw new SetupError(`Supabase HTTP ${response.status}: operação não confirmada. Confira o projeto no painel antes de repetir.`);
    }
    try {return await response.json() as T;} catch {throw new SetupError('O Supabase não retornou a confirmação JSON esperada.');}
  };
}

export async function planSupabase(api: ManagementApi, options: SetupOptions): Promise<SetupPlan> {
  if (!options.name.trim() || options.name.length > 256) throw new SetupError('Informe um nome válido para o projeto.');
  if (options.organizationSlug && !/^[\w-]+$/.test(options.organizationSlug)) throw new SetupError('Organization slug inválido.');
  if (options.projectRef && !/^[a-z]{20}$/.test(options.projectRef)) throw new SetupError('SUPABASE_PROJECT_REF inválido.');
  const site = new URL(options.siteUrl);
  if (site.protocol !== 'https:' || site.username || site.password || site.pathname !== '/' || site.search || site.hash) throw new SetupError('SITE_URL precisa ser uma origem HTTPS, sem caminho ou credenciais.');
  const organizations = await api<Organization[]>('/v1/organizations');
  const projects = await api<Project[]>('/v1/projects');
  const candidates = projects.filter(p => p.status !== 'REMOVED' &&
    (options.projectRef ? (p.ref || p.id) === options.projectRef : p.name === options.name) &&
    (!options.organizationSlug || p.organization_slug === options.organizationSlug));
  if (candidates.length > 1) throw new SetupError('Há mais de um projeto com esse nome. Selecione SUPABASE_PROJECT_REF antes de continuar.');
  if (options.projectRef && !candidates.length) throw new SetupError('O projeto selecionado não foi encontrado na conta/organização.');
  const project = candidates[0] || null;
  const choices = organizations.filter(o => project ? o.slug === project.organization_slug : !options.organizationSlug || o.slug === options.organizationSlug);
  if (!choices.length) throw new SetupError('Não há organização correspondente acessível nesta conta Supabase.');
  if (choices.length !== 1) throw new SetupError('Há várias organizações. Defina SUPABASE_ORGANIZATION_SLUG para escolher o destino. Nenhum projeto foi criado.');
  if (project) projectRef(project);
  else {
    const organization = await api<{plan?: string}>(`/v1/organizations/${encodeURIComponent(choices[0].slug)}`);
    if (organization.plan !== 'free') throw new SetupError('A criação automática exige uma organização com plano gratuito confirmado. Nenhum plano ou cobrança será alterado.');
    const regions = await api<{all:{specific:Array<{code:string;status?:string}>}}>(`/v1/projects/available-regions?organization_slug=${encodeURIComponent(choices[0].slug)}`);
    if (!regions.all.specific.some(r => r.code === options.region && !r.status)) throw new SetupError('A região selecionada não está disponível para criação nesta organização. Nenhum projeto foi criado.');
  }
  return {organization: choices[0], project, options: {...options, siteUrl: site.origin}};
}

export async function applySupabase(
  api: ManagementApi, plan: SetupPlan, migration: string,
  dependencies: {sleep?: (ms: number) => Promise<void>; progress?: (message: string) => void} = {},
) {
  const progress = dependencies.progress || (() => {});
  const sleep = dependencies.sleep || ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  let project = plan.project;
  if (!project) {
    // Kept only in memory; REST/Auth keys do not require the database password.
    // Direct PostgreSQL access can use a password reset in the Supabase dashboard.
    progress('Criando projeto Supabase no plano gratuito, sem ampliar o tamanho padrão.');
    project = await api<Project>('/v1/projects', 'POST', {
      name: plan.options.name, organization_slug: plan.organization.slug,
      region_selection: {type:'specific', code:plan.options.region}, db_pass:randomBytes(36).toString('base64url'),
    });
  } else progress('Reutilizando o projeto existente; nenhuma cópia será criada.');
  const ref = projectRef(project);
  progress(`Projeto ${ref}: aguardando banco e Auth.`);
  for (let attempt = 0; attempt < 60; attempt++) {
    project = await api<Project>(`/v1/projects/${ref}`);
    if (project.status === 'ACTIVE_HEALTHY') break;
    if (['INACTIVE','INIT_FAILED','REMOVED','RESTORE_FAILED','PAUSE_FAILED'].includes(project.status)) throw new SetupError(`O projeto está no estado ${project.status}. Verifique o painel; nenhum reset ou restauração foi executado.`);
    if (attempt === 59) throw new SetupError(`O projeto ${ref} continua iniciando. Execute a verificação novamente; ele será reutilizado.`);
    await sleep(5_000);
  }
  progress('Aplicando a migração e verificando tabelas, RLS e funções.');
  await api(`/v1/projects/${ref}/database/query`, 'POST', {query:migration});
  const verified = await api<Array<{tables:number; protected:number; functions:number}>>(`/v1/projects/${ref}/database/query`, 'POST', {
    read_only:true,
    query:`select count(*)::integer as tables, count(*) filter (where c.relrowsecurity and c.relforcerowsecurity)::integer as protected,
      (select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('reserve_ai_request','append_ai_turn')) as functions
      from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'
      and c.relname in ('contacts','agents','knowledge','deals','conversations','messages','meetings','ai_usage');`,
  });
  if (verified[0]?.tables !== 8 || verified[0]?.protected !== 8 || verified[0]?.functions !== 2) throw new SetupError('A verificação do esquema/RLS não confirmou todos os recursos esperados.');
  const auth = await api<{uri_allow_list?:string|null}>(`/v1/projects/${ref}/config/auth`);
  const redirects = [...new Set([...(auth.uri_allow_list || '').split(',').map(s => s.trim()).filter(Boolean), plan.options.siteUrl, 'https://swift-coral-qbz2f6f.vercel.app'])];
  await api(`/v1/projects/${ref}/config/auth`, 'PATCH', {site_url:plan.options.siteUrl, uri_allow_list:redirects.join(',')});
  const keys = await api<ProjectKey[]>(`/v1/projects/${ref}/api-keys?reveal=true`);
  const anon = keys.find(k => k.name === 'anon' && k.api_key)?.api_key || keys.find(k => k.type === 'publishable' && k.api_key)?.api_key;
  const service = keys.find(k => k.name === 'service_role' && k.api_key)?.api_key || keys.find(k => k.type === 'secret' && k.api_key)?.api_key;
  if (!anon || !service || anon === service) throw new SetupError('O projeto não retornou chaves pública e privada utilizáveis. Nenhum valor foi registrado.');
  const url = `https://${ref}.supabase.co`;
  const variables: DeploymentVariable[] = [
    {key:'VITE_SUPABASE_URL',value:url,type:'plain',target:['production']},
    {key:'VITE_SUPABASE_ANON_KEY',value:anon,type:'plain',target:['production']},
    {key:'SUPABASE_URL',value:url,type:'plain',target:['production']},
    {key:'SUPABASE_ANON_KEY',value:anon,type:'plain',target:['production']},
    {key:'SUPABASE_SERVICE_ROLE_KEY',value:service,type:'sensitive',target:['production']},
  ];
  return {ref, url, variables};
}

export type VercelApi = (path: string, method?: 'GET'|'POST', body?: unknown) => Promise<unknown>;
export async function checkVercelDestination(api: VercelApi, projectId: string, url?: string) {
  if (!/^prj_[\w]+$/.test(projectId)) throw new SetupError('VERCEL_PROJECT_ID inválido.');
  const path = `/v9/projects/${projectId}/env`;
  const current = await api(path) as {envs?:Array<{key:string; value?:string; type?:string; target?:string[]}>};
  const existing = current.envs?.filter(v => v.target?.includes('production') && ['VITE_SUPABASE_URL','SUPABASE_URL'].includes(v.key)) || [];
  if (existing.some(v => v.type !== 'plain' || v.value !== url)) throw new SetupError('Já há uma conexão Supabase diferente ou não verificável na produção Vercel. Nenhuma variável foi substituída.');
}
export async function configureVercel(api: VercelApi, projectId: string, variables: DeploymentVariable[]) {
  await checkVercelDestination(api, projectId, variables.find(v => v.key === 'VITE_SUPABASE_URL')?.value);
  for (const variable of variables) {
    // JSON travels through stdin in the CLI adapter, never through shell arguments or logs.
    await api(`/v10/projects/${projectId}/env?upsert=true`, 'POST', variable);
  }
  return variables.map(v => v.key);
}
