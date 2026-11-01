import test from 'node:test';
import assert from 'node:assert/strict';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Access} from '../server/access.js';
import {assistantChat,assistantToolDefinitions,historyForModel,MAX_SENDS_PER_REQUEST,requestUuid,runAssistant,runTool,toInstant,validateHistory,type AssistantModel,type ModelRequest} from '../server/assistant.js';
import {defaultSettings} from '../src/lib/settings-types.js';

// In-memory stand-in for the Supabase query builder, with the filters the assistant uses.
function fakeDb(tables:Record<string,any[]>){
 let seq=0;
 const from=(table:string)=>{
  const rows=(tables[table]||=[]);
  const filters:((r:any)=>boolean)[]=[];let op:'select'|'insert'|'update'|'delete'='select',payload:any=null,max=Infinity,sort:[string,boolean]|null=null;
  const run=()=>{
   if(op==='insert'){const list=(Array.isArray(payload)?payload:[payload]).map(p=>({id:`${table}-${++seq}`,created_at:new Date(Date.now()+seq).toISOString(),...p}));rows.push(...list);return {data:list,error:null};}
   let found=rows.filter(r=>filters.every(f=>f(r)));
   if(op==='update'){found.forEach(r=>Object.assign(r,payload));return {data:found,error:null};}
   if(op==='delete'){for(const r of found)rows.splice(rows.indexOf(r),1);return {data:found,error:null};}
   if(sort){const [col,asc]=sort;found=[...found].sort((a,b)=>(a[col]>b[col]?1:-1)*(asc?1:-1));}
   return {data:found.slice(0,max),error:null};
  };
  const b:any={
   select:()=>b,insert:(row:any)=>{op='insert';payload=row;return b;},update:(patch:any)=>{op='update';payload=patch;return b;},delete:()=>{op='delete';return b;},
   eq:(c:string,v:any)=>{filters.push(r=>r[c]===v);return b;},neq:(c:string,v:any)=>{filters.push(r=>r[c]!==v);return b;},in:(c:string,v:any[])=>{filters.push(r=>v.includes(r[c]));return b;},
   is:(c:string,v:any)=>{filters.push(r=>(r[c]??null)===v);return b;},gte:(c:string,v:any)=>{filters.push(r=>r[c]>=v);return b;},lt:(c:string,v:any)=>{filters.push(r=>r[c]<v);return b;},
   ilike:(c:string,v:string)=>{const needle=v.replaceAll('%','').toLowerCase();filters.push(r=>String(r[c]??'').toLowerCase().includes(needle));return b;},
   or:(expr:string)=>{const parts=expr.split(',').map(p=>{const [c,,v]=p.split('.');return [c,v.replaceAll('%','').toLowerCase()] as const;});filters.push(r=>parts.some(([c,n])=>String(r[c]??'').toLowerCase().includes(n)));return b;},
   order:(c:string,o?:{ascending:boolean})=>{sort=[c,o?.ascending??true];return b;},limit:(n:number)=>{max=n;return b;},
   maybeSingle:async()=>({data:run().data[0]??null,error:null}),single:async()=>{const r=run();return r.data[0]?{data:r.data[0],error:null}:{data:null,error:{message:'none'}};},
   then:(resolve:any,reject:any)=>Promise.resolve(run()).then(resolve,reject),
  };
  return b;
 };
 return {from} as unknown as SupabaseClient;
}

const OWNER='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222';
function access(tables:Record<string,any[]>,role:'admin'|'seller'='admin'):Access{
 return {db:fakeDb(tables),user:{id:OWNER,email:'felipe@oliveira.co'} as any,ownerId:OWNER,role,settings:defaultSettings(),sessionId:'s',token:'t',ip:'127.0.0.1'};
}
const scripted=(steps:((request:ModelRequest)=>{content:any[];stop?:string})[]):{model:AssistantModel;requests:ModelRequest[]}=>{
 const requests:ModelRequest[]=[];let i=0;
 return {requests,model:async request=>{requests.push(structuredClone(request));const step=steps[i++]??steps[steps.length-1];const out=step(request);return {content:out.content,stop_reason:out.stop??'end_turn',usage:{input_tokens:10,output_tokens:5}};}};
};
const use=(id:string,name:string,input:object)=>({type:'tool_use',id,name,input});
const say=(text:string)=>({type:'text',text});

