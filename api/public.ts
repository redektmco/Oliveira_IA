import type {VercelRequest,VercelResponse} from '@vercel/node';
import {adminDb,appOrigin,bodyOf,clientIp,digest,randomToken,safeError,text,uuid} from '../server/access.js';
import {HttpError,parseBearerToken} from '../server/validation.js';
import {mergeSettings} from '../src/lib/settings-types.js';
import {emitEvent} from '../server/webhooks.js';
import {replyToChannel} from '../server/channel-worker.js';
export const config={maxDuration:60};
async function rate(db:ReturnType<typeof adminDb>,bucket:string,limit:number,windowMs=60000){const r=await db.rpc('workspace_rate',{p_bucket:bucket,p_window:new Date(Math.floor(Date.now()/windowMs)*windowMs).toISOString(),p_limit:limit});if(r.error)throw new HttpError(503,'Não foi possível validar o limite de acesso.');if(!r.data)throw new HttpError(429,'Limite temporário atingido. Aguarde e tente novamente.');}
export default async function handler(req:VercelRequest,res:VercelResponse){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 try{
 const db=adminDb(),resource=String(req.query?.resource||'');
 if(resource==='contacts'){
  if(!['GET','POST'].includes(req.method||''))throw new HttpError(405,'Use GET ou POST.');
  const key=parseBearerToken(req.headers.authorization);if(!key.startsWith('oc_live_'))throw new HttpError(401,'Chave de API inválida.');
  const record=await db.from('workspace_api_keys').select('id,user_id').eq('token_hash',digest(key)).is('revoked_at',null).maybeSingle();if(record.error||!record.data)throw new HttpError(401,'Chave inválida ou revogada.');const owner=record.data.user_id;
  await rate(db,`api:${record.data.id}`,60);await db.from('workspace_api_keys').update({last_used_at:new Date().toISOString()}).eq('id',record.data.id);
  if(req.method==='GET'){
   const limit=Math.min(100,Math.max(1,Number(req.query.limit)||50)),q=db.from('contacts').select('id,name,email,phone,company,source,score,status,created_at').eq('user_id',owner).order('id').limit(limit+1);
   if(req.query.cursor){uuid(req.query.cursor);q.gt('id',req.query.cursor);}
   const r=await q;if(r.error)throw new HttpError(503,'Não foi possível listar os contatos.');const more=r.data.length>limit,rows=r.data.slice(0,limit);return res.status(200).json({data:rows,nextCursor:more?rows[rows.length-1].id:null});
  }
  const b=bodyOf(req),name=text(b.name,200,true),email=text(b.email||'',254),phone=text(b.phone||'',50),company=text(b.company||'',200),source=text(b.source||'API',100);
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new HttpError(400,'E-mail inválido.');
  const r=await db.from('contacts').insert({user_id:owner,name,email,phone,company,source}).select('id,name,email,phone,company,source,score,status,created_at').single();if(r.error)throw new HttpError(400,'Não foi possível criar o contato.');await emitEvent(db,owner,'lead.created',r.data);return res.status(201).json({data:r.data});
 }
 if(!['widget','widget.start','widget.message','widget.history'].includes(resource))throw new HttpError(404,'Endpoint não encontrado.');
 const b=req.method==='POST'?bodyOf(req):{},key=text(b.key||req.query?.key,100,true),account=await db.from('workspace_settings').select('user_id,config').eq('widget_key',key).maybeSingle();if(!account.data)throw new HttpError(404,'Widget não encontrado.');
 const owner=account.data.user_id,s=mergeSettings(account.data.config),widget=s.widget;if(!widget.enabled)throw new HttpError(409,'O chat está temporariamente indisponível.');
 const site=text(b.site||req.query?.site,250,true);let siteOrigin:string;try{siteOrigin=new URL(site).origin;}catch{throw new HttpError(403,'Origem inválida.');}if(!widget.domains.includes(siteOrigin))throw new HttpError(403,'Este site não está autorizado.');
 const origin=typeof req.headers.origin==='string'?req.headers.origin:undefined;if(origin&&origin!==appOrigin()&&!widget.domains.includes(origin))throw new HttpError(403,'Origem não autorizada.');if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
 if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');return res.status(204).end();}
 if(!['GET','POST'].includes(req.method||''))throw new HttpError(405,'Método não permitido.');
 await rate(db,`widget-ip:${owner}:${digest(clientIp(req))}`,40);
 if(resource==='widget')return res.status(200).json({title:widget.title,greeting:widget.greeting,color:widget.color,avatar:widget.avatar,captureContact:widget.captureContact,position:widget.position,consentRequired:s.security.recordConsent,consentText:`Autorizo ${s.general.name} a tratar meus dados para este atendimento comercial.`});
 if(resource==='widget.start'){
  if(req.method!=='POST')throw new HttpError(405,'Use POST.');
  await rate(db,`widget-session:${owner}:${digest(clientIp(req))}`,20,86400000);await rate(db,`widget-session:${owner}`,100,86400000);
  const name=text(b.name||(widget.captureContact?'':'Visitante do site'),200,true),phone=text(b.phone||'',50);
  if(widget.captureContact&&!/^\+?[\d\s()-]{10,25}$/.test(phone))throw new HttpError(400,'Informe seu WhatsApp com DDI.');if(s.security.recordConsent&&b.consent!==true)throw new HttpError(400,'Confirme o consentimento para iniciar.');
  const agent=await db.from('agents').select('id').eq('id',widget.agentId).eq('user_id',owner).eq('active',true).maybeSingle();if(!agent.data)throw new HttpError(409,'O atendimento está indisponível no momento.');
  const contact=await db.from('contacts').insert({user_id:owner,name,phone,source:`Widget · ${new URL(siteOrigin).hostname}`,...(b.consent===true?{consent_at:new Date().toISOString(),consent_text:`Autorizo ${s.general.name} a tratar meus dados para este atendimento comercial.`}:{})}).select('id').single();if(!contact.data)throw new HttpError(503,'Não foi possível iniciar o atendimento.');
  const cv=await db.from('conversations').insert({user_id:owner,contact_id:contact.data.id,agent_id:agent.data.id,channel:'widget',status:'ai'}).select('id').single();if(!cv.data)throw new HttpError(503,'Não foi possível iniciar a conversa.');
  const token=randomToken(),stored=await db.from('widget_sessions').insert({user_id:owner,token_hash:digest(token),conversation_id:cv.data.id,origin:siteOrigin,ip_hash:digest(clientIp(req)),expires_at:new Date(Date.now()+86400000).toISOString()});if(stored.error)throw new HttpError(503,'Não foi possível criar a sessão.');await emitEvent(db,owner,'lead.created',{id:contact.data.id,name,source:'Widget'});return res.status(201).json({token});
 }
 const token=text(b.token||req.query?.token,100,true),session=await db.from('widget_sessions').select('id,conversation_id').eq('user_id',owner).eq('token_hash',digest(token)).eq('origin',siteOrigin).gt('expires_at',new Date().toISOString()).maybeSingle();if(!session.data)throw new HttpError(401,'Sua sessão expirou. Inicie outra conversa.');const cvId=session.data.conversation_id;
 if(resource==='widget.message'){
  if(req.method!=='POST')throw new HttpError(405,'Use POST.');const message=text(b.message,4000,true);uuid(b.requestId);
  const lock=await db.from('widget_sessions').update({busy_until:new Date(Date.now()+60000).toISOString()}).eq('id',session.data.id).or(`busy_until.is.null,busy_until.lt.${new Date().toISOString()}`).select('id');if(!lock.data?.length)throw new HttpError(409,'Aguarde a resposta da mensagem anterior.');
  try{
   const current=await db.from('conversations').select('status').eq('id',cvId).eq('user_id',owner).single();if(current.data?.status==='closed')throw new HttpError(409,'Esta conversa foi encerrada.');
   const stored=await db.rpc('workspace_import_message',{p_event:`widget:${session.data.id}:${b.requestId}`,p_owner:owner,p_provider:'widget',p_conversation:cvId,p_content:message,p_external:b.requestId});if(stored.error)throw new HttpError(503,'Não foi possível guardar sua mensagem.');
   if(stored.data){await emitEvent(db,owner,'message.received',{conversation_id:cvId,channel:'widget'});if(current.data?.status==='ai')await replyToChannel(owner,cvId);}
  }finally{await db.from('widget_sessions').update({busy_until:null}).eq('id',session.data.id);}
 }
 const messages=await db.from('messages').select('id,role,content,created_at').eq('user_id',owner).eq('conversation_id',cvId).order('created_at',{ascending:false}).limit(100);if(messages.error)throw new HttpError(503,'Não foi possível atualizar a conversa.');return res.status(200).json({messages:messages.data.reverse()});
 }catch(error){const e=safeError(error);if(e.status===429)res.setHeader('Retry-After','60');return res.status(e.status).json({error:e.error});}
}
