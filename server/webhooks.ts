import {lookup} from 'node:dns/promises';
import https from 'node:https';
import {isIP} from 'node:net';
import {createHmac} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {HttpError} from './validation.js';
import {adminDb,unseal} from './access.js';
export function publicIp(ip:string):boolean {
 if(isIP(ip)===4){const [a,b,c]=ip.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===2)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113);}
 if(isIP(ip)===6)return /^[23][0-9a-f]{0,3}:/i.test(ip)&&!/^2001:(db8|0|10|20):/i.test(ip)&&!/^2002:/i.test(ip);
 return false;
}
export function webhookUrl(raw:unknown){let u:URL;try{u=new URL(String(raw));}catch{throw new HttpError(400,'Informe uma URL HTTPS válida.');}if(u.protocol!=='https:'||u.username||u.password||u.hash||u.port&&u.port!=='443'||isIP(u.hostname)||!u.hostname.includes('.')||/\.(localhost|local|internal|test|invalid)$/i.test(u.hostname))throw new HttpError(400,'Use um endpoint HTTPS público, sem credenciais, fragmentos ou porta personalizada.');return u;}
export async function resolveWebhook(raw:string){const u=webhookUrl(raw);const addresses=await lookup(u.hostname,{all:true});if(!addresses.length||addresses.some(a=>!publicIp(a.address)))throw new HttpError(400,'O endpoint deve resolver somente para endereços públicos.');return {url:u,address:addresses[0]};}
export function webhookSignature(secret:string,timestamp:string,payload:string){return createHmac('sha256',secret).update(`${timestamp}.${payload}`).digest('hex');}
export async function emitEvent(db:SupabaseClient,userId:string,event:string,payload:unknown){
 const hooks=await db.from('workspace_webhooks').select('id,events').eq('user_id',userId).eq('enabled',true);
 if(hooks.error)return;const rows=(hooks.data||[]).filter(h=>h.events.includes(event)).map(h=>({user_id:userId,endpoint_id:h.id,event,payload:{event,data:payload,occurred_at:new Date().toISOString()}}));if(rows.length)await db.from('webhook_deliveries').insert(rows);
}
export async function sendWebhook(raw:string,secret:string,id:string,payload:unknown){
 const {url,address}=await resolveWebhook(raw),body=JSON.stringify({...payload as object,id}),timestamp=String(Math.floor(Date.now()/1000));
 const started=Date.now();
 const code=await new Promise<number>((resolve,reject)=>{
 const request=https.request(url,{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body),'X-Oliveira-Id':id,'X-Oliveira-Timestamp':timestamp,'X-Oliveira-Signature':`sha256=${webhookSignature(secret,timestamp,body)}`},lookup:(_hostname,options,callback)=>{if(options.all)callback(null,[address]);else callback(null,address.address,address.family);}},response=>{response.resume();resolve(response.statusCode||0);});
 request.setTimeout(8000,()=>request.destroy(new Error('timeout')));request.on('error',reject);request.end(body);
 });return {code,duration:Date.now()-started};
}
export async function deliverWebhooks(){
 const db=adminDb(),claim=await db.rpc('workspace_claim_deliveries');if(claim.error)return;
 for(const delivery of claim.data||[]){
  const h=await db.from('workspace_webhooks').select('*').eq('id',delivery.endpoint_id).eq('user_id',delivery.user_id).maybeSingle();let code=0,duration=0;
  if(!h.data?.enabled){await db.from('webhook_deliveries').update({status:'canceled'}).eq('id',delivery.id);continue;}
  try{({code,duration}=await sendWebhook(h.data.url,unseal<{value:string}>(h.data.secret).value,delivery.id,delivery.payload));}catch{}
  const ok=code>=200&&code<300;
  await db.from('webhook_deliveries').update({status:ok?'delivered':delivery.attempts>=4?'failed':'pending',response_code:code||null,duration_ms:duration,lease_until:null,available_at:new Date(Date.now()+Math.min(3600,30*2**delivery.attempts)*1000).toISOString()}).eq('id',delivery.id);
  await db.from('workspace_webhooks').update({failure_count:ok?0:(h.data.failure_count||0)+1}).eq('id',h.data.id);
 }
}