test('toInstant converts the workspace local time to UTC and keeps explicit offsets',()=>{
 assert.equal(toInstant('2026-11-05T14:30','America/Sao_Paulo'),'2026-11-05T17:30:00.000Z');
 assert.equal(toInstant('2026-11-05','America/Sao_Paulo'),'2026-11-05T12:00:00.000Z');
 assert.equal(toInstant('2026-11-05T14:30:00Z','America/Sao_Paulo'),'2026-11-05T14:30:00.000Z');
 assert.equal(toInstant('2026-11-05T14:30-03:00','UTC'),'2026-11-05T17:30:00.000Z');
 assert.throws(()=>toInstant('amanhã às 3','America/Sao_Paulo'));
});

test('WhatsApp request ids are deterministic valid UUIDs, so a repeated tool call cannot send twice',()=>{
 const a=requestUuid(OWNER,'thread','toolu_1'),b=requestUuid(OWNER,'thread','toolu_1'),c=requestUuid(OWNER,'thread','toolu_2');
 assert.equal(a,b);assert.notEqual(a,c);
 assert.match(a,/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('the assistant has no tool that deletes data',()=>{
 const names=assistantToolDefinitions.map(t=>t.name);
 assert.ok(names.includes('create_contact')&&names.includes('send_whatsapp')&&names.includes('create_deal'));
 assert.ok(names.every(n=>!/delete|remove|erase|drop/i.test(n)));
});

test('tool loop reads and writes through the workspace scope and reports each action as a card',async()=>{
 const tables:Record<string,any[]>={contacts:[
  {id:'c-ana',user_id:OWNER,name:'Ana Souza',email:'ana@acme.com',phone:'11999990000',company:'Acme',status:'new',score:0,source:'Manual',created_at:'2026-10-01'},
  {id:'c-other',user_id:OTHER,name:'Ana de Outro Workspace',email:'',phone:'',company:'',status:'new',score:0,source:'Manual',created_at:'2026-10-02'},
 ]};
 const a=access(tables);
 const {model,requests}=scripted([
  ()=>({stop:'tool_use',content:[say('Vou buscar e criar.'),use('t1','search_contacts',{query:'ana'}),use('t2','create_contact',{name:'Bruno Lima',company:'Beta',phone:'11988887777'}),use('t3','create_deal',{title:'Beta — site',contact_id:'11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa',value:5000})]}),
  ()=>({content:[say('Pronto: **Bruno** foi criado.')]}),
 ]);
 const result=await runAssistant(a,{message:'Crie o Bruno da Beta',threadId:null,history:[]},{model,modelName:'claude-haiku-4-5'});
 assert.equal(result.text,'Pronto: **Bruno** foi criado.');
 assert.equal(result.actions.length,3);
 const [search,create,deal]=result.actions;
 assert.deepEqual([search.ok,search.kind],[true,'read']);
 assert.deepEqual([create.ok,create.kind,create.title],[true,'create','Contato criado']);
 assert.match(create.href!,/^contacts\/contacts-/);
 // The deal points at a contact that does not exist in this workspace: it must fail and not be saved.
 assert.equal(deal.ok,false);assert.equal(tables.deals?.length??0,0);
 const created=tables.contacts.find(c=>c.name==='Bruno Lima');
 assert.equal(created.user_id,OWNER);assert.equal(created.source,'Assistente de IA');
 // Search never returned the other workspace's contact.
 const toolResults=(requests[1].messages.at(-1)!.content as any[]);
 assert.equal(toolResults.length,3);
 const found=JSON.parse(toolResults[0].content);
 assert.deepEqual(found.contatos.map((c:any)=>c.name),['Ana Souza']);
 assert.equal(toolResults[2].is_error,true);
 assert.deepEqual(result.usage,{input_tokens:20,output_tokens:10});
 // Each write is recorded in the audit trail.
 assert.ok(tables.workspace_audit.some(r=>String(r.action).includes('Contato criado')));
});

test('unknown tools and invalid input become error results instead of breaking the loop',async()=>{
 const a=access({contacts:[]});
 const {model}=scripted([
  ()=>({stop:'tool_use',content:[use('t1','delete_everything',{}),use('t2','create_contact',{}),use('t3','create_meeting',{title:'Call',start:'quando der'})]}),
  ()=>({content:[say('Não consegui.')]}),
 ]);
 const result=await runAssistant(a,{message:'faça',threadId:null,history:[]},{model,modelName:'claude-haiku-4-5'});
 assert.deepEqual(result.actions.map(x=>x.ok),[false,false,false]);
 assert.equal(result.text,'Não consegui.');
});

test('meetings are booked in the workspace time zone',async()=>{
 const tables:Record<string,any[]>={meetings:[]};
 const out=await runTool({a:access(tables),threadId:null,toolUseId:'t',sends:{count:0},timeZone:'America/Sao_Paulo'},'create_meeting',{title:'Diagnóstico',start:'2026-11-05T14:30',duration:45});
 assert.equal(out.card.ok,true);
 assert.equal(tables.meetings[0].starts_at,'2026-11-05T17:30:00.000Z');assert.equal(tables.meetings[0].duration,45);
});

test('WhatsApp sends are capped per request and never reach the queue past the cap',async()=>{
 const sends={count:MAX_SENDS_PER_REQUEST};
 const out=await runTool({a:access({contacts:[]}),threadId:null,toolUseId:'t',sends,timeZone:'UTC'},'send_whatsapp',{contact_id:'c',text:'Oi'});
 assert.equal(out.card.ok,false);assert.equal(sends.count,MAX_SENDS_PER_REQUEST);
});

test('the loop stops at the step limit with an honest message',async()=>{
 const {model,requests}=scripted([()=>({stop:'tool_use',content:[use(`t${Math.random()}`,'get_overview',{})]})]);
 const result=await runAssistant(access({contacts:[],deals:[],deal_tasks:[],meetings:[],conversations:[]}),{message:'resumo',threadId:null,history:[]},{model,modelName:'claude-haiku-4-5'});
 assert.equal(requests.length,8);
 assert.match(result.text,/limite de passos/);
});

test('the system prompt keeps customer content untrusted and gives the current time',async()=>{
 const {model,requests}=scripted([()=>({content:[say('Oi')]})]);
 await runAssistant(access({}),{message:'oi',threadId:null,history:[]},{model,modelName:'claude-haiku-4-5'});
 assert.match(requests[0].system,/dados não confiáveis/);
 assert.match(requests[0].system,/America\/Sao_Paulo/);
 assert.match(requests[0].system,/explicitamente para enviar/);
});

test('history keeps the recorded actions so follow-ups can refer to them, and always starts with the user',()=>{
 const history=historyForModel([
  {role:'assistant',content:'Olá'},
  {role:'user',content:'Crie a Ana'},
  {role:'assistant',content:'Criei.',actions:[{id:'1',tool:'create_contact',kind:'create',title:'Contato criado',detail:'Ana',ref:'abc',ok:true}]},
 ]);
 assert.equal(history[0].role,'user');
 assert.match(history[1].content,/Contato criado \(Ana\) \[id abc\]/);
 assert.throws(()=>validateHistory('x'));
 assert.deepEqual(validateHistory([{role:'user',content:'oi',actions:[{title:'T',kind:'send',ok:false,error:'x'}]}])[0].actions?.[0].kind,'send');
});

test('sellers cannot use the workspace assistant',async()=>{
 await assert.rejects(assistantChat(access({},'seller'),{message:'oi'}),(e:any)=>e.status===403);
 await assert.rejects(assistantChat(access({}),{message:''}),(e:any)=>e.status===400);
});

test('assistant history migration is repeatable, closed to direct clients and cascades with the thread',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');
 const {readFile}=await import('node:fs/promises');
 const db=new PGlite();
 try{
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key);grant usage on schema public to anon,authenticated,service_role;insert into auth.users values('${OWNER}');`);
  const sql=await readFile(new URL('../supabase/migrations/202611040007_assistant.sql',import.meta.url),'utf8');
  await db.exec(sql);await db.exec(sql);
  const t=await db.query<{id:string}>(`insert into public.assistant_threads(owner_id,author_id,title) values('${OWNER}','${OWNER}','Teste') returning id`);
  await db.exec(`insert into public.assistant_messages(owner_id,thread_id,role,content) values('${OWNER}','${t.rows[0].id}','user','oi')`);
  const flags=await db.query<{relname:string;relrowsecurity:boolean;relforcerowsecurity:boolean}>(`select relname,relrowsecurity,relforcerowsecurity from pg_class where relname in ('assistant_threads','assistant_messages')`);
  assert.equal(flags.rows.length,2);assert.ok(flags.rows.every(r=>r.relrowsecurity&&r.relforcerowsecurity));
  await db.exec('set role authenticated');
  await assert.rejects(db.query('select * from public.assistant_messages'),/permission denied/);
  await db.exec('reset role');
  await db.exec(`delete from public.assistant_threads where id='${t.rows[0].id}'`);
  assert.equal((await db.query('select 1 from public.assistant_messages')).rows.length,0);
 }finally{await db.close();}
});
