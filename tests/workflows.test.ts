import test from 'node:test';
import assert from 'node:assert/strict';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Access} from '../server/access.js';
import {activationProblem,executeRun,recordMatches,render,scheduleSlot,scopeMatches,summarizeWorkflow,validateWorkflow,type EngineDeps} from '../server/workflows.js';
import {runAssistant,runTool,type AssistantModel,type ModelRequest} from '../server/assistant.js';
import {defaultSettings} from '../src/lib/settings-types.js';

// In-memory stand-in for the Supabase query builder (same idea as tests/assistant.test.ts), plus rpc.
function fakeDb(tables:Record<string,any[]>,rpc:Record<string,(args:any)=>any>={}){
 let seq=0;
 const from=(table:string)=>{
  const rows=(tables[table]||=[]);
  const filters:((r:any)=>boolean)[]=[];let op:'select'|'insert'|'update'|'delete'='select',payload:any=null,max=Infinity,sort:[string,boolean]|null=null;
  const run=()=>{
   if(op==='insert'){
    const list=(Array.isArray(payload)?payload:[payload]).map(p=>({id:`00000000-0000-4000-8000-${String(++seq).padStart(12,'0')}`,created_at:new Date(Date.now()+seq).toISOString(),...p}));
    if(table==='workflow_runs'||table==='channel_jobs')for(const r of list)if(r.dedupe_key&&rows.some(x=>x.dedupe_key===r.dedupe_key))return {data:null,error:{code:'23505',message:'duplicate'}};
    rows.push(...list);return {data:list,error:null};
   }
   let found=rows.filter(r=>filters.every(f=>f(r)));
   if(op==='update'){found.forEach(r=>Object.assign(r,structuredClone(payload)));return {data:found,error:null};}
   if(op==='delete'){for(const r of found)rows.splice(rows.indexOf(r),1);return {data:found,error:null};}
   if(sort){const [col,asc]=sort;found=[...found].sort((a,b)=>(a[col]>b[col]?1:-1)*(asc?1:-1));}
   return {data:found.slice(0,max),error:null};
  };
  const b:any={
   select:()=>b,insert:(row:any)=>{op='insert';payload=row;return b;},update:(patch:any)=>{op='update';payload=patch;return b;},delete:()=>{op='delete';return b;},
   eq:(c:string,v:any)=>{filters.push(r=>c.includes('->>')?r[c.split('->>')[0]]?.[c.split('->>')[1]]===v:r[c]===v);return b;},neq:(c:string,v:any)=>{filters.push(r=>r[c]!==v);return b;},in:(c:string,v:any[])=>{filters.push(r=>v.includes(r[c]));return b;},
   is:(c:string,v:any)=>{filters.push(r=>(r[c]??null)===v);return b;},gte:(c:string,v:any)=>{filters.push(r=>r[c]>=v);return b;},lt:(c:string,v:any)=>{filters.push(r=>r[c]<v);return b;},not:()=>b,
   order:(c:string,o?:{ascending:boolean})=>{sort=[c,o?.ascending??true];return b;},limit:(n:number)=>{max=n;return b;},
   maybeSingle:async()=>{const r=run();return r.error?r:{data:r.data?.[0]??null,error:null};},single:async()=>{const r=run();return r.data?.[0]?{data:r.data[0],error:null}:{data:null,error:r.error||{message:'none'}};},
   then:(resolve:any,reject:any)=>Promise.resolve(run()).then(resolve,reject),
  };
  return b;
 };
 return {from,rpc:async(name:string,args:any)=>rpc[name]?{data:rpc[name](args),error:null}:{data:true,error:null}} as unknown as SupabaseClient;
}

