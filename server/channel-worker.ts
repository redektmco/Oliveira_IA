import {adminDb,unseal} from './access.js';
import {mergeSettings} from '../src/lib/settings-types.js';
import {createRepository,serverConfig} from './supabase.js';
import {createClaude} from './anthropic.js';
import {buildMessages,buildSystemPrompt} from './chat.js';
import {HttpError,resolveModel} from './validation.js';
import {instagramSend,providerFetch} from './providers.js';
const handoff=/(?:falar|conversar|atendimento).{0,30}(?:humano|pessoa|atendente|vendedor)|(?:quero|preciso).{0,20}(?:humano|atendente)/i;
export async function replyToChannel(owner:string,conversationId:string){
 const db=adminDb(),config=serverConfig(),repository=createRepository(config),cv=await repository.conversation(owner,conversationId);if(!cv||cv.status!=='ai'||!cv.agent_id)return null;
 const agent=await repository.agent(owner,cv.agent_id);if(!agent?.active)return null;
 const saved=await db.from('workspace_settings').select('config').eq('user_id',owner).maybeSingle(),s=mergeSettings(saved.data?.config);
 const history=await repository.messages(owner,conversationId),last=history[history.length-1];if(last?.role!=='user')return null;
 if(handoff.test(last.content)){await db.from('conversations').update({status:'human'}).eq('id',conversationId).eq('user_id',owner);return null;}
 if(cv.channel==='instagram'&&!s.instagram.directMessages)return null;
 const model=resolveModel(agent.model,config.configuredModel),usageId=await repository.reserveUsage(owner,model,{kind:'sdr'});let completed=false;
 try{
 const language=s.general.language==='en'?'Respond in English.':s.general.language==='es'?'Responde en español.':'Responda em português do Brasil.';
 const answer=await createClaude(config.anthropicKey).answer({model,system:`${buildSystemPrompt(agent,await repository.knowledge(owner))}\n\nIdioma configurado pelo responsável: ${language}`,messages:buildMessages(history.slice(0,-1).map(m=>({role:m.role==='user'?'user' as const:'assistant' as const,content:m.content})),last.content)});
 if(!answer.text.trim())throw new HttpError(502,'A IA retornou uma resposta vazia.');await repository.completeUsage(owner,usageId,answer.usage);completed=true;
 const r=await db.rpc('workspace_save_reply',{p_owner:owner,p_conversation:conversationId,p_content:answer.text});if(r.error)throw new HttpError(503,'Não foi possível guardar a resposta.');if(!r.data)return null;return {id:r.data as string,text:answer.text,externalId:cv.external_id};
 }catch(e){if(!completed)await repository.failUsage(owner,usageId).catch(()=>{});throw e;}
}
export async function runChannelJobs(){
 const db=adminDb();
 for(const kind of ['instagram.reply','instagram.comment']){
  const claimed=await db.rpc('workspace_claim_jobs',{p_kind:kind,p_limit:1});if(claimed.error)continue;
  for(const job of claimed.data||[]){let started=false;
   try{
    const account=await db.from('integration_accounts').select('*').eq('user_id',job.user_id).eq('provider','instagram').maybeSingle();if(!account.data)throw new HttpError(409,'Conta desconectada.');
    const settings=await db.from('workspace_settings').select('config').eq('user_id',job.user_id).maybeSingle(),s=mergeSettings(settings.data?.config);if(kind==='instagram.comment'&&!s.instagram.comments){await db.from('channel_jobs').update({status:'canceled'}).eq('id',job.id);continue;}
    if(kind==='instagram.reply'){
     const reply=await replyToChannel(job.user_id,job.conversation_id);if(!reply){await db.from('channel_jobs').update({status:'canceled'}).eq('id',job.id);continue;}
     const c=await db.from('conversations').select('status').eq('id',job.conversation_id).eq('user_id',job.user_id).single();if(c.data?.status!=='ai'){await db.from('messages').update({delivery_status:'canceled'}).eq('id',reply.id);await db.from('channel_jobs').update({status:'canceled'}).eq('id',job.id);continue;}
     const marked=await db.from('channel_jobs').update({status:'sending',payload:{...job.payload,message_id:reply.id}}).eq('id',job.id).eq('status','processing').eq('attempts',job.attempts).select('id');if(!marked.data?.length)continue;started=true;
     await db.from('messages').update({delivery_status:'sending'}).eq('id',reply.id);const result=await instagramSend(db,job.user_id,job.payload.sender,reply.text);
     await db.from('messages').update({delivery_status:'sent',provider_message_id:result.message_id}).eq('id',reply.id);
    }else{
     const secret=unseal<{access_token:string}>(account.data.secret);const marked=await db.from('channel_jobs').update({status:'sending'}).eq('id',job.id).eq('status','processing').eq('attempts',job.attempts).select('id');if(!marked.data?.length)continue;started=true;
     await providerFetch(`https://graph.facebook.com/${process.env.META_API_VERSION||'v23.0'}/${encodeURIComponent(job.payload.commentId)}/replies`,{method:'POST',headers:{Authorization:`Bearer ${secret.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({message:'Obrigado pelo interesse! Envie uma mensagem no nosso Direct para conversar com nossa equipe e assistente de IA.'})});
    }
    await db.from('channel_jobs').update({status:'completed',lease_until:null}).eq('id',job.id);
   }catch(e){const status=started?'uncertain':job.attempts>=4||e instanceof HttpError&&e.status<500?'failed':'pending';await db.from('channel_jobs').update({status,lease_until:null,available_at:new Date(Date.now()+60000*job.attempts).toISOString()}).eq('id',job.id);if(status==='failed'||status==='uncertain')await db.from('conversations').update({status:'human'}).eq('id',job.conversation_id).eq('user_id',job.user_id);}
  }
 }
}
