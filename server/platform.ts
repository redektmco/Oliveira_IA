import type {User} from '@supabase/supabase-js';
import {appOrigin,text,uuid,type Access} from './access.js';
import {HttpError} from './validation.js';
import {defaultChatBudgets} from './ai-limits.js';
import {defaultSettings} from '../src/lib/settings-types.js';

/**
 * Painel da agência: cria e administra workspaces de clientes.
 * Cada cliente é dono do próprio workspace (isolado por RLS) e só enxerga o que é dele.
 * A agência entra como membro oculto (hidden) com função de administrador: não aparece na equipe do cliente.
 */
const MIGRATION='Aplique a migração supabase/migrations/202611070010_platform_limits.sql no Supabase para usar o painel da agência.';
const usd=(micros:number|null|undefined)=>micros==null?null:Math.round(Number(micros)/10_000)/100;
const emailOf=(value:unknown)=>{const email=text(value,254,true).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new HttpError(400,'Informe um e-mail válido.');return email;};
function requirePlatform(a:Access){if(!a.platformAdmin)throw new HttpError(403,'Somente a equipe da agência acessa este painel.');}
function dayStart(timezone='America/Sao_Paulo'){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
 const local=Date.UTC(+parts.year,+parts.month-1,+parts.day,+parts.hour,+parts.minute,+parts.second),offset=local-Math.floor(Date.now()/1000)*1000;
 return new Date(Date.UTC(+parts.year,+parts.month-1,+parts.day)-offset).toISOString();
}

async function findUserByEmail(a:Access,email:string):Promise<User|null>{
 for(let page=1;page<=20;page++){
  const r=await a.db.auth.admin.listUsers({page,perPage:500});if(r.error)throw new HttpError(503,'Não foi possível consultar as contas.');
  const found=r.data.users.find(u=>u.email?.toLowerCase()===email);if(found)return found;if(r.data.users.length<500)return null;
 }
 return null;
}

/** Garante as configurações iniciais, o registro do cliente e o acesso oculto da agência. */
async function attachWorkspace(a:Access,ownerId:string,name:string,ownerEmail:string,overwriteName:boolean){
 const defaults=defaultSettings();
 const config={general:{...defaults.general,name,email:ownerEmail},email:{...defaults.email,senderName:name,signature:`Atenciosamente,\nEquipe ${name}`}};
 const settings=await a.db.from('workspace_settings').upsert({user_id:ownerId,config},{onConflict:'user_id',ignoreDuplicates:!overwriteName});
 if(settings.error)throw new HttpError(503,'Não foi possível preparar o workspace do cliente.');
 const row=await a.db.from('platform_workspaces').upsert({owner_id:ownerId,name,owner_email:ownerEmail,created_by:a.user.id},{onConflict:'owner_id'});
 if(row.error)throw new HttpError(503,MIGRATION);
 await joinWorkspace(a,ownerId);
 await a.db.from('workspace_audit').insert({user_id:ownerId,actor_id:a.user.id,actor_email:'Agência',action:'Workspace preparado pela agência'});
}
async function joinWorkspace(a:Access,ownerId:string){
 const r=await a.db.from('workspace_members').upsert({owner_id:ownerId,user_id:a.user.id,email:(a.user.email||'').toLowerCase(),name:'Agência',role:'admin',status:'active',hidden:true,token_hash:null,expires_at:null},{onConflict:'owner_id,email'});
 if(r.error)throw new HttpError(503,MIGRATION);
}

async function list(a:Access){
 const rows=await a.db.from('platform_workspaces').select('*').order('created_at',{ascending:false});
 if(rows.error)throw new HttpError(503,MIGRATION);
 const ids=rows.data.map(r=>r.owner_id as string),defaults=defaultChatBudgets();
 if(!ids.length)return {workspaces:[],defaults:{windowUsd:usd(defaults.windowMicros),dailyUsd:usd(defaults.dailyMicros)}};
 const since=dayStart();
 const [settings,members,usage,owners]=await Promise.all([
  a.db.from('workspace_settings').select('user_id,config').in('user_id',ids),
  a.db.from('workspace_members').select('*').in('owner_id',ids).eq('status','active'),
  a.db.from('ai_usage').select('user_id,kind,cost_micros').in('user_id',ids).gte('created_at',since).limit(20000),
  Promise.all(ids.map(id=>a.db.auth.admin.getUserById(id).then(r=>r.data.user).catch(()=>null))),
 ]);
 return {
  defaults:{windowUsd:usd(defaults.windowMicros),dailyUsd:usd(defaults.dailyMicros)},
  workspaces:rows.data.map((r,i)=>{
   const owner=owners[i],team=(members.data||[]).filter(m=>m.owner_id===r.owner_id),spent=(usage.data||[]).filter(u=>u.user_id===r.owner_id);
   const sum=(kind:string)=>usd(spent.filter(u=>kind==='chat'?u.kind==='chat':u.kind!=='chat').reduce((t,u)=>t+(Number(u.cost_micros)||0),0));
   return {
    ownerId:r.owner_id,name:(settings.data||[]).find(s=>s.user_id===r.owner_id)?.config?.general?.name||r.name,email:owner?.email||r.owner_email,createdAt:r.created_at,
    status:owner?.last_sign_in_at?'active':'invited',lastSignInAt:owner?.last_sign_in_at||null,
    members:1+team.filter(m=>!m.hidden).length,joined:team.some(m=>m.user_id===a.user.id),
    limits:{windowUsd:usd(r.chat_window_micros),dailyUsd:usd(r.chat_daily_micros)},
    today:{chatUsd:sum('chat'),otherUsd:sum('other'),calls:spent.length},
   };
  }),
 };
}