const OWNER='11111111-1111-4111-8111-111111111111';
const CONTACT='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',DEAL='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',WF='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const contact=()=>({id:CONTACT,user_id:OWNER,name:'Ana Souza',email:'ana@acme.com',phone:'11999990000',company:'Acme',status:'new',score:10,tags:['site'],source:'Site',created_at:'2026-10-01T12:00:00Z'});
const deal=()=>({id:DEAL,user_id:OWNER,contact_id:CONTACT,title:'Acme — site',value:5000,stage:'proposal',stage_changed_at:'2026-10-01T12:00:00Z',created_at:'2026-10-01T12:00:00Z'});

test('validation normalizes a Twenty-style definition and explains mistakes in plain words',()=>{
 const w=validateWorkflow({name:'  Boas-vindas ',trigger:{type:'record.created',object:'contacts',filters:[{field:'phone',op:'not_empty'}]},steps:[{type:'send_whatsapp',config:{text:'Olá {{contact.name}}'}},{type:'delay',config:{minutes:'60'}},{id:'s1',type:'notify',config:{title:'Novo lead'}}]});
 assert.equal(w.name,'Boas-vindas');
 assert.deepEqual(w.steps.map(s=>s.id),['s1','s2','s3'].map((_,i)=>w.steps[i].id));
 assert.equal(new Set(w.steps.map(s=>s.id)).size,3,'step ids are unique');
 assert.equal(w.steps[1].config.minutes,60);
 assert.equal(activationProblem(w),'');
 assert.throws(()=>validateWorkflow({name:'x',trigger:{type:'record.created',object:'contacts',filters:[{field:'senha',op:'eq',value:'1'}]},steps:[]}),/campo "senha" não existe/);
 assert.throws(()=>validateWorkflow({name:'x',trigger:{type:'record.updated',object:'deals'},steps:[{type:'http_request',config:{url:'https://localhost/x'}}]}),/HTTPS público/);
 assert.throws(()=>validateWorkflow({name:'x',trigger:{type:'record.updated',object:'deals'},steps:[{type:'http_request',config:{url:'http://example.com'}}]}),/HTTPS/);
 assert.throws(()=>validateWorkflow({name:'x',trigger:{type:'schedule',schedule:{every:'day',at:'25:00'}},steps:[]}),/HH:mm/);
 assert.throws(()=>validateWorkflow({name:'x',trigger:{type:'manual'},steps:[{type:'update_record',config:{target:'trigger',fields:{name:'a'}}}]}),/não tem registro/);
 assert.throws(()=>validateWorkflow({name:'x',trigger:{type:'record.created',object:'deals'},steps:[{type:'update_record',config:{target:'trigger',fields:{user_id:'x'}}}]}),/não é aceito/);
 assert.throws(()=>validateWorkflow({name:'x',trigger:{type:'record.created',object:'deals'},steps:[{type:'explode',config:{}}]}),/tipo inválido/);
 assert.throws(()=>validateWorkflow({name:'x',trigger:{type:'record.created',object:'deals'},steps:[{type:'delay',config:{minutes:99999999}}]}),/30 dias/);
 assert.equal(activationProblem({trigger:{type:'manual'},steps:[]}),'Adicione ao menos um passo antes de ativar.');
 assert.match(summarizeWorkflow({...w,status:'draft'}),/Gatilho: Contato criado · se phone está preenchido/);
});

test('templates fill variables and keep JSON bodies valid even with quotes in customer data',()=>{
 const scope={contact:{name:'Ana "A" Souza',tags:['vip','site']},deal:{value:5000},steps:{s1:{text:'Oi'}}};
 assert.equal(render('Olá {{contact.name}} ({{ contact.tags }}) {{steps.s1.text}} {{nada.aqui}}',scope),'Olá Ana "A" Souza (vip, site) Oi ');
 const json=render('{"nome":"{{contact.name}}","valor":"{{deal.value}}"}',scope,'json');
 assert.deepEqual(JSON.parse(json),{nome:'Ana "A" Souza',valor:'5000'});
});

