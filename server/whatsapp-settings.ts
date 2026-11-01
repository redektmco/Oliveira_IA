import {evolutionRequest} from './whatsapp-provider.js';
import {evolutionConfig,readEvolutionStatus} from './evolution.js';
import {HttpError} from './validation.js';
import {appOrigin,audit,requireRole,type Access} from './access.js';
import {secretMatches} from './whatsapp-events.js';
async function owned(a:Access){requireRole(a,['admin','manager']);const c=evolutionConfig();const r=await a.db.from('whatsapp_channels').select('enabled,webhook_verified,agent_id').eq('instance',c.instance).eq('user_id',a.ownerId).maybeSingle();if(r.error||!r.data)throw new HttpError(403,'A instância WhatsApp não está vinculada a este workspace.');return {c,channel:r.data};}
export async function whatsappDiagnosis(a:Access){
 const {c,channel}=await owned(a);const status=await readEvolutionStatus(c);
 const [queue,last,w]=await Promise.all([a.db.from('whatsapp_jobs').select('status,error_code,created_at').eq('user_id',a.ownerId).order('created_at',{ascending:false}).limit(100),a.db.from('whatsapp_jobs').select('created_at,status,error_code').eq('user_id',a.ownerId).order('created_at',{ascending:false}).limit(1).maybeSingle(),evolutionRequest('/webhook/find/{instance}')]);
 let webhookMatches=false,webhookEnabled=false,conflict=false;
 if(w.ok){const raw=await w.json();const d=raw?.webhook||raw;webhookEnabled=Boolean(d?.enabled);webhookMatches=d?.url===`${appOrigin()}/api/whatsapp-webhook`&&secretMatches(d?.headers?.['x-oliveira-webhook-secret'],process.env.WHATSAPP_WEBHOOK_SECRET);conflict=webhookEnabled&&d?.url!==`${appOrigin()}/api/whatsapp-webhook`;}
 const agent=await a.db.from('agents').select('name,active').eq('id',channel.agent_id).eq('user_id',a.ownerId).maybeSingle();
 return {...status,messagingEnabled:Boolean(channel.enabled&&status.connected&&channel.webhook_verified&&webhookMatches&&agent.data?.active),webhook:{enabled:webhookEnabled,matches:webhookMatches,conflict},agent:agent.data,lastEvent:last.data,queue:(queue.data||[]).reduce((acc:Record<string,number>,j)=>{acc[j.status]=(acc[j.status]||0)+1;return acc;},{}),checkedAt:new Date().toISOString()};
}
export async function whatsappConnect(a:Access,phone?:unknown){
 requireRole(a);const {c}=await owned(a);const status=await readEvolutionStatus(c);if(status.connected)return {connected:true,instance:c.instance};
 let path='/instance/connect/{instance}';if(phone!==undefined){if(typeof phone!=='string'||!/^\d{10,15}$/.test(phone))throw new HttpError(400,'Informe o número com DDI, somente dígitos.');path+=`?number=${encodeURIComponent(phone)}`;}
 const response=await evolutionRequest(path);if(!response.ok)throw new HttpError(502,'A Evolution não conseguiu gerar o código de conexão.');const d=await response.json();
 const base64=typeof d.base64==='string'?d.base64:typeof d.qrcode?.base64==='string'?d.qrcode.base64:null,pairingCode=typeof d.pairingCode==='string'?d.pairingCode:null;
 if(base64&&!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(base64))throw new HttpError(502,'O provedor retornou um QR code inválido.');
 if(!base64&&!pairingCode)throw new HttpError(502,'A Evolution não retornou um código. Aguarde e tente novamente.');
 await audit(a,phone?'Gerou pareamento WhatsApp por telefone':'Gerou QR code WhatsApp');return {qr:base64,pairingCode,expiresAt:new Date(Date.now()+45000).toISOString()};
}
export async function whatsappRepair(a:Access){
 requireRole(a);const {c}=await owned(a),callback=`${appOrigin()}/api/whatsapp-webhook`;
 if(!process.env.WHATSAPP_WEBHOOK_SECRET)throw new HttpError(503,'Configure a proteção do webhook no servidor.');
 const current=await evolutionRequest('/webhook/find/{instance}');let w:any=null;if(current.ok){const data=await current.json();w=data.webhook||data;}
 if(!current.ok&&current.status!==404)throw new HttpError(502,'Não foi possível consultar o webhook atual.');
 if(w?.enabled&&w.url&&w.url!==callback)throw new HttpError(409,'Outro sistema está conectado a esta instância. O webhook foi preservado; revise a configuração com o administrador.');
 if(w){const backup=await a.db.from('whatsapp_webhook_backup').upsert({instance:c.instance,configuration:w},{onConflict:'instance',ignoreDuplicates:true});if(backup.error)throw new HttpError(503,'Não foi possível preservar a configuração atual.');}
 const response=await evolutionRequest('/webhook/set/{instance}','POST',{webhook:{enabled:true,url:callback,headers:{'x-oliveira-webhook-secret':process.env.WHATSAPP_WEBHOOK_SECRET},byEvents:false,base64:false,events:['MESSAGES_UPSERT']}});if(!response.ok)throw new HttpError(502,'Não foi possível restaurar o webhook.');
 const check=await evolutionRequest('/webhook/find/{instance}');if(!check.ok)throw new HttpError(502,'Não foi possível confirmar o webhook.');const data=await check.json(),saved=data.webhook||data;if(saved?.url!==callback||!saved.enabled||!secretMatches(saved.headers?.['x-oliveira-webhook-secret'],process.env.WHATSAPP_WEBHOOK_SECRET))throw new HttpError(502,'A Evolution não confirmou o webhook.');
 const updated=await a.db.from('whatsapp_channels').update({enabled:true,webhook_verified:true}).eq('instance',c.instance).eq('user_id',a.ownerId);if(updated.error)throw new HttpError(503,'Não foi possível confirmar o vínculo no banco.');await audit(a,'Restaurou o webhook WhatsApp');return whatsappDiagnosis(a);
}
