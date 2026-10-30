import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applySupabase, checkVercelDestination, configureVercel, createManagementApi, defaultOptions, planSupabase, type ManagementApi, type Project, type SetupPlan, SetupError} from '../scripts/cloud-setup.js';

const ref = 'abcdefghijklmnopqrst';
const organization = {id:'org-id',slug:'oliveira',name:'Oliveira'};
const project: Project = {ref,name:'oliveira-ia',organization_slug:'oliveira',status:'ACTIVE_HEALTHY'};
const plan: SetupPlan = {organization,project,options:defaultOptions};
type Call = {path:string;method:string;body:unknown};
function mockApi(overrides: (call: Call) => unknown = () => undefined) {
  const calls: Call[] = [];
  const api: ManagementApi = async <T>(path: string, method = 'GET', body?: unknown) => {
    const call={path,method,body};calls.push(call);
    const override=overrides(call);
    if (override !== undefined) return override as T;
    let value: unknown;
    if (path === '/v1/organizations') value=[organization];
    else if (path === '/v1/projects' && method === 'GET') value=[project];
    else if (path === '/v1/projects' && method === 'POST') value={...project,status:'COMING_UP'};
    else if (path === '/v1/organizations/oliveira') value={plan:'free'};
    else if (path.startsWith('/v1/projects/available-regions?')) value={all:{specific:[{code:'sa-east-1'}]}};
    else if (path === `/v1/projects/${ref}`) value=project;
    else if (path.endsWith('/database/query')) value=(body as {read_only?:boolean}).read_only ? [{tables:8,protected:8,functions:2}] : [];
    else if (path.endsWith('/config/auth')) value={uri_allow_list:'https://existing.example/callback',disable_signup:true};
    else if (path.endsWith('/api-keys?reveal=true')) value=[{name:'anon',api_key:'public-test-key'},{name:'service_role',api_key:'private-test-key'}];
    else throw new Error('Unexpected mock endpoint');
    return value as T;
  };
  return {api,calls};
}

test('cloud setup requires the existing secret binding and does not expose upstream credential errors',async () => {
  assert.throws(() => createManagementApi(''),/SUPABASE_ACCESS_TOKEN/);
  let url='',authorization='';
  const api=createManagementApi('private-management-test-key',(async (input,init) => {
    url=String(input);authorization=(init?.headers as Record<string,string>).Authorization;
    return new Response('private-management-test-key should never reach a log',{status:401});
  }) as typeof fetch);
  await assert.rejects(api('/v1/organizations'),e => e instanceof SetupError && e.message.includes('401') && !e.message.includes('private-management-test-key'));
  assert.equal(url,'https://api.supabase.com/v1/organizations');
  assert.equal(authorization,'Bearer private-management-test-key');
  await assert.rejects(api('https://another.example'),/Endpoint/);
});

test('provisioning discovery reuses the same project across runs without a new creation',async () => {
  const {api,calls}=mockApi();
  const first=await planSupabase(api,defaultOptions);
  const second=await planSupabase(api,defaultOptions);
  assert.equal(first.project?.ref,ref);assert.equal(second.project?.ref,ref);
  assert.equal(calls.filter(c => c.method !== 'GET').length,0);
});

test('provisioning refuses an ambiguous organization, duplicate project or unconfirmed free plan',async () => {
  for (const planName of ['pro',undefined]) {
    const {api}=mockApi(c => c.path === '/v1/projects' ? [] : c.path === '/v1/organizations/oliveira' ? {plan:planName} : undefined);
    await assert.rejects(planSupabase(api,defaultOptions),/plano gratuito confirmado/);
  }
  const ambiguous=mockApi(c => c.path === '/v1/projects' ? [] : c.path === '/v1/organizations' ? [organization,{...organization,id:'other',slug:'other'}] : undefined);
  await assert.rejects(planSupabase(ambiguous.api,defaultOptions),/várias organizações/);
  const duplicates=mockApi(c => c.path === '/v1/projects' ? [project,{...project,ref:'bbbbbbbbbbbbbbbbbbbb'}] : undefined);
  await assert.rejects(planSupabase(duplicates.api,defaultOptions),/mais de um projeto/);
  const missing=mockApi();
  await assert.rejects(planSupabase(missing.api,{...defaultOptions,projectRef:'bbbbbbbbbbbbbbbbbbbb'}),/não foi encontrado/);
});

test('provisioning validates HTTPS origins before it makes network requests',async () => {
  const {api,calls}=mockApi();
  for (const siteUrl of ['http://example.com','https://user:pass@example.com','https://example.com/login','https://example.com?x=1']) await assert.rejects(planSupabase(api,{...defaultOptions,siteUrl}),/origem HTTPS/);
  assert.equal(calls.length,0);
});

test('project creation checks available regions and never silently falls back to another location',async () => {
  const {api,calls}=mockApi(c => c.path === '/v1/projects' ? [] : c.path.startsWith('/v1/projects/available-regions?') ? {all:{specific:[{code:'sa-east-1',status:'capacity'}]}} : undefined);
  await assert.rejects(planSupabase(api,defaultOptions),/região selecionada não está disponível/);
  assert.ok(calls.every(c => c.method === 'GET'));
});

