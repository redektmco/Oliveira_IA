import {createClient,type SupabaseClient,type User} from '@supabase/supabase-js';
import type {VercelRequest} from '@vercel/node';
import {isIP} from 'node:net';
import {createHash,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {HttpError,parseBearerToken} from './validation.js';
import {mergeSettings,type WorkspaceSettings,type WorkspaceRole} from '../src/lib/settings-types.js';

export function adminDb():SupabaseClient {
 const url=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw new HttpError(503,'Configure o acesso privado ao Supabase no servidor.');
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:init?.signal?AbortSignal.any([init.signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)})}});
}
export const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export const randomToken=()=>randomBytes(32).toString('base64url');
export function appOrigin(){const url=new URL(process.env.APP_ORIGIN||'https://ai.v4oliveira.com.br');if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw new HttpError(503,'Configure APP_ORIGIN com HTTPS.');return url.origin;}
export function seal(secret:unknown){
 const key=process.env.INTEGRATION_ENCRYPTION_KEY;if(!key||!(/^[a-f0-9]{64}$/i.test(key)))throw new HttpError(503,'Configure INTEGRATION_ENCRYPTION_KEY com 32 bytes em hexadecimal.');
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);
 const encrypted=Buffer.concat([cipher.update(JSON.stringify(secret),'utf8'),cipher.final()]);return [iv,cipher.getAuthTag(),encrypted].map(b=>b.toString('base64url')).join('.');
}
export function unseal<T=Record<string,unknown>>(value:string):T {
 try{const key=process.env.INTEGRATION_ENCRYPTION_KEY;if(!key)throw new Error();const [iv,tag,data]=value.split('.').map(s=>Buffer.from(s,'base64url'));const c=createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);c.setAuthTag(tag);return JSON.parse(Buffer.concat([c.update(data),c.final()]).toString('utf8'));}catch{throw new HttpError(503,'Não foi possível abrir a credencial da integração. Confira a chave de criptografia do servidor.');}
}
export function bodyOf(req:VercelRequest,maxBytes=65536):Record<string,any>{
 let b=req.body;try{if(Buffer.isBuffer(b))b=b.toString('utf8');if(typeof b==='string'){if(Buffer.byteLength(b)>maxBytes)throw new HttpError(413,'Pedido muito grande.');b=JSON.parse(b);}if(!b||typeof b!=='object'||Array.isArray(b))throw new Error();if(Buffer.byteLength(JSON.stringify(b))>maxBytes)throw new HttpError(413,'Pedido muito grande.');return b;}catch(e){if(e instanceof HttpError)throw e;throw new HttpError(400,'Envie um objeto JSON válido.');}
}
export function uuid(value:unknown):asserts value is string{if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))throw new HttpError(400,'Identificador inválido.');}
export function text(value:unknown,max=200,required=false){if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw new HttpError(400,'Preencha os campos com valores válidos.');return value.trim();}
export function clientIp(req:VercelRequest){const h=req.headers['x-vercel-forwarded-for']||(process.env.VERCEL?undefined:req.headers['x-forwarded-for']);const ip=(typeof h==='string'?h.split(',')[0].trim():req.socket?.remoteAddress||'').replace(/^::ffff:/,'');return isIP(ip)?ip:'';}
export function ipAllowed(ip:string,rules:string[]){if(!rules.length)return true;if(!isIP(ip))return false;return rules.some(rule=>{
 if(!rule.includes('/'))return rule===ip;
 const [network,bits]=rule.split('/');if(isIP(network)!==4||isIP(ip)!==4)return false;const count=Number(bits);if(!Number.isInteger(count)||count<0||count>32)return false;
 const toNum=(s:string)=>s.split('.').reduce((n,p)=>(n<<8)|Number(p),0)>>>0,mask=count===0?0:(0xffffffff<<(32-count))>>>0;
 return (toNum(network)&mask)===(toNum(ip)&mask);
});}
export type Access={db:SupabaseClient;user:User;ownerId:string;role:WorkspaceRole;settings:WorkspaceSettings;sessionId:string;token:string;ip:string};
export async function access(req:VercelRequest,options:{mfaSetup?:boolean}={}):Promise<Access>{
 const token=parseBearerToken(req.headers.authorization),db=adminDb();
 const result=await db.auth.getUser(token);if(result.error||!result.data.user)throw new HttpError(401,'Sua sessão expirou. Entre novamente.');const user=result.data.user;
 const requested=req.headers['x-workspace-id'];if(requested!==undefined)uuid(requested);
 const ownerId=typeof requested==='string'?requested:user.id;
 let role:WorkspaceRole='admin';
 if(ownerId!==user.id){const m=await db.from('workspace_members').select('role').eq('owner_id',ownerId).eq('user_id',user.id).eq('status','active').maybeSingle();if(m.error||!m.data)throw new HttpError(403,'Você não tem acesso a este workspace.');role=m.data.role;}
 const config=await db.from('workspace_settings').select('config').eq('user_id',ownerId).maybeSingle();
 if(config.error)throw new HttpError(503,'Aplique a migração de configurações e equipe no Supabase.');
 const settings=mergeSettings(config.data?.config);
 let claims:Record<string,any>;try{claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8'));}catch{throw new HttpError(401,'Sessão inválida.');}
 if((settings.security.requireMfa||user.factors?.some(f=>f.status==='verified'))&&claims.aal!=='aal2'&&!options.mfaSetup)throw new HttpError(403,'Confirme seu código de autenticação em duas etapas para acessar o workspace.');
 if(!settings.security.allowGoogle&&claims.amr?.some((entry:any)=>entry.method==='oauth'))throw new HttpError(403,'O login Google está desabilitado neste workspace.');
 const ip=clientIp(req);if(!ipAllowed(ip,settings.security.allowedIps))throw new HttpError(403,'Este endereço IP não está autorizado a acessar o workspace.');
 const sessionId=typeof claims.session_id==='string'?claims.session_id:'';uuid(sessionId);
 const existing=await db.from('workspace_sessions').select('revoked_at,last_seen_at').eq('id',sessionId).eq('user_id',user.id).maybeSingle();if(existing.error)throw new HttpError(503,'Não foi possível verificar a sessão.');
 const lastSeen=existing.data?Date.parse(existing.data.last_seen_at):Number(claims.iat)*1000;
 if(existing.data?.revoked_at||!Number.isFinite(lastSeen)||Date.now()-lastSeen>settings.security.sessionDays*86400000)throw new HttpError(401,'Esta sessão foi encerrada ou expirou por inatividade. Entre novamente.');
 const device=String(req.headers['user-agent']||'Navegador').slice(0,300);
 const session=await db.from('workspace_sessions').upsert({id:sessionId,user_id:user.id,ip,device,last_seen_at:new Date().toISOString()},{onConflict:'id'});if(session.error)throw new HttpError(503,'Não foi possível registrar a sessão.');
 return {db,user,ownerId,role,settings,sessionId,token,ip};
}
export function requireRole(a:Access,roles:WorkspaceRole[]=['admin']){if(!roles.includes(a.role))throw new HttpError(403,'Sua função não permite esta operação.');}
export async function audit(a:Access,action:string){const r=await a.db.from('workspace_audit').insert({user_id:a.ownerId,actor_id:a.user.id,actor_email:a.user.email||'',action});if(r.error)throw new HttpError(503,'Não foi possível registrar a operação na auditoria.');}
export async function contactAccess(a:Access,id:string){uuid(id);const q=a.db.from('contacts').select('*').eq('id',id).eq('user_id',a.ownerId);if(a.role==='seller')q.eq('assigned_to',a.user.id);const r=await q.maybeSingle();if(r.error||!r.data)throw new HttpError(404,'Contato não encontrado ou sem acesso.');return r.data;}
export function maskedContact(contact:Record<string,any>){return {...contact,email:contact.email?`${contact.email.slice(0,2)}•••@•••`:'',phone:contact.phone?`•••• ${contact.phone.slice(-4)}`:''};}
export function safeError(error:unknown){return error instanceof HttpError?{status:error.status,error:error.message}:{status:500,error:'Não foi possível concluir a operação. Tente novamente.'};}
