import type {VercelRequest,VercelResponse} from '@vercel/node';
import {waitUntil} from '@vercel/functions';
import {access,adminDb,appOrigin,audit,bodyOf,contactAccess,digest,ipAllowed,randomToken,requireRole,safeError,seal,text,uuid,type Access} from '../server/access.js';
import {HttpError} from '../server/validation.js';
import {readData,writeData} from '../server/workspace-data.js';
import {validateSection} from '../server/settings-validation.js';
import {billing,billingAction,disconnect,domainAuth,syncGoogle} from '../server/providers.js';
import {webhookEvents} from '../src/lib/settings-types.js';
import {resolveWebhook} from '../server/webhooks.js';
import {whatsappConnect,whatsappDiagnosis,whatsappRepair} from '../server/whatsapp-settings.js';
import {contactSummary,sendChannelMessage,startWhatsApp} from '../server/channels.js';
import {assistantChat,deleteThread,listThreads,loadThread} from '../server/assistant.js';
import {kickWorkflows} from '../server/automations.js';
import {deleteWorkflow,getWorkflow,listRuns,listWorkflows,runWorkflowNow,saveWorkflow,setWorkflowStatus} from '../server/workflows.js';
export const config={maxDuration:60};
async function settings(a:Access){
 const [accounts,s]=await Promise.all([a.db.from('integration_accounts').select('provider,label,connected_at,synced_at,metadata').eq('user_id',a.ownerId),a.db.from('workspace_settings').upsert({user_id:a.ownerId,config:a.settings},{onConflict:'user_id',ignoreDuplicates:true}).select('widget_key').maybeSingle()]);
 const current=s.data|| (await a.db.from('workspace_settings').select('widget_key').eq('user_id',a.ownerId).single()).data;
 if(accounts.error||!current)throw new HttpError(503,'Não foi possível carregar as configurações.');
 return {settings:a.settings,accounts:accounts.data.map(({metadata,...row})=>({...row,expiresAt:metadata?.expiresAt||null})),widgetKey:current.widget_key,capabilities:{google:Boolean(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET&&process.env.INTEGRATION_ENCRYPTION_KEY),instagram:Boolean(process.env.META_APP_ID&&process.env.META_APP_SECRET&&process.env.INTEGRATION_ENCRYPTION_KEY),stripe:Boolean(process.env.STRIPE_SECRET_KEY),whatsapp:Boolean(process.env.WHATSAPP_EVO_URL&&(process.env.WHATSAPP_EVO_TOKEN||process.env.WHATSAPP_TOKEN_EVO))}};
}
async function team(a:Access){
 const members=await a.db.from('workspace_members').select('id,user_id,owner_id,email,name,role,status,last_seen_at,created_at').eq('owner_id',a.ownerId).order('created_at');if(members.error)throw new HttpError(503,'Não foi possível carregar a equipe.');
 const owner=await a.db.auth.admin.getUserById(a.ownerId);return [{id:a.ownerId,user_id:a.ownerId,owner_id:a.ownerId,email:owner.data.user?.email||'',name:owner.data.user?.user_metadata?.name||'Proprietário',role:'admin',status:'active',created_at:owner.data.user?.created_at||'',owner:true},...members.data].map(m=>a.role==='seller'?{...m,email:''}:m);
}
async function bootstrap(a:Access){
 const memberships=await a.db.from('workspace_members').select('owner_id,role').eq('user_id',a.user.id).eq('status','active');if(memberships.error)throw new HttpError(503,'Não foi possível carregar os workspaces.');
 const ids=[a.user.id,...memberships.data.map(m=>m.owner_id)],names=await a.db.from('workspace_settings').select('user_id,config').in('user_id',ids);
 return {ownerId:a.ownerId,userId:a.user.id,role:a.role,email:a.user.email,requireMfa:a.settings.security.requireMfa,phoneFormat:a.settings.general.phoneFormat,workspaceName:a.settings.general.name,logo:a.settings.general.logo,sessionId:a.sessionId,workspaces:ids.map(id=>({id,name:names.data?.find(s=>s.user_id===id)?.config?.general?.name||(id===a.user.id?'Meu workspace':'Workspace compartilhado'),role:id===a.user.id?'admin':memberships.data.find(m=>m.owner_id===id)?.role}))};
}
export default async function handler(req:VercelRequest,res:VercelResponse){
 res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='POST')return res.status(405).json({error:'Use POST.'});
 try{
 const b=bodyOf(req,3*1024*1024),a=await access(req,{mfaSetup:b.action==='bootstrap'||b.action==='security.mfa'});
 if(b.action==='bootstrap')return res.status(200).json(await bootstrap(a));
 if(b.action==='data')return res.status(200).json({data:await readData(a)});
 if(['create','update','delete'].includes(b.action)){const result=await writeData(a,b);waitUntil(kickWorkflows());return res.status(200).json(result);}
 if(b.action==='settings'){requireRole(a,['admin','manager']);return res.status(200).json(await settings(a));}
 if(b.action==='settings.save'){
  requireRole(a);const section=text(b.section,30,true),value=validateSection(section,b.value);
  if(section==='security'){
   if(!ipAllowed(a.ip,value.allowedIps))throw new HttpError(400,'Inclua seu IP atual na lista para evitar bloquear seu próprio acesso.');
   if(value.requireMfa){const claims=JSON.parse(Buffer.from(a.token.split('.')[1],'base64url').toString('utf8'));if(claims.aal!=='aal2')throw new HttpError(409,'Ative e confirme seu autenticador antes de exigir duas etapas para a equipe.');}
  }
  if(section==='widget'&&value.agentId){const r=await a.db.from('agents').select('id,active').eq('user_id',a.ownerId).eq('id',value.agentId).single();if(!r.data?.active)throw new HttpError(400,'Escolha um agente ativo do workspace.');}
  // Section merge happens under a row lock, so simultaneous edits cannot overwrite other tabs.
  const r=await a.db.rpc('workspace_save_section',{p_owner:a.ownerId,p_section:section,p_value:value});if(r.error)throw new HttpError(503,'Não foi possível salvar as configurações.');await audit(a,`Editou configurações: ${section}`);return res.status(200).json({saved:true});
 }
 if(b.action==='contact.context')return res.status(200).json({members:await team(a),preferences:{recordHistory:a.settings.general.recordHistory,phoneFormat:a.settings.general.phoneFormat}});
 if(b.action==='team')return res.status(200).json({members:await team(a)});
 if(b.action==='team.invite'){
  requireRole(a);const email=text(b.email,254,true).toLowerCase(),name=text(b.name||'',120),role=text(b.role,10,true);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!['admin','manager','seller'].includes(role)||email===a.user.email?.toLowerCase())throw new HttpError(400,'Informe outro e-mail válido e uma função.');
  const token=randomToken(),expires=new Date(Date.now()+7*86400000).toISOString();
  const existing=await a.db.from('workspace_members').select('id,status').eq('owner_id',a.ownerId).eq('email',email).maybeSingle();if(existing.data?.status==='active')throw new HttpError(409,'Esta pessoa já faz parte da equipe.');
  const r=await a.db.from('workspace_members').upsert({owner_id:a.ownerId,email,name,role,status:'pending',token_hash:digest(token),expires_at:expires},{onConflict:'owner_id,email'}).select('id').single();if(r.error)throw new HttpError(503,'Não foi possível criar o convite.');
  const url=`${appOrigin()}/app?invite=${encodeURIComponent(token)}`;
  // Supabase delivers invitations for new users; registered users can use the explicit invitation link.
  const invited=await a.db.auth.admin.inviteUserByEmail(email,{redirectTo:url,data:{name}});
  await audit(a,`Convidou ${email} como ${role}`);return res.status(201).json({url,emailSent:!invited.error,expiresAt:expires});
 }
 if(b.action==='team.accept'){
  const token=text(b.token,100,true);if(!a.user.email_confirmed_at)throw new HttpError(403,'Confirme seu e-mail antes de aceitar o convite.');
  const accepted=await a.db.from('workspace_members').update({user_id:a.user.id,status:'active',token_hash:null,expires_at:null}).eq('email',a.user.email?.toLowerCase()).eq('token_hash',digest(token)).eq('status','pending').gt('expires_at',new Date().toISOString()).select('owner_id').maybeSingle();if(accepted.error||!accepted.data)throw new HttpError(400,'Convite inválido, expirado ou destinado a outro e-mail.');return res.status(200).json({ownerId:accepted.data.owner_id});
 }
 if(b.action==='team.update'){
  requireRole(a);uuid(b.id);if(!['admin','manager','seller'].includes(b.role)||!['active','disabled'].includes(b.status))throw new HttpError(400,'Função ou status inválido.');
  const r=await a.db.from('workspace_members').update({role:b.role,status:b.status}).eq('id',b.id).eq('owner_id',a.ownerId).neq('user_id',a.user.id).not('user_id','is',null).select('id');if(r.error||!r.data?.length)throw new HttpError(400,'Não é possível alterar o proprietário, sua própria função ou um convite pendente.');await audit(a,'Alterou função ou acesso de um membro');return res.status(200).json({saved:true});
 }
 if(b.action==='team.remove'){
  requireRole(a);uuid(b.id);const r=await a.db.from('workspace_members').delete().eq('id',b.id).eq('owner_id',a.ownerId).or(`user_id.is.null,user_id.neq.${a.user.id}`).select('id');if(r.error||!r.data?.length)throw new HttpError(400,'Não é possível remover o proprietário ou a própria conta.');await audit(a,'Removeu membro ou convite');return res.status(200).json({removed:true});
 }
 if(b.action==='billing')return res.status(200).json(await billing(a));
 if(b.action==='billing.portal'||b.action==='billing.checkout')return res.status(200).json(await billingAction(a,b.action,b.plan));
 if(b.action==='calendar.status'){
  const mine=await a.db.from('calendar_accounts').select('email,connected_at').eq('owner_id',a.ownerId).eq('member_id',a.user.id).maybeSingle();
  const all=a.role==='seller'?{data:[]}:await a.db.from('calendar_accounts').select('member_id,email,connected_at').eq('owner_id',a.ownerId);
  return res.status(200).json({configured:Boolean(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET&&process.env.INTEGRATION_ENCRYPTION_KEY),available:!mine.error,mine:mine.data||null,calendars:all.data||[],scheduling:a.settings.scheduling});
 }
 if(b.action==='calendar.disconnect'){const r=await a.db.from('calendar_accounts').delete().eq('owner_id',a.ownerId).eq('member_id',a.user.id);if(r.error)throw new HttpError(503,'Não foi possível desconectar a agenda.');await audit(a,'Desconectou o Google Calendar');return res.status(200).json({disconnected:true});}
 if(b.action==='integration.disconnect'){await disconnect(a,b.provider);await audit(a,`Desconectou ${b.provider}`);return res.status(200).json({disconnected:true});}
 if(b.action==='email.sync'){requireRole(a,['admin','manager']);const result=await syncGoogle(a.db,a.ownerId);await audit(a,'Sincronizou o e-mail');return res.status(200).json(result);}
 if(b.action==='email.domain'){requireRole(a,['admin','manager']);const account=await a.db.from('integration_accounts').select('label').eq('provider','google').eq('user_id',a.ownerId).maybeSingle();return res.status(200).json({records:await domainAuth(account.data?.label||'')});}
 if(b.action==='whatsapp.status')return res.status(200).json(await whatsappDiagnosis(a));
 if(b.action==='whatsapp.connect')return res.status(200).json(await whatsappConnect(a,b.phone));
 if(b.action==='whatsapp.repair')return res.status(200).json(await whatsappRepair(a));
 if(b.action==='api.list'){
  requireRole(a);const [keys,hooks,deliveries]=await Promise.all([a.db.from('workspace_api_keys').select('id,name,prefix,last_used_at,created_at,revoked_at').eq('user_id',a.ownerId).order('created_at',{ascending:false}),a.db.from('workspace_webhooks').select('id,url,events,enabled,failure_count,created_at').eq('user_id',a.ownerId),a.db.from('webhook_deliveries').select('id,event,endpoint_id,status,response_code,duration_ms,created_at').eq('user_id',a.ownerId).order('created_at',{ascending:false}).limit(30)]);if(keys.error||hooks.error||deliveries.error)throw new HttpError(503,'Não foi possível carregar chaves e webhooks.');return res.status(200).json({keys:keys.data,webhooks:hooks.data,deliveries:deliveries.data});
 }
 if(b.action==='api.create'){
  requireRole(a);const name=text(b.name,120,true),key=`oc_live_${randomToken()}`;const r=await a.db.from('workspace_api_keys').insert({user_id:a.ownerId,name,prefix:key.slice(0,16),token_hash:digest(key)}).select('id').single();if(r.error)throw new HttpError(503,'Não foi possível criar a chave.');await audit(a,`Criou a chave de API “${name}”`);return res.status(201).json({key});
 }
 if(b.action==='api.revoke'){requireRole(a);uuid(b.id);const r=await a.db.from('workspace_api_keys').update({revoked_at:new Date().toISOString()}).eq('id',b.id).eq('user_id',a.ownerId).select('id');if(r.error||!r.data?.length)throw new HttpError(404,'Chave não encontrada.');await audit(a,'Revogou uma chave de API');return res.status(200).json({revoked:true});}
 if(b.action==='webhook.create'){
  requireRole(a);const url=text(b.url,2000,true);await resolveWebhook(url);if(!Array.isArray(b.events)||!b.events.length||b.events.some((e:any)=>!webhookEvents.includes(e)))throw new HttpError(400,'Selecione os eventos do webhook.');
  const secret=randomToken(),r=await a.db.from('workspace_webhooks').insert({user_id:a.ownerId,url,events:b.events,secret:seal({value:secret})}).select('id').single();if(r.error)throw new HttpError(503,'Não foi possível adicionar o endpoint.');await audit(a,'Criou um endpoint de webhook');return res.status(201).json({secret});
 }
 if(b.action==='webhook.remove'){requireRole(a);uuid(b.id);const r=await a.db.from('workspace_webhooks').delete().eq('user_id',a.ownerId).eq('id',b.id).select('id');if(r.error||!r.data?.length)throw new HttpError(404,'Endpoint não encontrado.');await audit(a,'Removeu um endpoint de webhook');return res.status(200).json({removed:true});}
 if(b.action==='notifications'){const q=a.db.from('workspace_notifications').select('id,title,contact_id,created_at,read_at').eq('user_id',a.ownerId).order('created_at',{ascending:false}).limit(30);if(a.role==='seller')q.eq('recipient_id',a.user.id);const r=await q;if(r.error)throw new HttpError(503,'Não foi possível carregar notificações.');return res.status(200).json({items:r.data});}
 if(b.action==='notifications.read'){uuid(b.id);const q=a.db.from('workspace_notifications').update({read_at:new Date().toISOString()}).eq('id',b.id).eq('user_id',a.ownerId);if(a.role==='seller')q.eq('recipient_id',a.user.id);const r=await q.select('id');if(r.error||!r.data?.length)throw new HttpError(404,'Notificação não encontrada.');return res.status(200).json({read:true});}
 if(b.action==='security.list'){
  requireRole(a);const [sessions,log]=await Promise.all([a.db.from('workspace_sessions').select('id,device,ip,last_seen_at,created_at,revoked_at').eq('user_id',a.user.id).is('revoked_at',null).order('last_seen_at',{ascending:false}),a.db.from('workspace_audit').select('id,actor_email,action,created_at').eq('user_id',a.ownerId).order('created_at',{ascending:false}).limit(100)]);if(sessions.error||log.error)throw new HttpError(503,'Não foi possível carregar as sessões e auditoria.');return res.status(200).json({sessions:sessions.data.map(s=>({...s,current:s.id===a.sessionId})),audit:log.data,ip:a.ip});
 }
 if(b.action==='security.revoke'){requireRole(a);uuid(b.id);if(b.id===a.sessionId)throw new HttpError(400,'Use Sair da conta para encerrar esta sessão.');const r=await a.db.from('workspace_sessions').update({revoked_at:new Date().toISOString()}).eq('id',b.id).eq('user_id',a.user.id).select('id');if(r.error||!r.data?.length)throw new HttpError(404,'Sessão não encontrada.');await audit(a,'Encerrou uma sessão');return res.status(200).json({revoked:true});}
 if(b.action==='security.export'){
  requireRole(a);const contact=await contactAccess(a,b.contactId),all=await readData(a),conversations=(all.conversations as any[]).filter(c=>c.contact_id===b.contactId),ids=new Set(conversations.map(c=>c.id));await audit(a,'Exportou dados de um titular');return res.status(200).json({contact,conversations,messages:(all.messages as any[]).filter(m=>ids.has(m.conversation_id)),notes:(all.contact_notes as any[]).filter(n=>n.contact_id===b.contactId),meetings:(all.meetings as any[]).filter(n=>n.contact_id===b.contactId),deals:(all.deals as any[]).filter(n=>n.contact_id===b.contactId),files:(all.contact_files as any[]).filter(n=>n.contact_id===b.contactId)});
 }
 if(b.action==='security.erase'){
  requireRole(a);await contactAccess(a,b.contactId);if(b.confirmation!=='EXCLUIR')throw new HttpError(400,'Digite EXCLUIR para confirmar.');const files=await a.db.from('contact_files').select('storage_path').eq('user_id',a.ownerId).eq('contact_id',b.contactId);if(files.data?.length){const removed=await a.db.storage.from('crm-files').remove(files.data.map(f=>f.storage_path));if(removed.error)throw new HttpError(503,'Não foi possível remover os arquivos do contato.');}const r=await a.db.rpc('workspace_erase_contact',{p_owner:a.ownerId,p_contact:b.contactId});if(r.error)throw new HttpError(503,'Não foi possível excluir os dados do titular.');await a.db.from('workflow_runs').delete().eq('user_id',a.ownerId).eq('record_id',b.contactId);await audit(a,'Excluiu dados de um titular');return res.status(200).json({erased:true});
 }
 if(b.action==='assistant.chat'){const reply=await assistantChat(a,b);if(reply.actions.some(x=>x.ok&&x.kind!=='read'))waitUntil(kickWorkflows());return res.status(200).json(reply);}
 if(b.action==='workflows.list')return res.status(200).json({...await listWorkflows(a),runs:await listRuns(a,undefined,40)});
 if(b.action==='workflows.get')return res.status(200).json({workflow:await getWorkflow(a,b.id),runs:await listRuns(a,b.id,50)});
 if(b.action==='workflows.save')return res.status(200).json({workflow:await saveWorkflow(a,b.workflow||{})});
 if(b.action==='workflows.status')return res.status(200).json({workflow:await setWorkflowStatus(a,b.id,b.status)});
 if(b.action==='workflows.delete')return res.status(200).json(await deleteWorkflow(a,b.id));
 if(b.action==='workflows.run'){const run=await runWorkflowNow(a,b.id,b.recordId||undefined);waitUntil(kickWorkflows());return res.status(202).json({run});}
 if(b.action==='assistant.threads')return res.status(200).json(await listThreads(a));
 if(b.action==='assistant.thread')return res.status(200).json(await loadThread(a,b.id));
 if(b.action==='assistant.delete')return res.status(200).json(await deleteThread(a,b.id));
 if(b.action==='contact.summary'){const c=await contactAccess(a,b.contactId);return res.status(200).json(await contactSummary(a,c));}
 if(b.action==='channel.send'){return res.status(202).json(await sendChannelMessage(a,b));}
 if(b.action==='whatsapp.start'){const result=await startWhatsApp(a,b);await audit(a,'Iniciou conversa pelo WhatsApp');return res.status(202).json(result);}
 if(b.action==='file.upload'){
  const c=await contactAccess(a,b.contactId),name=text(b.name,200,true),mime=text(b.mime,100,true),base64=text(b.base64,2800000,true);
  if(!['application/pdf','text/plain','text/markdown','image/png','image/jpeg','image/webp'].includes(mime)||!/^[-\w .()áéíóúãõçÁÉÍÓÚÃÕÇ]+$/.test(name)||name.startsWith('.')||name.includes('..')||!/^[-A-Za-z0-9+/=]+$/.test(base64))throw new HttpError(400,'Envie um PDF, texto ou imagem com nome válido.');const bytes=Buffer.from(base64,'base64');if(!bytes.length||bytes.length>2097152)throw new HttpError(413,'Use um arquivo de até 2 MB.');const path=`${a.ownerId}/${c.id}/${randomToken()}/${name}`;
  const uploaded=await a.db.storage.from('crm-files').upload(path,bytes,{contentType:mime});if(uploaded.error)throw new HttpError(503,'Não foi possível salvar o arquivo. Confira o bucket privado crm-files.');const saved=await a.db.from('contact_files').insert({user_id:a.ownerId,contact_id:c.id,name,mime,bytes:bytes.length,storage_path:path}).select().single();if(saved.error){await a.db.storage.from('crm-files').remove([path]);throw new HttpError(503,'Não foi possível registrar o arquivo.');}return res.status(201).json({file:saved.data});
 }
 if(b.action==='file.download'||b.action==='file.remove'){
  uuid(b.id);const file=await a.db.from('contact_files').select('*').eq('id',b.id).eq('user_id',a.ownerId).single();if(!file.data)throw new HttpError(404,'Arquivo não encontrado.');await contactAccess(a,file.data.contact_id);
  if(b.action==='file.download'){const signed=await a.db.storage.from('crm-files').createSignedUrl(file.data.storage_path,60,{download:file.data.name});if(!signed.data?.signedUrl)throw new HttpError(503,'Não foi possível gerar o download.');return res.status(200).json({url:signed.data.signedUrl});}
  const removed=await a.db.storage.from('crm-files').remove([file.data.storage_path]);if(removed.error)throw new HttpError(503,'Não foi possível remover o arquivo.');const deleted=await a.db.from('contact_files').delete().eq('id',file.data.id).eq('user_id',a.ownerId);if(deleted.error)throw new HttpError(503,'Não foi possível remover o registro do arquivo.');return res.status(200).json({removed:true});
 }
 if(b.action==='workspace.erase'){
  requireRole(a);if(a.ownerId!==a.user.id||b.confirmation!==a.settings.general.name)throw new HttpError(400,'Somente o proprietário pode excluir. Digite o nome exato do workspace.');
  const files=await a.db.from('contact_files').select('storage_path').eq('user_id',a.ownerId);if(files.data?.length){const removed=await a.db.storage.from('crm-files').remove(files.data.map(f=>f.storage_path));if(removed.error)throw new HttpError(503,'Não foi possível remover os arquivos.');}
  await a.db.from('workflows').delete().eq('user_id',a.ownerId);const r=await a.db.rpc('workspace_erase',{p_owner:a.ownerId});if(r.error)throw new HttpError(503,'Não foi possível excluir o workspace.');return res.status(200).json({erased:true});
 }
 throw new HttpError(400,'Operação desconhecida.');
 }catch(error){const e=safeError(error);return res.status(e.status).json({error:e.error});}
}
