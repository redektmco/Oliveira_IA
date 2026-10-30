import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {applySupabase, checkVercelDestination, configureVercel, createManagementApi, defaultOptions, planSupabase, SetupError, type VercelApi} from './cloud-setup.js';

const root = fileURLToPath(new URL('../', import.meta.url));
for (const file of ['.env.local','.env']) {
  try {process.loadEnvFile(resolve(root,file));} catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
}
const scope = process.env.VERCEL_SCOPE || 'redektmco-3675s-projects';
const projectId = process.env.VERCEL_PROJECT_ID || 'prj_R2tORvecB6fdG3jIpbCt0DBVrT2e';

const vercelApi: VercelApi = (path, method = 'GET', body) => new Promise((resolveResult,reject) => {
  const args = ['api',path,'--method',method,'--scope',scope,'--raw',...(body === undefined ? [] : ['--input','-'])];
  const env: NodeJS.ProcessEnv = {...process.env, VERCEL_TELEMETRY_DISABLED:'1'};
  if (existsSync('/workspace/.vercel-cli')) {
    env.XDG_DATA_HOME ||= '/workspace/.vercel-cli/data';
    env.XDG_CONFIG_HOME ||= '/workspace/.vercel-cli/config';
    env.XDG_CACHE_HOME ||= '/workspace/.vercel-cli/cache';
  }
  const child = spawn(resolve(root,'node_modules/.bin/vercel'),args,{cwd:root,env,stdio:['pipe','pipe','pipe']});
  let output = '';
  const timer = setTimeout(() => child.kill('SIGTERM'),45_000);
  child.stdout.on('data',chunk => {output += String(chunk);if (output.length > 4_000_000) child.kill('SIGTERM');});
  child.stderr.resume(); // Do not print CLI error payloads or environment responses.
  child.stdin.on('error',() => {});
  child.on('error',() => {clearTimeout(timer);reject(new SetupError('Não foi possível executar a CLI Vercel.'));});
  child.on('close',code => {
    clearTimeout(timer);
    if (code !== 0) return reject(new SetupError('A Vercel não confirmou a operação. Confira autenticação, escopo e permissões antes de repetir.'));
    try {resolveResult(JSON.parse(output));} catch {reject(new SetupError('A Vercel não retornou a confirmação JSON esperada.'));}
  });
  child.stdin.end(body === undefined ? undefined : JSON.stringify(body));
});

try {
  const flags = process.argv.slice(2);
  if (flags.length !== 1 || !['--check','--apply'].includes(flags[0])) throw new SetupError('Use npm run cloud:check ou npm run cloud:apply.');
  const api = createManagementApi(process.env.SUPABASE_ACCESS_TOKEN || '');
  const options = {...defaultOptions, region:process.env.SUPABASE_REGION || defaultOptions.region, organizationSlug:process.env.SUPABASE_ORGANIZATION_SLUG, projectRef:process.env.SUPABASE_PROJECT_REF};
  const plan = await planSupabase(api,options);
  console.log(JSON.stringify({action:plan.project ? 'reuse' : 'create', organization:plan.organization.slug, name:plan.project?.name || options.name, ...(plan.project ? {} : {region:options.region}), siteUrl:options.siteUrl}));
  if (flags[0] === '--apply') {
    // Check Vercel ownership before creating any Supabase resources.
    await vercelApi(`/v9/projects/${projectId}`);
    const currentRef = plan.project?.ref || plan.project?.id;
    await checkVercelDestination(vercelApi,projectId,currentRef ? `https://${currentRef}.supabase.co` : undefined);
    const migration = (await Promise.all((await readdir(resolve(root,'supabase/migrations'))).filter(name=>name.endsWith('.sql')).sort().map(name=>readFile(resolve(root,'supabase/migrations',name),'utf8')))).join('\n');
    const result = await applySupabase(api,plan,migration,{progress:message => console.log(message)});
    const names = await configureVercel(vercelApi,projectId,result.variables);
    console.log(JSON.stringify({projectRef:result.ref,url:result.url,databaseVerified:true,authConfigured:true,vercelVariables:names}));
    console.log('Execute os checks do projeto e um novo deploy Vercel. Configure ANTHROPIC_API_KEY ou AI_SECRET_CLAUDE diretamente na Vercel para respostas reais; não copie um placeholder do proxy para a Vercel.');
  }
} catch (error) {
  console.error(error instanceof SetupError ? error.message : 'A preparação falhou sem confirmação. Consulte o estado dos serviços antes de repetir; detalhes sensíveis foram omitidos.');
  process.exitCode = 1;
}