test('conditions cover equality, tags, numbers, changes and relative dates',()=>{
 const now=Date.parse('2026-11-01T12:00:00Z');
 const rec={stage:'proposal',value:5000,tags:['VIP'],stage_changed_at:'2026-10-20T12:00:00Z',email:''};
 assert.ok(recordMatches([{field:'stage',op:'eq',value:'Proposal'},{field:'value',op:'gt',value:1000},{field:'tags',op:'contains',value:'vip'},{field:'email',op:'empty'}],rec,null,now));
 assert.ok(recordMatches([{field:'stage_changed_at',op:'older_than_days',value:7}],rec,null,now));
 assert.ok(!recordMatches([{field:'stage_changed_at',op:'newer_than_days',value:7}],rec,null,now));
 assert.ok(recordMatches([{field:'stage',op:'changed'}],rec,{stage:'meeting'},now));
 assert.ok(!recordMatches([{field:'stage',op:'changed'}],rec,null,now));
 assert.ok(scopeMatches([{field:'contact.status',op:'eq',value:'new'},{field:'stage',op:'neq',value:'won'}],{record:rec,contact:{status:'new'}},'all',now));
 assert.ok(scopeMatches([{field:'contact.status',op:'eq',value:'x'},{field:'stage',op:'eq',value:'proposal'}],{record:rec,contact:{status:'new'}},'any',now));
});

test('schedules fire once per window in the workspace time zone',()=>{
 const tz='America/Sao_Paulo';
 assert.equal(scheduleSlot({type:'schedule',schedule:{every:'day',at:'09:00'}},new Date('2026-11-02T12:05:00Z'),tz),'2026-11-02');
 assert.equal(scheduleSlot({type:'schedule',schedule:{every:'day',at:'09:00'}},new Date('2026-11-02T11:55:00Z'),tz),null,'before 09:00 local');
 assert.equal(scheduleSlot({type:'schedule',schedule:{every:'day',at:'09:00'}},new Date('2026-11-02T13:30:00Z'),tz),null,'activation later in the day does not fire a missed slot');
 assert.equal(scheduleSlot({type:'schedule',schedule:{every:'week',at:'09:00',weekday:1}},new Date('2026-11-02T12:05:00Z'),tz),'2026-11-02','2026-11-02 is a Monday');
 assert.equal(scheduleSlot({type:'schedule',schedule:{every:'week',at:'09:00',weekday:2}},new Date('2026-11-02T12:05:00Z'),tz),null);
 assert.equal(scheduleSlot({type:'schedule',schedule:{every:'hour'}},new Date('2026-11-02T12:05:00Z'),tz),'2026-11-02T09');
});

function engine(steps:any[],trigger:any={type:'record.updated',object:'deals',fields:['stage']},status='active'){
 const tables:Record<string,any[]>={contacts:[contact()],deals:[deal()],workflow_runs:[],workspace_settings:[],workspace_webhooks:[],workspace_notifications:[],integration_accounts:[],channel_jobs:[],deal_tasks:[],deal_notes:[],workspace_audit:[],
  workflows:[{id:WF,user_id:OWNER,name:'Proposta',status,trigger,steps:validateWorkflow({name:'x',trigger,steps}).steps,run_count:0}]};
 const db=fakeDb(tables);
 const run:Record<string,any>={id:'run-1',user_id:OWNER,workflow_id:WF,status:'running',trigger_kind:'record.updated',record_table:'deals',record_id:DEAL,context:{record:deal(),previous:{...deal(),stage:'meeting'}},log:[],step_index:0};
 tables.workflow_runs.push(run);
 const calls:{whatsapp:any[];http:any[];ai:string[]}={whatsapp:[],http:[],ai:[]};
 const deps:EngineDeps={whatsapp:(async(_a:Access,b:any)=>{calls.whatsapp.push(b);return {queued:true,conversationId:'conv-1',jobId:'job'};}) as any,http:async input=>{calls.http.push(input);return {status:200,body:'{"ok":true,"ticket":42}'};},ai:async({prompt})=>{calls.ai.push(prompt);return 'Texto da IA para Ana';}};
 return {tables,db,run,calls,deps};
}

