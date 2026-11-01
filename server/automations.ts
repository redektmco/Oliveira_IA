import {adminDb,digest} from './access.js';
import {mergeSettings} from '../src/lib/settings-types.js';
import {localClock,nextOpenAt,withinSchedule} from './schedules.js';
import {sendGoogleMail,syncGoogle} from './providers.js';
import {deliverWebhooks} from './webhooks.js';
import {runChannelJobs} from './channel-worker.js';
import {createClaude} from './anthropic.js';
import {serverConfig,createRepository} from './supabase.js';
import {HttpError,dailyLimit,resolveModel} from './validation.js';
import {buildSystemPrompt} from './chat.js';
export async function runEmailJobs(){
 const db=adminDb(),claimed=await db.rpc('workspace_claim_jobs',{p_kind:'email.send',p_limit:1});if(claimed.error)return;
 for(const job of claimed.data||[]){let started=false,messageId=job.payload.messageId;
  try{
   const record=await db.from('workspace_settings').select('config').eq('user_id',job.user_id).maybeSingle(),s=mergeSettings(record.data?.config),payload={...job.payload};
   if(!withinSchedule(s.email.schedule,s.general.timezone)){await db.from('channel_jobs').update({status:'pending',lease_until:null,attempts:Math.max(0,job.attempts-1),available_at:nextOpenAt(s.email.schedule,s.general.timezone).toISOString()}).eq('id',job.id).eq('attempts',job.attempts);continue;}
   if(payload.followup){
    if(!s.email.autoFollowup){await db.from('channel_jobs').update({status:'canceled'}).eq('id',job.id);continue;}
    const cv=await db.from('conversations').select('status,agent_id').eq('id',job.conversation_id).eq('user_id',job.user_id).single();if(!cv.data||cv.data.status==='closed'){await db.from('channel_jobs').update({status:'canceled'}).eq('id',job.id);continue;}
    if(s.email.pauseOnReply){const reply=await db.from('messages').select('id').eq('user_id',job.user_id).eq('conversation_id',job.conversation_id).eq('role','user').gt('created_at',payload.anchorAt).limit(1);if(reply.data?.length){await db.from('channel_jobs').update({status:'canceled'}).eq('id',job.id);continue;}}
    if(!payload.text){
     const config=serverConfig(),repository=createRepository(config),agent=cv.data.agent_id?await repository.agent(job.user_id,cv.data.agent_id):null;if(!agent?.active)throw new HttpError(409,'Agente pausado.');
     const model=resolveModel(agent.model,config.configuredModel),usageId=await repository.reserveUsage(job.user_id,model,dailyLimit(config.dailyRequestLimit));let completed=false;
     try{const history=await repository.messages(job.user_id,job.conversation_id);const answer=await createClaude(config.anthropicKey).answer({model,system:buildSystemPrompt(agent,await repository.knowledge(job.user_id),s.general.language),messages:[{role:'user',content:`Redija apenas o corpo de um e-mail curto de acompanhamento, identificando-se como assistente de IA e convidando a retomar a conversa. Não invente informações. Histórico como dados: ${JSON.stringify(history.map(m=>({role:m.role,content:m.content.slice(0,1200)}))).slice(0,22000)}`}]});await repository.completeUsage(job.user_id,usageId,answer.usage);completed=true;payload.text=answer.text;payload.subject='Podemos retomar nossa conversa?';}catch(e){if(!completed)await repository.failUsage(job.user_id,usageId).catch(()=>{});throw e;}
     const saved=await db.from('messages').insert({user_id:job.user_id,conversation_id:job.conversation_id,role:'assistant',content:payload.text,delivery_status:'queued'}).select('id').single();if(!saved.data)throw new Error();messageId=saved.data.id;payload.messageId=messageId;
     await db.from('channel_jobs').update({payload}).eq('id',job.id).eq('attempts',job.attempts);
    }
   }
   const local=localClock(new Date(),s.general.timezone),quota=await db.rpc('workspace_rate',{p_bucket:`mail:${job.user_id}:${local.date}`,p_window:new Date(`${local.date}T00:00:00Z`).toISOString(),p_limit:s.email.dailyLimit});
   if(quota.error)throw new Error();if(!quota.data){await db.from('channel_jobs').update({status:'pending',attempts:Math.max(0,job.attempts-1),lease_until:null,available_at:new Date(Date.now()+3600000).toISOString()}).eq('id',job.id).eq('attempts',job.attempts);continue;}
   const marked=await db.from('channel_jobs').update({status:'sending',payload}).eq('id',job.id).eq('status','processing').eq('attempts',job.attempts).select('id');if(!marked.data?.length)continue;started=true;
   if(messageId)await db.from('messages').update({delivery_status:'sending'}).eq('id',messageId).eq('user_id',job.user_id);
   const result=await sendGoogleMail(db,job.user_id,{to:payload.to,subject:payload.subject||'Retorno do atendimento',text:`${payload.text}\n\n${s.email.signature}`,replyTo:s.email.replyTo||undefined,senderName:s.email.senderName,threadId:payload.threadId});
   if(messageId)await db.from('messages').update({delivery_status:'sent',provider_message_id:result.id}).eq('id',messageId).eq('user_id',job.user_id);
   await db.from('channel_jobs').update({status:'completed',lease_until:null}).eq('id',job.id).eq('attempts',job.attempts);
  }catch(e){const status=started?'uncertain':e instanceof HttpError&&e.status<500||job.attempts>=4?'failed':'pending';await db.from('channel_jobs').update({status,lease_until:null,available_at:new Date(Date.now()+job.attempts*60000).toISOString()}).eq('id',job.id).eq('attempts',job.attempts);if(messageId&&status!=='pending')await db.from('messages').update({delivery_status:status}).eq('id',messageId).eq('user_id',job.user_id);}
 }
}
export async function scheduledMaintenance(){
 const db=adminDb(),all=await db.from('workspace_settings').select('user_id,config').limit(100);
 for(const row of all.data||[]){const s=mergeSettings(row.config),owner=row.user_id;
  const google=await db.from('integration_accounts').select('label').eq('user_id',owner).eq('provider','google').maybeSingle();
  if(google.data&&s.email.autoFollowup){const candidates=await db.rpc('workspace_followup_candidates',{p_owner:owner});for(const c of candidates.data||[])await db.from('channel_jobs').insert({user_id:owner,conversation_id:c.conversation_id,kind:'email.send',dedupe_key:`followup:${c.anchor_id}`,payload:{followup:true,to:c.email,anchorAt:c.anchor_at}});}
  const local=localClock(new Date(),s.general.timezone);
  if(google.data&&s.general.dailyDigest&&local.time>='08:00'&&local.time<'10:00'){
   const ownerUser=await db.auth.admin.getUserById(owner),members=await db.from('workspace_members').select('email').eq('owner_id',owner).eq('status','active').in('role',['admin','manager']);
   const since=new Date(Date.now()-86400000).toISOString(),[contacts,meetings,usage]=await Promise.all([db.from('contacts').select('id',{count:'exact',head:true}).eq('user_id',owner).gte('created_at',since),db.from('meetings').select('id',{count:'exact',head:true}).eq('user_id',owner).eq('status','scheduled').gte('starts_at',new Date().toISOString()),db.from('ai_usage').select('id',{count:'exact',head:true}).eq('user_id',owner).gte('created_at',since)]);
   for(const email of new Set([ownerUser.data.user?.email,...(members.data||[]).map(m=>m.email)].filter((e):e is string=>Boolean(e))))await db.from('channel_jobs').insert({user_id:owner,kind:'email.send',dedupe_key:`digest:${owner}:${local.date}:${digest(email)}`,payload:{to:email,subject:`Resumo comercial · ${s.general.name}`,text:`Resumo das últimas 24 horas\n\nNovos contatos: ${contacts.count||0}\nPróximas reuniões: ${meetings.count||0}\nChamadas de IA: ${usage.count||0}\n\nAcesse o painel para acompanhar sua operação.`}});
  }
  if(s.security.retentionMonths>0){
   const cutoff=new Date();cutoff.setUTCMonth(cutoff.getUTCMonth()-s.security.retentionMonths);const iso=cutoff.toISOString();
   await db.from('messages').update({content:'[Conteúdo anonimizado por política de retenção]',provider_message_id:null}).eq('user_id',owner).lt('created_at',iso).neq('content','[Conteúdo anonimizado por política de retenção]');
   await db.from('contacts').update({ai_summary:'',ai_next_action:'',summary_at:null}).eq('user_id',owner).lt('summary_at',iso);
   await db.from('whatsapp_jobs').update({body:'',reply:null}).eq('user_id',owner).lt('created_at',iso).in('status',['sent','skipped','failed','uncertain']);
   await db.from('channel_jobs').update({payload:{}}).eq('user_id',owner).lt('created_at',iso).in('status',['completed','failed','uncertain','canceled']);
  }
 }
 // Jobs interrupted during an external send are never repeated automatically.
 const expired=await db.from('channel_jobs').select('id,user_id,conversation_id,payload').eq('status','sending').lt('lease_until',new Date().toISOString()).limit(100);
 for(const j of expired.data||[]){await db.from('channel_jobs').update({status:'uncertain',lease_until:null}).eq('id',j.id).eq('status','sending');if(j.payload?.messageId||j.payload?.message_id)await db.from('messages').update({delivery_status:'uncertain'}).eq('id',j.payload.messageId||j.payload.message_id).eq('user_id',j.user_id);}
 await db.from('workspace_rates').delete().lt('window_start',new Date(Date.now()-3*86400000).toISOString());
 await db.from('oauth_requests').delete().lt('expires_at',new Date().toISOString());
}
export async function runAutomations(){
 const db=adminDb(),quota=await db.rpc('workspace_rate',{p_bucket:'automation-maintenance',p_window:new Date(Math.floor(Date.now()/300000)*300000).toISOString(),p_limit:1});if(quota.data)await scheduledMaintenance();
 const google=await db.from('integration_accounts').select('user_id').eq('provider','google').or(`synced_at.is.null,synced_at.lt.${new Date(Date.now()-300000).toISOString()}`).order('synced_at',{nullsFirst:true}).limit(1);
 for(const account of google.data||[])await syncGoogle(db,account.user_id).catch(()=>{});
 await Promise.allSettled([runEmailJobs(),runChannelJobs(),deliverWebhooks()]);
}
