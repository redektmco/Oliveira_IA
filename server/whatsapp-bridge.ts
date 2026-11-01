import {adminDb} from './access.js';
import {mergeSettings} from '../src/lib/settings-types.js';
import {nextOpenAt,withinSchedule} from './schedules.js';
import {createClient} from '@supabase/supabase-js';
import {serverConfig,createRepository} from './supabase.js';
import {createClaude} from './anthropic.js';
import {buildMessages,buildSystemPrompt} from './chat.js';
import {parseTriageAnswer,triagePrompt} from './triage.js';
import {dailyLimit,resolveModel,HttpError} from './validation.js';
import {DeliveryError,ensureWhatsAppConnected,sendWhatsAppText} from './whatsapp-provider.js';
import type {IncomingWhatsApp} from './whatsapp-events.js';
import {applySalesAutomation,schedulingContext,syncDealAfterTurn} from './sales-automation.js';
export type WhatsAppJob={id:string;user_id:string;instance:string;remote_jid:string;conversation_id:string;incoming_id:string;outgoing_id:string|null;kind:'inbound'|'human';body:string;reply:string|null;lease_token:string;attempts:number};
export function bridgeDb(){return adminDb();}
export async function bridgeRpc<T=unknown>(name:string,args:Record<string,unknown>={}){const r=await bridgeDb().rpc(name,args);if(r.error)throw new HttpError(503,'Não foi possível processar a fila WhatsApp.');return r.data as T;}
export async function ingestWhatsApp(e:IncomingWhatsApp){return bridgeRpc<{queued?:boolean;duplicate?:boolean;conversationId?:string}>('whatsapp_ingest',{p_instance:e.instance,p_jid:e.jid,p_event_id:e.eventId,p_text:e.text,p_name:e.name,p_from_me:e.fromMe,p_needs_human:e.needsHuman,p_event_time:e.eventTime});}
export async function processWhatsAppJob(job:WhatsAppJob){
 const c=serverConfig(),repository=createRepository(c),db=bridgeDb();
 let deliveryStarted=false;
 const finish=(result:string,error:string|null=null,id:string|null=null)=>bridgeRpc('whatsapp_finish',{p_id:job.id,p_lease:job.lease_token,p_result:result,p_provider_id:id,p_error:error});
 try{
  const storedSettings=await db.from('workspace_settings').select('config').eq('user_id',job.user_id).maybeSingle();
  if(storedSettings.error)throw new HttpError(503,'Configurações indisponíveis.');
  const preferences=mergeSettings(storedSettings.data?.config);
  if(job.kind==='inbound'){
   if(!preferences.whatsapp.autoReply){await finish('skipped','auto_reply_paused');return;}
   if(preferences.whatsapp.humanHandoff&&/(?:falar|conversar|atendimento).{0,30}(?:humano|pessoa|atendente|vendedor)|(?:quero|preciso).{0,20}(?:humano|atendente)/i.test(job.body)){await db.from('conversations').update({status:'human'}).eq('id',job.conversation_id).eq('user_id',job.user_id);await finish('skipped','requested_human');return;}
   if(!withinSchedule(preferences.whatsapp.schedule,preferences.general.timezone)){await bridgeRpc('whatsapp_defer',{p_id:job.id,p_lease:job.lease_token,p_until:nextOpenAt(preferences.whatsapp.schedule,preferences.general.timezone).toISOString()});return;}
  }
  if(!job.reply){
   const channel=await db.from('whatsapp_channels').select('ai_allowlist,enabled').eq('instance',job.instance).eq('user_id',job.user_id).single();
   if(channel.error)throw new HttpError(503,'Vínculo indisponível.');
   if(!channel.data.enabled||!channel.data.ai_allowlist?.includes(job.remote_jid.split('@')[0])){await finish('skipped','sender_not_allowed');return;}
   const conversation=await repository.conversation(job.user_id,job.conversation_id);
   if(!conversation||conversation.channel!=='whatsapp'||conversation.status!=='ai'||!conversation.agent_id){await finish('skipped','human_handoff');return;}
   const agent=await repository.agent(job.user_id,conversation.agent_id);
   if(!agent?.active){await finish('skipped','agent_paused');return;}
   const current=await db.from('messages').select('created_at').eq('user_id',job.user_id).eq('id',job.incoming_id).single();
   if(current.error)throw new HttpError(503,'Fila indisponível.');
   const history=await db.from('messages').select('role,content,created_at,delivery_status').eq('user_id',job.user_id).eq('conversation_id',job.conversation_id).neq('id',job.incoming_id).order('created_at',{ascending:false}).limit(40);
   if(history.error)throw new HttpError(503,'Histórico indisponível.');
   const contact=conversation.contact_id ? await repository.contact(job.user_id,conversation.contact_id) : null;
   if(!contact)throw new HttpError(404,'Contato da conversa não encontrado.');
   const contactHistory=await repository.contactMessages(job.user_id,contact.id);
   const model=resolveModel(agent.model,c.configuredModel);
   const usageId=await repository.reserveUsage(job.user_id,model,dailyLimit(c.dailyRequestLimit));
   let completed=false;
   try{
    const knowledge=await repository.knowledge(job.user_id);
    const scheduling=await schedulingContext(db,job.user_id,contact,preferences.scheduling,preferences.general.timezone).catch(()=>null);
    const answer=await createClaude(c.anthropicKey).answer({model,structured:true,system:buildSystemPrompt(agent,knowledge,preferences.general.language,Boolean(scheduling))+(scheduling?'\n\n'+scheduling.prompt:'')+'\n\n'+triagePrompt(contact,contactHistory),messages:buildMessages(history.data.reverse().filter(m=>(m.role!=='user'||m.created_at<=current.data.created_at)&&!['canceled','failed','uncertain'].includes(m.delivery_status)).map(m=>({role:m.role==='user'?'user' as const:'assistant' as const,content:m.content})),job.body)});
    if(!answer.text.trim())throw new HttpError(502,'Resposta vazia.');
    await repository.completeUsage(job.user_id,usageId,answer.usage);completed=true;
    const parsed=parseTriageAnswer(answer.text,agent.qualification_threshold);
    const automation=await applySalesAutomation(db,{owner:job.user_id,contact,triage:parsed.triage,meeting:parsed.meeting,reply:parsed.reply,scheduling,settings:preferences.scheduling});
    const saved=await bridgeRpc<boolean>('whatsapp_save_triaged_reply',{p_id:job.id,p_lease:job.lease_token,p_contact_id:contact.id,p_expected_revision:contact.crm_revision ?? 0,p_reply:automation.reply,p_triage:parsed.triage});
    if(!saved)return;
    await syncDealAfterTurn(db,job.user_id,contact,parsed.triage,automation.booked,preferences.scheduling);
    job.reply=automation.reply;
   }catch(e){if(!completed)await repository.failUsage(job.user_id,usageId).catch(()=>{});throw e;}
  }
  if(job.kind==='inbound'&&preferences.whatsapp.typingMax>0){const delay=preferences.whatsapp.typingMin+Math.random()*(preferences.whatsapp.typingMax-preferences.whatsapp.typingMin);await new Promise(resolve=>setTimeout(resolve,delay*1000));}
  // Check connectivity before entering the non-repeatable external send phase.
  await ensureWhatsAppConnected();
  const send=await bridgeRpc<boolean>('whatsapp_prepare_send',{p_id:job.id,p_lease:job.lease_token});
  if(!send)return;
  deliveryStarted=true;
  const id=await sendWhatsAppText(job.remote_jid,job.reply!);
  await finish('sent',null,id);
 }catch(e){
  if(e instanceof DeliveryError){await finish(e.disposition,e.code);return;}
  if(e instanceof HttpError&&e.status===429){
   await finish('skipped','daily_limit');
   await db.from('conversations').update({status:'human'}).eq('user_id',job.user_id).eq('id',job.conversation_id).eq('status','ai');return;
  }
  // The provider might have accepted the send before the database failed. A job
  // already in 'sending' is recovered as uncertain by the database, never resent.
  await finish(deliveryStarted?'uncertain':'retry',deliveryStarted?'delivery_unknown':'processing_failed');
 }
}
export async function runWhatsAppWorker(){
 const jobs=await bridgeRpc<WhatsAppJob[]>('whatsapp_claim');if(!jobs?.[0])return;
 await processWhatsAppJob(jobs[0]);
 const pending=await bridgeDb().from('whatsapp_jobs').select('id').in('status',['queued','ready','retry']).lte('available_at',new Date().toISOString()).limit(1);
 if(pending.data?.length&&process.env.WHATSAPP_WORKER_SECRET){
  await fetch('https://ai.v4oliveira.com.br/api/whatsapp-worker',{method:'POST',headers:{Authorization:`Bearer ${process.env.WHATSAPP_WORKER_SECRET}`},redirect:'error',signal:AbortSignal.timeout(5000)}).catch(()=>{});
 }
}
export function backgroundWorker(){return runWhatsAppWorker().catch(()=>{console.error('WhatsApp: processamento será retomado pela fila.');});}
