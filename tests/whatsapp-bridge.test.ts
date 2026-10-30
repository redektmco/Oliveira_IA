import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {parseWhatsAppEvent,secretMatches} from '../server/whatsapp-events.js';
const instance='v4',jid='5511999999999@s.whatsapp.net';
function event(changes:Record<string,unknown>={}){return {event:'messages.upsert',instance,data:{key:{id:'message-1',remoteJid:jid,fromMe:false},message:{conversation:'Olá'},messageTimestamp:Date.now()/1000,pushName:'Contato',...changes}};}
test('WhatsApp authentication never accepts a missing secret; parser filters other instances, groups, echoes and unsupported events',()=>{
 assert.equal(secretMatches(undefined,undefined),false);assert.equal(secretMatches('x','x'),true);assert.equal(secretMatches('y','x'),false);
 assert.equal(parseWhatsAppEvent(event(),instance)?.text,'Olá');
 assert.equal(parseWhatsAppEvent({...event(),instance:'another'},instance),null);
 assert.equal(parseWhatsAppEvent({...event(),event:'messages.update'},instance),null);
 assert.equal(parseWhatsAppEvent(event({key:{id:'x',remoteJid:'123@g.us',fromMe:false}}),instance),null);
 assert.equal(parseWhatsAppEvent(event({key:{id:'x',remoteJid:'status@broadcast',fromMe:false}}),instance),null);
 assert.equal(parseWhatsAppEvent(event({message:{reactionMessage:{text:'👍'}}}),instance),null);
 assert.equal(parseWhatsAppEvent(event({message:{audioMessage:{url:'https://private-media'}}}),instance)?.needsHuman,true);
 assert.equal(parseWhatsAppEvent(event({key:{id:'x',remoteJid:'123456789@lid',remoteJidAlt:jid,fromMe:false}}),instance)?.jid,jid);
 assert.equal(parseWhatsAppEvent(event({key:{id:'x',remoteJid:'123456789@lid',fromMe:false}}),instance),null);
 assert.equal(parseWhatsAppEvent(event({message:{conversation:'a'.repeat(5000)}}),instance)?.needsHuman,true);
});

test('WhatsApp SQL enforces whitelist, durable deduplication, handoff, leases, echo reconciliation and private queue',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claims',true)::jsonb->>'sub','')::uuid$$;create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb->>'role'$$;grant usage on schema auth,public to authenticated,anon,service_role;`);
  for(const name of ['202610200001_initial.sql','202610300002_whatsapp.sql']){const sql=await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);}
  const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',agent='33333333-3333-4333-8333-333333333333';
  await db.exec(`insert into auth.users(id) values('${owner}'),('${other}');insert into public.agents(id,user_id,name) values('${agent}','${owner}','Felipa');insert into public.whatsapp_channels(instance,user_id,agent_id,enabled,activated_at,ai_allowlist) values('v4','${owner}','${agent}',true,now()-interval '1 hour',array['5511999999999']);set role service_role;set request.jwt.claims='{"role":"service_role"}';`);
  const ingest=async(id:string,text='Olá',fromMe=false,phone=jid)=>{const r=await db.query<{r:any}>('select public.whatsapp_ingest($1,$2,$3,$4,$5,$6) r',['v4',phone,id,text,'Cliente',fromMe]);return r.rows[0].r;};
  const first=await ingest('one');assert.equal(first.queued,true);
  assert.equal((await ingest('one')).duplicate,true);
  let count=await db.query<{n:number}>('select count(*)::int n from public.messages');assert.equal(count.rows[0].n,1);
  const denied=await ingest('outside','Mensagem externa',false,'5511888888888@s.whatsapp.net');assert.equal(denied.queued,false);
  const deniedConvo=await db.query<{status:string}>('select status from public.conversations where id=$1',[denied.conversationId]);assert.equal(deniedConvo.rows[0].status,'human');
  const claimed=await db.query<any>('select * from public.whatsapp_claim()');const job=claimed.rows[0];assert.equal(job.id,first.jobId);
  assert.equal((await db.query('select * from public.whatsapp_claim()')).rows.length,0);
  await db.query('select public.whatsapp_save_reply($1,$2,$3)',[job.id,job.lease_token,'Resposta preparada']);
  await db.query("update public.conversations set status='human' where id=$1",[first.conversationId]);
  assert.equal((await db.query<{ok:boolean}>('select public.whatsapp_prepare_send($1,$2) ok',[job.id,job.lease_token])).rows[0].ok,false);
  assert.equal((await db.query<{status:string}>('select status from public.whatsapp_jobs where id=$1',[job.id])).rows[0].status,'skipped');
  const request='44444444-4444-4444-8444-444444444444';
  const enqueue=()=>db.query<{id:string}>('select public.whatsapp_enqueue_human($1,$2,$3,$4) id',[owner,first.conversationId,request,'Resposta humana']);
  const human=(await enqueue()).rows[0].id;assert.equal((await enqueue()).rows[0].id,human);
  const hj=(await db.query<any>('select * from public.whatsapp_claim()')).rows[0];assert.equal(hj.id,human);
  assert.equal((await db.query<{ok:boolean}>('select public.whatsapp_prepare_send($1,$2) ok',[hj.id,hj.lease_token])).rows[0].ok,true);
  await db.query("update public.whatsapp_jobs set lease_until=now()-interval '1 minute' where id=$1",[hj.id]);
  assert.equal((await db.query('select * from public.whatsapp_claim()')).rows.length,0);
  assert.equal((await db.query<{status:string}>('select status from public.whatsapp_jobs where id=$1',[hj.id])).rows[0].status,'uncertain');
  const echo=await ingest('provider-id','Resposta humana',true);assert.equal(echo.echo,true);
  assert.equal((await ingest('provider-id','Resposta humana',true)).duplicate,true);
  assert.equal((await db.query<{status:string}>('select status from public.whatsapp_jobs where id=$1',[hj.id])).rows[0].status,'sent');
  await db.exec(`reset role;set role authenticated;set request.jwt.claims='{"role":"authenticated","sub":"${other}"}';`);
  assert.equal((await db.query('select * from public.whatsapp_jobs')).rows.length,0);
  await assert.rejects(db.query('select * from public.whatsapp_claim()'));
  await assert.rejects(db.query("insert into public.whatsapp_channels(instance,user_id,agent_id) values('bad',$1,$2)",[other,agent]));
 }finally{await db.close();}
});

