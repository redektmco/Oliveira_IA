import type {VercelRequest,VercelResponse} from '@vercel/node';
import {access,adminDb,appOrigin,audit,digest,randomToken,requireRole,safeError,seal} from '../server/access.js';
import {providerFetch} from '../server/providers.js';
import {HttpError} from '../server/validation.js';
export const config={maxDuration:60};
const metaVersion=()=>process.env.META_API_VERSION||'v23.0';
export default async function handler(req:VercelRequest,res:VercelResponse){
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
 const provider=String(req.query?.provider||'');
 if(!['google','google_calendar','instagram'].includes(provider))return res.status(400).json({error:'Provedor inválido.'});
 const calendar=provider==='google_calendar';
 const cookieName=`oliveira_oauth_${provider}`,callback=`${appOrigin()}/api/oauth?provider=${provider}`;
 try{
  if(req.method==='POST'){
   const a=await access(req);if(!calendar)requireRole(a);
   const google=provider!=='instagram',clientId=google?process.env.GOOGLE_CLIENT_ID:process.env.META_APP_ID,secret=google?process.env.GOOGLE_CLIENT_SECRET:process.env.META_APP_SECRET;
   if(!clientId||!secret||!process.env.INTEGRATION_ENCRYPTION_KEY)throw new HttpError(503,google?'Configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e a chave de criptografia na Vercel.':'Configure META_APP_ID, META_APP_SECRET e a chave de criptografia na Vercel.');
   const state=randomToken(),record=await a.db.from('oauth_requests').insert({state_hash:digest(state),user_id:a.ownerId,actor_id:a.user.id,provider,expires_at:new Date(Date.now()+600000).toISOString()});if(record.error)throw new HttpError(503,'Não foi possível iniciar a autorização.');
   res.setHeader('Set-Cookie',`${cookieName}=${state}; Path=/api/oauth; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
   const url=new URL(google?'https://accounts.google.com/o/oauth2/v2/auth':`https://www.facebook.com/${metaVersion()}/dialog/oauth`);
   url.search=new URLSearchParams({client_id:clientId,redirect_uri:callback,response_type:'code',state,...(calendar?{access_type:'offline',prompt:'consent',scope:'openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy'}:provider==='google'?{access_type:'offline',prompt:'consent',scope:'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send'}:{scope:'instagram_basic,instagram_manage_messages,instagram_manage_comments,pages_show_list,pages_read_engagement,pages_manage_metadata'})}).toString();return res.status(200).json({url:url.href});
  }
  if(req.method!=='GET')return res.status(405).json({error:'Método não permitido.'});
  const state=String(req.query.state||''),cookie=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(`${cookieName}=`))?.slice(cookieName.length+1);
  if(!state||state.length>100||cookie!==state)throw new HttpError(400,'Autorização expirada. Inicie a conexão novamente.');
  res.setHeader('Set-Cookie',`${cookieName}=; Path=/api/oauth; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
  const db=adminDb(),r=await db.from('oauth_requests').delete().eq('state_hash',digest(state)).eq('provider',provider).gt('expires_at',new Date().toISOString()).select('*').maybeSingle();if(r.error||!r.data)throw new HttpError(400,'Autorização expirada ou já utilizada.');
  const owner=r.data.user_id,actor=r.data.actor_id;
  if(actor!==owner){const q=db.from('workspace_members').select('id').eq('owner_id',owner).eq('user_id',actor).eq('status','active');if(!calendar)q.eq('role','admin');const member=await q.maybeSingle();if(!member.data)throw new HttpError(403,calendar?'Você não faz mais parte deste workspace.':'O administrador perdeu acesso ao workspace.');}
  if(req.query.error||typeof req.query.code!=='string')throw new HttpError(400,'Conexão cancelada. Tente novamente quando desejar.');
  if(calendar){
   const tokens=await providerFetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID||'',client_secret:process.env.GOOGLE_CLIENT_SECRET||'',code:req.query.code,redirect_uri:callback,grant_type:'authorization_code'})});
   if(!tokens.refresh_token)throw new HttpError(409,'O Google não concedeu acesso offline. Remova a autorização anterior no Google e conecte novamente.');
   if(!String(tokens.scope||'').includes('calendar.events'))throw new HttpError(409,'Autorize o acesso aos eventos da agenda para a IA marcar reuniões.');
   const profile=await providerFetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:`Bearer ${tokens.access_token}`}});
   const saved=await db.from('calendar_accounts').upsert({owner_id:owner,member_id:actor,provider:'google',email:String(profile.email||'').slice(0,320),secret:seal({refresh_token:tokens.refresh_token}),connected_at:new Date().toISOString()},{onConflict:'owner_id,member_id'});if(saved.error)throw new HttpError(503,'Não foi possível salvar a agenda. Confira se a migração 202611010004 foi aplicada.');
   await db.from('workspace_audit').insert({user_id:owner,actor_id:actor,action:'Conectou o Google Calendar'});
   res.statusCode=303;res.setHeader('Location',`${appOrigin()}/app#meetings/calendar-connected`);return res.end();
  }
  if(provider==='google'){
   const tokens=await providerFetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID||'',client_secret:process.env.GOOGLE_CLIENT_SECRET||'',code:req.query.code,redirect_uri:callback,grant_type:'authorization_code'})});
   if(!tokens.refresh_token)throw new HttpError(409,'O Google não concedeu acesso offline. Remova a autorização anterior no Google e conecte novamente.');
   const profile=await providerFetch('https://gmail.googleapis.com/gmail/v1/users/me/profile',{headers:{Authorization:`Bearer ${tokens.access_token}`}});
   const saved=await db.from('integration_accounts').upsert({user_id:owner,provider,account_id:profile.emailAddress,label:profile.emailAddress,secret:seal({refresh_token:tokens.refresh_token}),metadata:{historyId:profile.historyId},connected_at:new Date().toISOString()},{onConflict:'user_id,provider'});if(saved.error)throw new HttpError(503,'Não foi possível salvar a conexão Google.');
  }else{
   const token=await providerFetch(`https://graph.facebook.com/${metaVersion()}/oauth/access_token?${new URLSearchParams({client_id:process.env.META_APP_ID||'',client_secret:process.env.META_APP_SECRET||'',redirect_uri:callback,code:req.query.code})}`);
   const long=await providerFetch(`https://graph.facebook.com/${metaVersion()}/oauth/access_token?${new URLSearchParams({grant_type:'fb_exchange_token',client_id:process.env.META_APP_ID||'',client_secret:process.env.META_APP_SECRET||'',fb_exchange_token:token.access_token})}`);
   const pages=await providerFetch(`https://graph.facebook.com/${metaVersion()}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}`,{headers:{Authorization:`Bearer ${long.access_token}`}});
   const candidates=(pages.data||[]).filter((p:any)=>p.instagram_business_account?.id);
   if(candidates.length!==1)throw new HttpError(409,candidates.length?'Autorize somente a página que deseja usar neste workspace e tente novamente.':'Vincule uma conta Instagram Business ou Creator a uma página do Facebook e autorize a conexão.');
   const page=candidates[0];
   await providerFetch(`https://graph.facebook.com/${metaVersion()}/${page.id}/subscribed_apps`,{method:'POST',headers:{Authorization:`Bearer ${page.access_token}`,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({subscribed_fields:'messages,messaging_postbacks,feed'})});
   const saved=await db.from('integration_accounts').upsert({user_id:owner,provider,account_id:page.instagram_business_account.id,label:page.instagram_business_account.username||page.name,secret:seal({access_token:page.access_token}),metadata:{pageId:page.id,expiresAt:long.expires_in?new Date(Date.now()+long.expires_in*1000).toISOString():null},connected_at:new Date().toISOString()},{onConflict:'user_id,provider'});if(saved.error)throw new HttpError(503,'Não foi possível salvar a conexão Instagram.');
  }
  await db.from('workspace_audit').insert({user_id:owner,actor_id:actor,action:`Conectou ${provider==='google'?'Google Workspace':'Instagram'}`});
  res.statusCode=303;res.setHeader('Location',`${appOrigin()}/app#settings/${provider==='google'?'email':'instagram'}?connected=1`);return res.end();
 }catch(error){const safe=safeError(error);if(req.method==='GET'){res.setHeader('Content-Type','text/html; charset=utf-8');const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));return res.status(safe.status).send(`<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width"><title>Conexão da conta</title><body style="font:16px system-ui;max-width:600px;margin:15vh auto;padding:24px"><h1>Não foi possível conectar</h1><p>${escape(safe.error)}</p><a href="${appOrigin()}/${calendar?'#meetings':`#settings/${provider==='google'?'email':'instagram'}`}">Voltar</a></body></html>`);}return res.status(safe.status).json({error:safe.error});}
}