test('a run executes each step in order, passes outputs forward and pauses on a delay',async()=>{
 let clock=Date.parse('2026-11-02T12:00:00Z');
 const {tables,db,run,calls,deps}=engine([
  {id:'s1',type:'condition',config:{filters:[{field:'stage',op:'eq',value:'proposal'},{field:'contact.status',op:'eq',value:'new'}]}},
  {id:'s2',type:'update_record',config:{target:'contact',fields:{status:'qualifying'}}},
  {id:'s3',type:'tag_contact',config:{add:['proposta','site'],remove:['frio']}},
  {id:'s4',type:'ai_generate',config:{prompt:'Mensagem para {{contact.name}} sobre {{deal.title}}'}},
  {id:'s5',type:'send_whatsapp',config:{text:'{{steps.s4.text}}'}},
  {id:'s6',type:'http_request',config:{method:'POST',url:'https://hooks.example.com/x',body:'{"lead":"{{contact.name}}","valor":"{{deal.value}}"}'}},
  {id:'s7',type:'delay',config:{minutes:1440}},
  {id:'s8',type:'create_record',config:{object:'deal_tasks',fields:{title:'Follow-up {{deal.title}} (ticket {{steps.s6.body.ticket}})',due_in_days:2}}},
  {id:'s9',type:'notify',config:{title:'Proposta enviada: {{deal.title}}'}},
 ]);
 const first=await executeRun(db,run,{...deps,now:()=>clock});
 assert.equal(first.status,'pending');
 const saved=tables.workflow_runs[0];
 assert.equal(saved.step_index,7);
 assert.equal(saved.available_at,'2026-11-03T12:00:00.000Z');
 assert.deepEqual(saved.log.map((l:any)=>`${l.id}:${l.status}`),['s1:ok','s2:ok','s3:ok','s4:ok','s5:ok','s6:ok','s7:waiting']);
 assert.equal(tables.contacts[0].status,'qualifying');
 assert.deepEqual(tables.contacts[0].tags,['site','proposta']);
 assert.equal(calls.ai[0],'Mensagem para Ana Souza sobre Acme — site');
 assert.equal(calls.whatsapp[0].text,'Texto da IA para Ana');
 assert.equal(calls.whatsapp[0].contactId,CONTACT);
 assert.deepEqual(JSON.parse(calls.http[0].body),{lead:'Ana Souza',valor:'5000'});

 clock+=86400000;
 const resumed=await executeRun(db,{...saved},{...deps,now:()=>clock});
 assert.equal(resumed.status,'completed');
 assert.equal(tables.deal_tasks[0].title,'Follow-up Acme — site (ticket 42)');
 assert.equal(tables.deal_tasks[0].due_at,'2026-11-05T12:00:00.000Z');
 assert.equal(tables.workspace_notifications[0].title,'Proposta enviada: Acme — site');
 assert.equal(tables.workflow_runs[0].status,'completed');
 assert.equal(calls.whatsapp.length,1,'resuming after the delay does not resend earlier steps');
});

test('an unmet condition stops the run quietly, and a failure skips the remaining steps',async()=>{
 const a=engine([{type:'condition',config:{filters:[{field:'value',op:'gt',value:99999}]}},{type:'send_whatsapp',config:{text:'oi'}}]);
 assert.equal((await executeRun(a.db,a.run,a.deps)).status,'completed');
 assert.deepEqual(a.tables.workflow_runs[0].log.map((l:any)=>l.status),['stopped']);
 assert.equal(a.calls.whatsapp.length,0);

 const b=engine([{type:'send_email',config:{subject:'Oi',text:'Olá'}},{type:'notify',config:{title:'x'}}]);
 assert.equal((await executeRun(b.db,b.run,b.deps)).status,'failed');
 assert.match(b.tables.workflow_runs[0].error,/Conecte uma conta Google/);
 assert.deepEqual(b.tables.workflow_runs[0].log.map((l:any)=>l.status),['failed','skipped']);
});