test('setup applies verified RLS schema and preserves existing Auth redirects and signup policy',async () => {
  const {api,calls}=mockApi();
  const result=await applySupabase(api,plan,'begin; select 1; commit;');
  const migration=calls.find(c => c.path.endsWith('/database/query') && !(c.body as {read_only?:boolean}).read_only);
  assert.equal((migration?.body as {query:string}).query,'begin; select 1; commit;');
  const auth=calls.find(c => c.method === 'PATCH');
  assert.deepEqual(auth?.body,{site_url:'https://ai.v4oliveira.com.br',uri_allow_list:'https://existing.example/callback,https://ai.v4oliveira.com.br,https://swift-coral-qbz2f6f.vercel.app'});
  assert.equal(result.url,`https://${ref}.supabase.co`);
  const service=result.variables.find(v => v.key === 'SUPABASE_SERVICE_ROLE_KEY');
  assert.equal(service?.type,'sensitive');
  assert.ok(result.variables.filter(v => v.key.startsWith('VITE_')).every(v => v.value !== service?.value));
  assert.equal(calls.filter(c => c.path === '/v1/projects' && c.method === 'POST').length,0);
});

test('new projects use the smallest default instance and a generated in-memory password',async () => {
  const {api,calls}=mockApi();
  const result=await applySupabase(api,{...plan,project:null},'migration');
  const created=calls.find(c => c.path === '/v1/projects' && c.method === 'POST')!;
  const body=created.body as Record<string,unknown>;
  assert.equal(body.organization_slug,'oliveira');
  assert.deepEqual(body.region_selection,{type:'specific',code:'sa-east-1'});
  assert.equal(typeof body.db_pass,'string');
  assert.ok(String(body.db_pass).length >= 40);
  assert.ok(!('desired_instance_size' in body));assert.ok(!('plan' in body));
  assert.ok(!JSON.stringify(result).includes(String(body.db_pass)));
});

test('failed SQL verification stops before Auth changes or retrieving application keys',async () => {
  const {api,calls}=mockApi(c => c.path.endsWith('/database/query') && (c.body as {read_only?:boolean}).read_only ? [{tables:8,protected:7,functions:2}] : undefined);
  await assert.rejects(applySupabase(api,plan,'migration'),/esquema\/RLS/);
  assert.ok(!calls.some(c => c.path.endsWith('/config/auth') || c.path.endsWith('/api-keys?reveal=true')));
});

test('paused projects are not restarted and provisioning does not loop indefinitely',async () => {
  const paused=mockApi(c => c.path === `/v1/projects/${ref}` ? {...project,status:'INACTIVE'} : undefined);
  await assert.rejects(applySupabase(paused.api,plan,'migration'),/INACTIVE/);
  assert.ok(!paused.calls.some(c => c.method !== 'GET'));
  const starting=mockApi(c => c.path === `/v1/projects/${ref}` ? {...project,status:'COMING_UP'} : undefined);
  let sleeps=0;
  await assert.rejects(applySupabase(starting.api,plan,'migration',{sleep:async () => {sleeps++;}}),/continua iniciando/);
  assert.equal(sleeps,59);assert.equal(starting.calls.length,60);
});

test('Vercel receives only the selected Supabase variables and keeps the service key private',async () => {
  const {api}=mockApi();const result=await applySupabase(api,plan,'migration');
  const calls: Call[]=[];
  const vercel=async (path:string,method='GET',body?:unknown) => {calls.push({path,method,body});return {envs:[{key:'ANTHROPIC_API_KEY',type:'sensitive',target:['production']} ]};};
  const names=await configureVercel(vercel,'prj_test',result.variables);
  assert.equal(names.length,5);assert.ok(!names.includes('ANTHROPIC_API_KEY'));
  assert.ok(calls.filter(c => c.method === 'POST').every(c => c.path.endsWith('/env?upsert=true')));
  const secret=calls.find(c => (c.body as {key?:string})?.key === 'SUPABASE_SERVICE_ROLE_KEY');
  assert.equal((secret?.body as {type:string}).type,'sensitive');
  assert.deepEqual((secret?.body as {target:string[]}).target,['production']);
});

test('Vercel setup refuses to replace another Supabase connection',async () => {
  const {api}=mockApi();const result=await applySupabase(api,plan,'migration');
  const methods:string[]=[];
  const vercel=async (_path:string,method='GET') => {methods.push(method);return {envs:[{key:'VITE_SUPABASE_URL',value:'https://another.supabase.co',type:'plain',target:['production']}]};};
  await assert.rejects(configureVercel(vercel,'prj_test',result.variables),/diferente ou não verificável/);
  assert.deepEqual(methods,['GET']);
});

test('a new Supabase project is not created when Vercel is already connected elsewhere',async () => {
  const vercel=async () => ({envs:[{key:'SUPABASE_URL',value:'https://existing.supabase.co',type:'plain',target:['production']}]});
  await assert.rejects(checkVercelDestination(vercel,'prj_test'),/diferente ou não verificável/);
});
