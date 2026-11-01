import type {VercelRequest,VercelResponse} from '@vercel/node';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {waitUntil} from '@vercel/functions';
import {adminDb,safeError} from '../server/access.js';
import {HttpError} from '../server/validation.js';
import {mergeSettings} from '../src/lib/settings-types.js';
import {runChannelJobs} from '../server/channel-worker.js';
import {emitEvent} from '../server/webhooks.js';
export const config={api:{bodyParser:false},maxDuration:60};
export function validSignature(secret:string,value:string,provided:string){const expected=createHmac('sha256',secret).update(value).digest('hex');return /^[a-f0-9]{64}$/i.test(provided)&&timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(provided,'hex'));}
async function rawBody(req:VercelRequest){if(typeof req.body==='string'){if(Buffer.byteLength(req.body)>262144)throw new HttpError(413,'Evento muito grande.');return req.body;}if(Buffer.isBuffer(req.body))return req.body.toString('utf8');let total=0;const chunks:Buffer[]=[];for await(const part of req){const b=Buffer.from(part);total+=b.length;if(total>262144)throw new HttpError(413,'Evento muito grande.');chunks.push(b);}return Buffer.concat(chunks).toString('utf8');}
export default async function handler(req:VercelRequest,res:VercelResponse){
 res.setHeader('Cache-Control','no-store');
 try{
 const provider=String(req.query?.provider||'');
 if(provider==='instagram'&&req.method==='GET'){
  if(req.query['hub.mode']==='subscribe'&&process.env.META_WEBHOOK_VERIFY_TOKEN&&req.query['hub.verify_token']===process.env.META_WEBHOOK_VERIFY_TOKEN)return res.status(200).send(String(req.query['hub.challenge']||''));throw new HttpError(403,'Verificação recusada.');
 }
 if(req.method!=='POST')throw new HttpError(405,'Use POST.');const raw=await rawBody(req);
 if(provider==='stripe'){
  if(!process.env.STRIPE_WEBHOOK_SECRET)throw new HttpError(503,'Webhook Stripe não configurado.');
  const parts=String(req.headers['stripe-signature']||'').split(','),timestamp=parts.find(p=>p.startsWith('t='))?.slice(2)||'',signatures=parts.filter(p=>p.startsWith('v1=')).map(p=>p.slice(3));
  if(!/^\d+$/.test(timestamp)||Math.abs(Date.now()/1000-Number(timestamp))>300||!signatures.some(s=>validSignature(process.env.STRIPE_WEBHOOK_SECRET!,`${timestamp}.${raw}`,s)))throw new HttpError(401,'Assinatura inválida.');
  const db=adminDb(),event=JSON.parse(raw),customer=typeof event.data?.object?.customer==='string'?event.data.object.customer:event.data?.object?.customer?.id;
  if(customer){const account=await db.from('integration_accounts').select('user_id').eq('provider','stripe').eq('account_id',customer).maybeSingle();if(account.data){const claim=await db.from('channel_events').insert({id:`stripe:${event.id}`,user_id:account.data.user_id,provider:'stripe'});if(!claim.error)await db.from('workspace_audit').insert({user_id:account.data.user_id,action:`Stripe: ${String(event.type).slice(0,100)}`});}}
  return res.status(200).json({received:true});
 }
 if(provider!=='instagram')throw new HttpError(404,'Provedor inválido.');
 const secret=process.env.META_APP_SECRET,signature=String(req.headers['x-hub-signature-256']||'');if(!secret||!signature.startsWith('sha256=')||!validSignature(secret,raw,signature.slice(7)))throw new HttpError(401,'Assinatura inválida.');
 const db=adminDb(),event=JSON.parse(raw);
 for(const entry of (event.entry||[]).slice(0,20)){
  const accounts=await db.from('integration_accounts').select('user_id,account_id,metadata,connected_at').eq('provider','instagram');const account=accounts.data?.find(a=>a.account_id===entry.id||a.metadata?.pageId===entry.id);if(!account)continue;
  const saved=await db.from('workspace_settings').select('config').eq('user_id',account.user_id).maybeSingle(),s=mergeSettings(saved.data?.config);
  for(const item of (entry.messaging||[]).slice(0,30)){
   const message=item.message,sender=String(item.sender?.id||'');if(!message||message.is_echo||!sender||sender===account.account_id||!message.mid)continue;
   if(item.timestamp&&Number(item.timestamp)<Date.parse(account.connected_at)-60000)continue;
   const story=Boolean(message.reply_to?.story||message.attachments?.some((a:any)=>a.type==='story_mention'));
   const content=typeof message.text==='string'?message.text.slice(0,16000):'[Mídia recebida no Instagram — atendimento humano]';
   const source=s.instagram.ads&&item.referral?.ad_id?`Instagram · Anúncio ${item.referral.ad_id}`:'Instagram';
   const r=await db.rpc('workspace_ingest_instagram',{p_owner:account.user_id,p_event:`instagram:${account.user_id}:${message.mid}`,p_sender:sender,p_content:content,p_name:`Instagram ${sender.slice(-6)}`,p_auto:s.instagram.directMessages&&(!story||s.instagram.stories)&&typeof message.text==='string',p_source:source});if(r.error)throw new HttpError(503,'Não foi possível guardar o evento.');if(!r.data?.duplicate)await emitEvent(db,account.user_id,'message.received',{conversation_id:r.data?.conversationId,channel:'instagram'});
  }
  for(const change of (entry.changes||[]).slice(0,30)){
   if(change.field!=='comments'||!s.instagram.comments)continue;const v=change.value;if(!v?.id||!v.from?.id||v.from.id===account.account_id)continue;
   const imported=await db.rpc('workspace_ingest_instagram',{p_owner:account.user_id,p_event:`instagram-comment:${account.user_id}:${v.id}`,p_sender:String(v.from.id),p_content:`Comentário no Instagram: ${String(v.text||'').slice(0,15000)}`,p_name:v.from.username||'Contato do Instagram',p_auto:false,p_source:'Instagram · Comentário'});if(imported.error)throw new HttpError(503,'Não foi possível guardar o comentário.');
   if(!imported.data?.duplicate&&imported.data?.conversationId)await db.from('channel_jobs').insert({user_id:account.user_id,conversation_id:imported.data.conversationId,kind:'instagram.comment',payload:{commentId:v.id}});
  }
 }
 waitUntil(runChannelJobs());return res.status(200).json({received:true});
 }catch(error){const e=safeError(error);return res.status(e.status).json({error:e.error});}
}