test('a paused automation does not run queued events, and emails go to the existing queue once',async()=>{
 const p=engine([{type:'notify',config:{title:'x'}}],undefined,'paused');
 assert.equal((await executeRun(p.db,p.run,p.deps)).status,'stopped');

 const e=engine([{type:'send_email',config:{subject:'Proposta {{deal.title}}',text:'Olá {{contact.name}}'}}]);
 e.tables.integration_accounts.push({user_id:OWNER,provider:'google',label:'vendas@acme.com'});
 const r=await executeRun(e.db,e.run,e.deps);
 assert.equal(r.emails,1);
 assert.deepEqual(e.tables.channel_jobs[0].payload,{to:'ana@acme.com',subject:'Proposta Acme — site',text:'Olá Ana Souza'});
 assert.equal(e.tables.channel_jobs[0].dedupe_key,'wf:run-1:s1');
});

test('an interrupted HTTP call is not repeated automatically',async()=>{
 const h=engine([{id:'s1',type:'http_request',config:{method:'POST',url:'https://hooks.example.com/x'}}]);
 h.run.context={...h.run.context,loaded:true,contact:contact(),deal:deal(),steps:{},__inflight:'s1'};
 assert.equal((await executeRun(h.db,h.run,h.deps)).status,'failed');
 assert.equal(h.calls.http.length,0);
 assert.match(h.tables.workflow_runs[0].error,/não foi repetida/);
});

// ---------- Assistente ----------
const scripted=(steps:((request:ModelRequest)=>{content:any[];stop?:string})[]):{model:AssistantModel;requests:ModelRequest[]}=>{
 const requests:ModelRequest[]=[];let i=0;
 return {requests,model:async request=>{requests.push(structuredClone(request));const step=steps[i++]??steps[steps.length-1];const out=step(request);return {content:out.content,stop_reason:out.stop??'end_turn',usage:{input_tokens:10,output_tokens:5}};}};
};
const use=(id:string,name:string,input:object)=>({type:'tool_use',id,name,input});
const say=(text:string)=>({type:'text',text});
const access=(tables:Record<string,any[]>,role:'admin'|'manager'|'seller'='admin'):Access=>({db:fakeDb(tables),user:{id:OWNER,email:'felipe@oliveira.co'} as any,ownerId:OWNER,role,settings:defaultSettings(),sessionId:'s',token:'t',ip:'127.0.0.1'});

test('the assistant builds an automation as a draft and cannot activate it in the same answer',async()=>{
 const tables:Record<string,any[]>={workflows:[],workspace_audit:[],workflow_runs:[]};
 const a=access(tables);
 const definition={name:'Tarefa na proposta',trigger:{type:'record.updated',object:'deals',fields:['stage'],filters:[{field:'stage',op:'eq',value:'proposal'}]},steps:[{id:'s1',type:'create_record',config:{object:'deal_tasks',fields:{title:'Follow-up {{deal.title}}',due_in_days:2}}}]};
 const {model,requests}=scripted([
  ()=>({stop:'tool_use',content:[use('t1','create_automation',definition)]}),
  r=>{const created=JSON.parse((r.messages.at(-1)!.content as any[])[0].content);return {stop:'tool_use',content:[use('t2','activate_automation',{automation_id:created.id,confirmed_by_user:true})]};},
  ()=>({content:[say('Criei como rascunho. **Quando** uma oportunidade for para Proposta, **então** crio uma tarefa. Posso ativar?')]}),
 ]);
 const first=await runAssistant(a,{message:'Quando uma oportunidade for para proposta, crie uma tarefa de follow-up em 2 dias',threadId:null,history:[]},{model,modelName:'claude-haiku-4-5'});
 assert.equal(tables.workflows.length,1);
 assert.equal(tables.workflows[0].status,'draft');
 assert.equal(tables.workflows[0].created_via,'assistant');
 assert.equal(first.actions[0].ok,true);assert.equal(first.actions[0].href,`workflows/${tables.workflows[0].id}`);
 assert.equal(first.actions[1].ok,false,'same-turn activation is refused');
 assert.match(first.actions[1].error!,/nesta mesma resposta/);
 assert.match(requests[0].system,/Posso ativar\?/);
 assert.ok(requests[0].tools.some(t=>t.name==='create_automation'&&/RASCUNHO/.test(t.description||'')));

 // Next message: the person confirms; activation now succeeds.
 const id=tables.workflows[0].id;
 const second=scripted([()=>({stop:'tool_use',content:[use('t3','activate_automation',{automation_id:id,confirmed_by_user:true})]}),()=>({content:[say('Ativada.')]})]);
 const reply=await runAssistant(a,{message:'Pode ativar',threadId:null,history:[{role:'user',content:'crie'},{role:'assistant',content:'Posso ativar?',actions:first.actions}]},{model:second.model,modelName:'claude-haiku-4-5'});
 assert.equal(reply.actions[0].ok,true);
 assert.equal(tables.workflows[0].status,'active');
 assert.match(second.requests[0].messages[1].content as string,new RegExp(`id ${id}`),'history keeps the automation id for follow-ups');
});