test('WhatsApp send failures distinguish a rejected request from uncertain delivery and never resend automatically',async()=>{
 const {sendWhatsAppText,DeliveryError}=await import('../server/whatsapp-provider.js');
 const originalFetch=globalThis.fetch;
 const names=['WHATSAPP_EVO_URL','WHATSAPP_EVO_INSTANCE','WHATSAPP_EVO_TOKEN'] as const;
 const old=Object.fromEntries(names.map(k=>[k,process.env[k]]));
 Object.assign(process.env,{WHATSAPP_EVO_URL:'https://evo.example.com',WHATSAPP_EVO_INSTANCE:'v4',WHATSAPP_EVO_TOKEN:'private-provider-test'});
 try{
  for(const [status,disposition] of [[429,'retry'],[401,'failed'],[500,'uncertain']] as const){
   let calls=0;globalThis.fetch=async (_url,options)=>{calls++;assert.equal(options?.method,'POST');assert.equal(options?.redirect,'error');return new Response('{}',{status});};
   await assert.rejects(sendWhatsAppText(jid,'Olá'),e=>e instanceof DeliveryError&&e.disposition===disposition);assert.equal(calls,1);
  }
  globalThis.fetch=async()=>{throw new Error('network failed with private-provider-test');};
  await assert.rejects(sendWhatsAppText(jid,'Olá'),e=>e instanceof DeliveryError&&e.disposition==='uncertain'&&!e.message.includes('private-provider-test'));
  globalThis.fetch=async()=>new Response(JSON.stringify({key:{id:'external-id'}}));
  assert.equal(await sendWhatsAppText(jid,'Olá'),'external-id');
 }finally{globalThis.fetch=originalFetch;for(const k of names){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}}
});

test('WhatsApp webhook and scheduled worker reject public callers before database or provider access',async()=>{
 const webhook=(await import('../api/whatsapp-webhook.js')).default;
 const worker=(await import('../api/whatsapp-worker.js')).default;
 const human=(await import('../api/whatsapp-send.js')).default;
 for(const handler of [webhook,worker,human]){
  let status=0;let body:unknown;
  const res={setHeader(){},status(s:number){status=s;return this;},json(v:unknown){body=v;return this;}};
  await handler({method:'POST',headers:{},body:{}} as any,res as any);
  assert.equal(status,401);assert.ok(body);
 }
});
