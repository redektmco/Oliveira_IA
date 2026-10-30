import type {VercelRequest,VercelResponse} from '@vercel/node';
import {bridgeDb} from '../server/whatsapp-bridge.js';
import {evolutionConfig} from '../server/evolution.js';
import {evolutionRequest,sendWhatsAppText,ensureWhatsAppConnected} from '../server/whatsapp-provider.js';
import {secretMatches} from '../server/whatsapp-events.js';
import {createRepository,serverConfig} from '../server/supabase.js';
import {HttpError,parseBearerToken} from '../server/validation.js';
export const config={maxDuration:60};
const callback='https://ai.v4oliveira.com.br/api/whatsapp-webhook';
async function webhook(){const r=await evolutionRequest('/webhook/find/{instance}');if(r.status===404)return null;if(!r.ok)throw new HttpError(502,'Não foi possível consultar o webhook Evolution.');const d=await r.json();return d?.webhook||d;}
function summary(w:any){let origin:string|null=null,path:string|null=null;try{const u=new URL(w.url);origin=u.origin;path=w.url===callback?u.pathname:null;}catch{}return {enabled:Boolean(w?.enabled),origin,path,conflict:Boolean(w?.enabled&&w?.url&&w.url!==callback),matches:Boolean(w?.enabled&&w.url===callback&&secretMatches(w.headers?.['x-oliveira-webhook-secret'],process.env.WHATSAPP_WEBHOOK_SECRET))};}
export default async function handler(req:VercelRequest,res:VercelResponse){
 res.setHeader('Cache-Control','private, no-store');
 if(!['GET','POST'].includes(req.method||''))return res.status(405).json({error:'Método não permitido.'});
 try{
  const internal=secretMatches(req.headers.authorization,process.env.WHATSAPP_WORKER_SECRET?`Bearer ${process.env.WHATSAPP_WORKER_SECRET}`:undefined);
  if(!internal){const token=parseBearerToken(req.headers.authorization);const user=await createRepository(serverConfig()).authenticate(token);if(user.id!==process.env.WHATSAPP_OWNER_USER_ID)throw new HttpError(403,'O WhatsApp pertence a outra conta.');}
  const c=evolutionConfig(),db=bridgeDb();
  if(req.method==='GET'){
   const w=await webhook(),ch=await db.from('whatsapp_channels').select('enabled,webhook_verified,agent_id,activated_at').eq('instance',c.instance).maybeSingle();
   const jobs=await db.from('whatsapp_jobs').select('status,error_code,created_at').eq('instance',c.instance).order('created_at',{ascending:false}).limit(100);
   const instances=await evolutionRequest('/instance/fetchInstances');let selfSuffix=null; if(instances.ok){const all=await instances.json();const own=Array.isArray(all)?all.find(x=>x.name===c.instance||x.instance?.instanceName===c.instance):null;const ownJid=own?.ownerJid||own?.instance?.owner;if(typeof ownJid==='string')selfSuffix=ownJid.split('@')[0].split(':')[0].slice(-4);}
   return res.status(200).json({instance:c.instance,selfSuffix,webhook:summary(w),channel:ch.data,queue:(jobs.data||[]).reduce((a:Record<string,number>,j)=>{a[j.status]=(a[j.status]||0)+1;return a;},{}),lastEventAt:jobs.data?.[0]?.created_at||null});
  }
  let body=req.body;if(typeof body==='string')body=JSON.parse(body);
  if(body?.operation==='configure'){
   if(!internal)throw new HttpError(403,'A configuração inicial exige acesso de operação.');
   const w=await webhook();
   if(summary(w).conflict && body.confirmReplace!==true)throw new HttpError(409,'A instância já possui outro webhook ativo. A configuração existente foi preservada.');
   if(!process.env.WHATSAPP_WEBHOOK_SECRET)throw new HttpError(503,'Falta configurar a proteção do webhook.');
   if(w){const backup=await db.from('whatsapp_webhook_backup').upsert({instance:c.instance,configuration:w},{onConflict:'instance',ignoreDuplicates:true});if(backup.error)throw new HttpError(503,'Não foi possível preservar a configuração anterior.');}
   const ch=await db.from('whatsapp_channels').update({enabled:true,activated_at:new Date().toISOString()}).eq('instance',c.instance).eq('user_id',process.env.WHATSAPP_OWNER_USER_ID).select('instance').single();
   if(ch.error)throw new HttpError(503,'Vincule o agente e a conta antes de ativar.');
   try{
    const applied=await evolutionRequest('/webhook/set/{instance}','POST',{webhook:{enabled:true,url:callback,headers:{'x-oliveira-webhook-secret':process.env.WHATSAPP_WEBHOOK_SECRET},byEvents:false,base64:false,events:['MESSAGES_UPSERT']}});
    if(!applied.ok)throw new Error();
    const saved=await webhook();if(!summary(saved).matches||saved.webhookByEvents||saved.webhookBase64||!saved.events?.includes('MESSAGES_UPSERT'))throw new Error();
    const verified=await db.from('whatsapp_channels').update({webhook_verified:true}).eq('instance',c.instance);if(verified.error)throw new Error();
   }catch{await db.from('whatsapp_channels').update({enabled:false,webhook_verified:false}).eq('instance',c.instance);throw new HttpError(502,'Não foi possível confirmar a ativação do webhook. A automação foi pausada.');}
   return res.status(200).json({configured:true,instance:c.instance});
  }
  if(body?.operation==='test'&&internal){
   if(typeof body.number!=='string'||!/^\d{10,15}$/.test(body.number))throw new HttpError(400,'Número inválido.');
   await ensureWhatsAppConnected();const id=await sendWhatsAppText(`${body.number}@s.whatsapp.net`,'Olá! Sou a Felipa, inteligência artificial da V4. Esta é uma mensagem de teste da conexão com o painel. Responda com “teste Felipa” para verificar o atendimento automático.');
   return res.status(200).json({sent:true,providerMessageId:id});
  }
  throw new HttpError(400,'Operação inválida.');
 }catch(e){return res.status(e instanceof HttpError?e.status:502).json({error:e instanceof HttpError?e.message:'Não foi possível concluir a operação WhatsApp.'});}
}