test('assistant guards: confirmation for active edits and runs, no delete tool, sellers blocked',async()=>{
 const tables:Record<string,any[]>={workflows:[{id:WF,user_id:OWNER,name:'Ativa',description:'',status:'active',trigger:{type:'manual'},steps:[{id:'s1',type:'notify',config:{title:'x'}}],run_count:0,created_via:'panel'}],workspace_audit:[],workflow_runs:[]};
 const ctx=(role:'admin'|'seller'='admin')=>({a:access(tables,role),threadId:null,toolUseId:'t',sends:{count:0},timeZone:'UTC',touched:new Set<string>()});
 const edit=await runTool(ctx(),'update_automation',{automation_id:WF,name:'Novo nome'});
 assert.equal(edit.card.ok,false);assert.match(edit.card.error!,/está ativa/);
 const confirmed=await runTool(ctx(),'update_automation',{automation_id:WF,name:'Novo nome',confirmed_by_user:true});
 assert.equal(confirmed.card.ok,true);assert.equal(tables.workflows[0].name,'Novo nome');
 const paused=await runTool(ctx(),'pause_automation',{automation_id:WF});
 assert.equal(paused.card.ok,true);assert.equal(tables.workflows[0].status,'paused');
 const run=await runTool(ctx(),'run_automation',{automation_id:WF});
 assert.equal(run.card.ok,false,'a paused automation needs explicit confirmation to run');
 const seller=await runTool(ctx('seller'),'list_automations',{});
 assert.equal(seller.card.ok,false);
 const {assistantToolDefinitions}=await import('../server/assistant.js');
 assert.ok(assistantToolDefinitions.every(t=>!/delete|remove|erase|drop/i.test(t.name)));
});

