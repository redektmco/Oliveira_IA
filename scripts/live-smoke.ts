import {randomBytes} from 'node:crypto';
import {createClient, type SupabaseClient} from '@supabase/supabase-js';
import {createManagementApi} from './cloud-setup.js';

class SmokeError extends Error {}
function check(condition: unknown, message: string): asserts condition {if (!condition) throw new SmokeError(message);}
const ref = process.env.SUPABASE_PROJECT_REF || '';
const origin = 'https://ai.v4oliveira.com.br';
const users: string[] = [];
let admin: SupabaseClient | undefined;
let failure: unknown;
let cleanupComplete = true;
const withAI = process.argv.includes('--ai');
const outcomes: Record<string,string|number> = {};

try {
  check(/^[a-z]{20}$/.test(ref),'Defina SUPABASE_PROJECT_REF antes de testar um projeto real.');
  check(process.argv.slice(2).every(a => a === '--ai'),'A única opção aceita é --ai.');
  const api=createManagementApi(process.env.SUPABASE_ACCESS_TOKEN || '');
  const project=await api<{status:string}>(`/v1/projects/${ref}`);
  check(project.status === 'ACTIVE_HEALTHY','O projeto não está saudável para a validação.');
  const keys=await api<Array<{name:string;type?:string;api_key?:string}>>(`/v1/projects/${ref}/api-keys?reveal=true`);
  const anon=keys.find(k => k.name === 'anon' && k.api_key)?.api_key || keys.find(k => k.type === 'publishable' && k.api_key)?.api_key;
  const service=keys.find(k => k.name === 'service_role' && k.api_key)?.api_key || keys.find(k => k.type === 'secret' && k.api_key)?.api_key;
  check(anon && service && anon !== service,'Chaves pública e privada não disponíveis para validar.');
  const url=`https://${ref}.supabase.co`;
  const fetcher: typeof fetch = (input,init) => fetch(input,{...init,signal:init?.signal ? AbortSignal.any([init.signal,AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000)});
  const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:fetcher}};
  admin=createClient(url,service,options);
  const a=createClient(url,anon,options), b=createClient(url,anon,options);
  const credentials: Array<{email:string;password:string}> = [];
  for (let i=0;i<2;i++) {
    const credential={email:`felipa-check-${Date.now()}-${randomBytes(4).toString('hex')}@example.com`,password:randomBytes(32).toString('base64url')};
    const result=await admin.auth.admin.createUser({...credential,email_confirm:true});
    check(!result.error && result.data.user,'Não foi possível criar a conta temporária de teste (sem envio de e-mail).');
    users.push(result.data.user.id);credentials.push(credential);
  }
  for (const [i,client] of [a,b].entries()) {
    const result=await client.auth.signInWithPassword(credentials[i]);
    check(!result.error && result.data.session,'Login real de teste não foi concluído.');
  }
  outcomes.auth='verified';
  const inserted=await a.from('contacts').insert({user_id:users[0],name:'Contato temporário de verificação',company:'Teste Felipa',source:'Verificação automatizada',score:80,status:'qualified'}).select().single();
  check(!inserted.error && inserted.data,'Não foi possível criar o contato pela sessão autenticada.');
  const contactId=inserted.data.id;
  const edited=await a.from('contacts').update({notes:'Persistência validada pelo teste real.'}).eq('id',contactId);
  check(!edited.error,'A atualização do contato falhou.');
  const deal=await a.from('deals').insert({user_id:users[0],contact_id:contactId,title:'Verificação de pipeline',value:100,stage:'new'}).select().single();
  check(!deal.error && deal.data,'Não foi possível criar a oportunidade.');
  const moved=await a.from('deals').update({stage:'qualified'}).eq('id',deal.data.id).select().single();
  check(!moved.error && moved.data?.stage === 'qualified','A etapa da oportunidade não persistiu.');
  const agent=await a.from('agents').insert({user_id:users[0],name:'Felipa',company:'Teste Felipa',system_prompt:'Você é Felipa, uma inteligência artificial comercial. Use a base de conhecimento fornecida e não invente informações.',greeting:'Olá, sou a Felipa.',model:'claude-haiku-4-5-20251001',active:true,qualification_threshold:75}).select().single();
  check(!agent.error && agent.data,'Não foi possível configurar a agente.');
  const knowledge=await a.from('knowledge').insert({user_id:users[0],title:'FAQ de verificação',content:'O atendimento inicial desta verificação dura exatamente 30 minutos.'});
  check(!knowledge.error,'Não foi possível salvar a base de conhecimento.');
  const conversation=await a.from('conversations').insert({user_id:users[0],contact_id:contactId,agent_id:agent.data.id,channel:'web',status:'human'}).select().single();
  check(!conversation.error && conversation.data,'Não foi possível criar a conversa.');
  const human=await a.from('messages').insert({user_id:users[0],conversation_id:conversation.data.id,role:'human',content:'Resposta humana de verificação.'});
  check(!human.error,'Não foi possível registrar atendimento humano.');
  const meeting=await a.from('meetings').insert({user_id:users[0],contact_id:contactId,title:'Reunião de verificação',starts_at:new Date(Date.now()+86_400_000).toISOString(),duration:30,location:'Teste interno',status:'scheduled'});
  check(!meeting.error,'Não foi possível registrar a reunião.');
  const hidden=await b.from('contacts').select('id').eq('id',contactId);
  check(!hidden.error && hidden.data?.length === 0,'A segunda conta conseguiu ver o contato da primeira.');
  const crossOwner=await b.from('deals').insert({user_id:users[1],contact_id:contactId,title:'Vínculo cruzado que deve falhar',value:0,stage:'new'});
  check(crossOwner.error?.code === '23503','O banco não bloqueou a referência entre contas.');
  const usageWrite=await a.from('ai_usage').insert({user_id:users[0],model:'claude-haiku-4-5-20251001',status:'completed'});
  check(Boolean(usageWrite.error),'A sessão do usuário conseguiu gravar consumo reservado ao servidor.');
  const rpc=await a.rpc('reserve_ai_request',{p_user_id:users[0],p_model:'claude-haiku-4-5-20251001',p_daily_limit:50});
  check(Boolean(rpc.error),'A sessão do usuário conseguiu reservar uso de IA diretamente.');
  outcomes.rls='verified';
  const signout=await a.auth.signOut();check(!signout.error,'O logout de verificação falhou.');
  const login=await a.auth.signInWithPassword(credentials[0]);
  check(!login.error && login.data.session,'O segundo login real falhou.');
  const persisted=await a.from('contacts').select('notes').eq('id',contactId).single();
  check(!persisted.error && persisted.data?.notes === 'Persistência validada pelo teste real.','O dado salvo não foi recuperado após novo login.');
  outcomes.persistence='verified';outcomes.crm='verified';
  outcomes.claude='not_run';
  if (withAI) {
    const healthResponse=await fetcher(origin+'/api/health');
    const health=await healthResponse.json() as {configured?:{supabase?:boolean;database?:boolean;anthropic?:boolean}};
    check(healthResponse.ok && health.configured?.supabase && health.configured.database && health.configured.anthropic,'A aplicação publicada ainda não tem todas as variáveis necessárias.');
    const resume=await a.from('conversations').update({status:'ai'}).eq('id',conversation.data.id);
    check(!resume.error,'Não foi possível retomar a IA.');
    const response=await fetch(origin+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${login.data.session.access_token}`},body:JSON.stringify({agentId:agent.data.id,conversationId:conversation.data.id,message:'Quanto dura o atendimento inicial informado na base? Responda com a duração.'}),signal:AbortSignal.timeout(60_000)});
    const answer=await response.json() as {text?:string;error?:string;usage?:{input_tokens:number;output_tokens:number}};
    if (!response.ok) {
      const detail=answer.error || '';
      const category=/crédito/i.test(detail) ? 'créditos da API' : /credencial/i.test(detail) ? 'credencial da API' : /limite/i.test(detail) ? 'limite de uso' : 'resposta indisponível';
      throw new SmokeError(`A API de IA retornou HTTP ${response.status}: ${category}.`);
    }
    check(answer.text?.trim() && /\b30\b|trinta/i.test(answer.text) && answer.usage && answer.usage.output_tokens > 0,'A resposta real do Claude ou o uso da base de conhecimento não foi confirmado.');
    const messages=await a.from('messages').select('role').eq('conversation_id',conversation.data.id);
    check(!messages.error && messages.data?.some(m => m.role === 'assistant'),'A resposta da IA não foi persistida.');
    outcomes.claude='verified';outcomes.input_tokens=answer.usage.input_tokens;outcomes.output_tokens=answer.usage.output_tokens;
  }
} catch(error) {failure=error;}
finally {
  if (admin) for (const uid of users) {
    for (const table of ['messages','conversations','deals','meetings','knowledge','agents','contacts','ai_usage']) {
      try {const result=await admin.from(table).delete().eq('user_id',uid);if(result.error) cleanupComplete=false;} catch {cleanupComplete=false;}
    }
    try {const result=await admin.auth.admin.deleteUser(uid);if(result.error)cleanupComplete=false;} catch {cleanupComplete=false;}
  }
}
console.log(JSON.stringify({...outcomes,temporaryAccounts:users.length,cleanup:cleanupComplete ? 'completed' : 'failed'}));
if (failure || !cleanupComplete) {
  console.error(failure instanceof SmokeError ? failure.message : 'A validação não foi concluída. Nenhuma credencial foi registrada.');
  if (!cleanupComplete) console.error('Contas temporárias que podem precisar de limpeza:',users);
  process.exitCode=1;
}