async function create(a:Access,b:Record<string,any>){
 const name=text(b.name,120,true),email=emailOf(b.email),contact=text(b.contactName||'',120);
 if(email===a.user.email?.toLowerCase())throw new HttpError(400,'Use o e-mail do cliente, não o seu.');
 const redirectTo=`${appOrigin()}/app`;
 let ownerId:string,url:string|null=null,emailSent=true;
 const invited=await a.db.auth.admin.inviteUserByEmail(email,{redirectTo,data:{name:contact}});
 if(invited.error||!invited.data.user){
  if(await findUserByEmail(a,email))throw new HttpError(409,'Este e-mail já tem uma conta. Use “Adicionar conta existente” ou informe outro e-mail.');
  // Sem envio de e-mail (limite do SMTP): cria a conta e devolve o link para a agência enviar ao cliente.
  const link=await a.db.auth.admin.generateLink({type:'invite',email,options:{redirectTo,data:{name:contact}}});
  if(link.error||!link.data.user)throw new HttpError(503,'Não foi possível criar o acesso do cliente. Tente novamente.');
  ownerId=link.data.user.id;url=link.data.properties.action_link;emailSent=false;
 }else ownerId=invited.data.user.id;
 await attachWorkspace(a,ownerId,name,email,true);
 return {ownerId,emailSent,url};
}

async function attach(a:Access,b:Record<string,any>){
 const email=emailOf(b.email),user=await findUserByEmail(a,email);
 if(!user)throw new HttpError(404,'Nenhuma conta encontrada com este e-mail.');
 if(user.id===a.user.id)throw new HttpError(400,'Este é o seu próprio workspace.');
 const current=await a.db.from('workspace_settings').select('config').eq('user_id',user.id).maybeSingle();
 const name=text(b.name||'',120)||current.data?.config?.general?.name||email.split('@')[0];
 await attachWorkspace(a,user.id,name,email,false);
 return {ownerId:user.id};
}

async function known(a:Access,id:unknown){uuid(id);const r=await a.db.from('platform_workspaces').select('owner_id,owner_email').eq('owner_id',id).maybeSingle();if(r.error)throw new HttpError(503,MIGRATION);if(!r.data)throw new HttpError(404,'Workspace de cliente não encontrado.');return r.data as {owner_id:string;owner_email:string};}

async function limits(a:Access,b:Record<string,any>){
 const row=await known(a,b.ownerId);
 const parse=(v:unknown)=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);if(!Number.isFinite(n)||n<0.01||n>1000)throw new HttpError(400,'Informe valores entre US$ 0,01 e US$ 1.000.');return Math.round(n*1_000_000);};
 const window=parse(b.windowUsd),daily=parse(b.dailyUsd);
 const r=await a.db.from('platform_workspaces').update({chat_window_micros:window,chat_daily_micros:daily}).eq('owner_id',row.owner_id);
 if(r.error)throw new HttpError(503,'Não foi possível salvar os limites.');
 return {saved:true};
}

async function accessLink(a:Access,b:Record<string,any>){
 const row=await known(a,b.ownerId),owner=await a.db.auth.admin.getUserById(row.owner_id);
 const email=owner.data.user?.email||row.owner_email;if(!email)throw new HttpError(404,'O cliente não tem e-mail cadastrado.');
 const link=await a.db.auth.admin.generateLink({type:'recovery',email,options:{redirectTo:`${appOrigin()}/app`}});
 if(link.error)throw new HttpError(503,'Não foi possível gerar o link de acesso.');
 return {url:link.data.properties.action_link,email};
}

export async function platformAction(a:Access,b:Record<string,any>){
 requirePlatform(a);
 switch(b.action){
  case 'platform.list':return list(a);
  case 'platform.create':return create(a,b);
  case 'platform.attach':return attach(a,b);
  case 'platform.join':{const row=await known(a,b.ownerId);await joinWorkspace(a,row.owner_id);return {joined:true};}
  case 'platform.limits':return limits(a,b);
  case 'platform.link':return accessLink(a,b);
  default:throw new HttpError(400,'Operação inválida.');
 }
}