// ---------- Banco ----------
test('workflow migration is repeatable, closed to clients, captures events only for active automations and never blocks writes',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');
 const {readFile}=await import('node:fs/promises');
 const db=new PGlite();
 try{
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key);
   create function auth.role() returns text language sql stable as $b$ select current_setting('request.jwt.claims', true)::jsonb ->> 'role' $b$;
   grant usage on schema public, auth to anon,authenticated,service_role;insert into auth.users values('${OWNER}');
   create table public.contacts(id uuid primary key default gen_random_uuid(),user_id uuid not null,name text,status text default 'new');
   create table public.messages(id uuid primary key default gen_random_uuid(),user_id uuid not null,conversation_id uuid,role text,content text);`);
  const sql=await readFile(new URL('../supabase/migrations/202611050008_workflows.sql',import.meta.url),'utf8');
  await db.exec(sql);await db.exec(sql);
  await db.exec(`insert into public.contacts(user_id,name) values('${OWNER}','Sem automação')`);
  assert.equal((await db.query('select 1 from public.workflow_events')).rows.length,0,'no active automation, no event');
  await db.exec(`insert into public.workflows(user_id,name,status,trigger) values('${OWNER}','A','active','{"type":"record.created","object":"contacts"}'),('${OWNER}','B','active','{"type":"message.received"}'),('${OWNER}','C','draft','{"type":"record.updated","object":"contacts"}')`);
  await db.exec(`insert into public.contacts(user_id,name) values('${OWNER}','Ana')`);
  await db.exec(`update public.contacts set status='qualified' where name='Ana'`);
  await db.exec(`insert into public.messages(user_id,role,content) values('${OWNER}','user','oi'),('${OWNER}','assistant','olá')`);
  const events=await db.query<{object:string;op:string}>('select object,op from public.workflow_events order by id');
  assert.deepEqual(events.rows,[{object:'contacts',op:'created'},{object:'messages',op:'created'}],'draft triggers and outgoing messages are ignored');
  // A broken capture never blocks the original write.
  await db.exec('alter table public.workflow_events rename to workflow_events_off');
  await db.exec(`insert into public.contacts(user_id,name) values('${OWNER}','Ainda grava')`);
  await db.exec('alter table public.workflow_events_off rename to workflow_events');
  assert.equal((await db.query(`select 1 from public.contacts where name='Ainda grava'`)).rows.length,1);
  const flags=await db.query<{relrowsecurity:boolean;relforcerowsecurity:boolean}>(`select relrowsecurity,relforcerowsecurity from pg_class where relname in ('workflows','workflow_runs','workflow_events')`);
  assert.equal(flags.rows.length,3);assert.ok(flags.rows.every(r=>r.relrowsecurity&&r.relforcerowsecurity));
  await db.exec('set role authenticated');
  await assert.rejects(db.query('select * from public.workflows'),/permission denied/);
  await assert.rejects(db.query('select * from public.workflow_claim_events(10)'),/permission denied|SERVICE_ROLE_REQUIRED/);
  await db.exec('reset role');
  await db.exec(`set request.jwt.claims='{"role":"service_role"}'`);
  assert.equal((await db.query('select * from public.workflow_claim_events(10)')).rows.length,2);
  assert.equal((await db.query('select * from public.workflow_claim_events(10)')).rows.length,0,'events are claimed once');
  const wf=await db.query<{id:string}>(`select id from public.workflows where name='A'`);
  await db.exec(`insert into public.workflow_runs(user_id,workflow_id,dedupe_key) values('${OWNER}','${wf.rows[0].id}','k1'),('${OWNER}','${wf.rows[0].id}',null),('${OWNER}','${wf.rows[0].id}',null)`);
  await assert.rejects(db.exec(`insert into public.workflow_runs(user_id,workflow_id,dedupe_key) values('${OWNER}','${wf.rows[0].id}','k1')`),/duplicate/);
  assert.equal((await db.query('select * from public.workflow_claim_runs(10)')).rows.length,3);
  assert.equal((await db.query('select * from public.workflow_claim_runs(10)')).rows.length,0,'leased runs are not claimed twice');
  await db.exec(`delete from public.workflows where name='A'`);
  assert.equal((await db.query('select 1 from public.workflow_runs')).rows.length,0,'runs cascade with the automation');
 }finally{await db.close();}
});

test('events become runs only for matching active automations, with a loop guard per record',async()=>{
 const {fanOutEvents}=await import('../server/workflows.js');
 const wf=(id:string,trigger:any,status='active')=>({id,user_id:OWNER,name:id,status,trigger,steps:[{id:'s1',type:'notify',config:{title:'x'}}],run_count:0});
 const tables:Record<string,any[]>={workflow_runs:[],conversations:[{id:'conv-1',user_id:OWNER,channel:'whatsapp',contact_id:CONTACT}],workflows:[
  wf('stage',{type:'record.updated',object:'deals',fields:['stage'],filters:[{field:'stage',op:'eq',value:'won'}]}),
  wf('value',{type:'record.updated',object:'deals',fields:['value']}),
  wf('paused',{type:'record.updated',object:'deals'},'paused'),
  wf('wa',{type:'message.received',channel:'whatsapp'}),
  wf('mail',{type:'message.received',channel:'email'}),
 ]};
 let queue:any[]=[
  {id:1,user_id:OWNER,object:'deals',op:'updated',record_id:DEAL,record:{...deal(),stage:'won'},previous:deal()},
  {id:2,user_id:OWNER,object:'messages',op:'created',record_id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',record:{id:'m',conversation_id:'conv-1',role:'user',content:'oi'},previous:null},
 ];
 let perRecord=true;
 const db=fakeDb(tables,{workflow_claim_events:()=>{const out=queue;queue=[];return out;},workspace_rate:(args:any)=>String(args.p_bucket).endsWith(':day')||perRecord});
 assert.equal(await fanOutEvents(db),2);
 assert.deepEqual(tables.workflow_runs.map(r=>r.workflow_id).sort(),['stage','wa']);
 assert.equal(tables.workflow_runs.find(r=>r.workflow_id==='wa').context.record.channel,'whatsapp');
 // Same deal changes again within the hour: the per-record guard stops it and records why, once.
 queue=[{id:3,user_id:OWNER,object:'deals',op:'updated',record_id:DEAL,record:{...deal(),stage:'won',value:1},previous:{...deal(),stage:'lost',value:1}}];
 perRecord=false;
 assert.equal(await fanOutEvents(db),0);
 const stopped=tables.workflow_runs.filter(r=>r.status==='stopped');
 assert.equal(stopped.length,1);assert.match(stopped[0].error,/proteção contra repetição/);
});

test('the dedicated scheduler only calls the server when there is automation work',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');
 const {readFile}=await import('node:fs/promises');
 const db=new PGlite();
 try{
  // Stubs for Supabase-managed pieces (pg_cron, pg_net, Vault): the test checks our SQL logic, not those services.
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key);
   create function auth.role() returns text language sql stable as $b$ select current_setting('request.jwt.claims', true)::jsonb ->> 'role' $b$;
   insert into auth.users values('${OWNER}');
   create schema cron;create table cron.job(jobname text,schedule text,command text);
   create function cron.schedule(n text,s text,c text) returns bigint language sql as $b$ insert into cron.job values(n,s,c);select 1::bigint $b$;
   create function cron.unschedule(n text) returns boolean language sql as $b$ delete from cron.job where jobname=n;select true $b$;
   create schema net;create table net.calls(url text);
   create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds int) returns bigint language sql as $b$ insert into net.calls values(url);select 7::bigint $b$;
   create schema vault;create table vault.decrypted_secrets(name text,decrypted_secret text);insert into vault.decrypted_secrets values('felipa_whatsapp_worker','x');`);
  await db.exec(await readFile(new URL('../supabase/migrations/202611050008_workflows.sql',import.meta.url),'utf8'));
  const scheduler=(await readFile(new URL('../supabase/workflows-scheduler.sql',import.meta.url),'utf8')).replace(/^create extension.*$/gm,'');
  await db.exec(scheduler);await db.exec(scheduler);
  assert.equal((await db.query(`select 1 from cron.job where jobname='oliveira_workflows'`)).rows.length,1,'scheduled once, re-runnable');
  assert.equal((await db.query<{r:number|null}>('select public.workflow_dispatch_pending() as r')).rows[0].r,null,'idle: no call');
  const wf=await db.query<{id:string}>(`insert into public.workflows(user_id,name,status) values('${OWNER}','A','active') returning id`);
  await db.exec(`insert into public.workflow_runs(user_id,workflow_id) values('${OWNER}','${wf.rows[0].id}')`);
  assert.equal((await db.query<{r:number}>('select public.workflow_dispatch_pending() as r')).rows[0].r,7);
  assert.match((await db.query<{url:string}>('select url from net.calls')).rows[0].url,/whatsapp-worker\?workflows=1$/);
 }finally{await db.close();}
});
