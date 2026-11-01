import type {SupabaseClient} from '@supabase/supabase-js';
import {HttpError} from './validation.js';

/**
 * Limite do chat de IA (Assistente da tela inicial e Playground), no estilo Claude:
 * uma sessão móvel de 5 horas que começa na primeira mensagem e um teto diário,
 * por pessoa em cada workspace. O SDR IA (WhatsApp, widget, e-mail, Instagram),
 * as automações e os resumos não têm limite.
 */
export const WINDOW_HOURS=5;
export type UsageKind='chat'|'sdr'|'automation'|'summary';
export type ChatPolicy={kind:'chat';actorId:string;windowMicros:number;dailyMicros:number;timezone:string};
export type UsagePolicy=ChatPolicy|{kind:Exclude<UsageKind,'chat'>};
export type ChatLimitStatus={
 windowHours:number;
 window:{percent:number;startedAt:string|null;resetsAt:string|null};
 daily:{percent:number;resetsAt:string};
 blocked:null|'window'|'daily';
 budgets?:{windowUsd:number;dailyUsd:number};
};
type UsageRow={window_start:string|null;window_end:string|null;window_used:number|string;day_used:number|string;day_end:string;pending:number|string};

const MICROS=1_000_000;
function budget(raw:string|undefined,fallbackUsd:number){const n=Number(raw);return Math.round((Number.isFinite(n)&&n>=0.01&&n<=1000?n:fallbackUsd)*MICROS);}
/** Padrões configuráveis na Vercel: AI_CHAT_WINDOW_USD (por sessão de 5h) e AI_CHAT_DAILY_USD (por dia). */
export function defaultChatBudgets(env:Record<string,string|undefined>=process.env){return {windowMicros:budget(env.AI_CHAT_WINDOW_USD,1),dailyMicros:budget(env.AI_CHAT_DAILY_USD,3)};}

/** Limites do workspace: os definidos pela agência ou os padrões do servidor. */
export async function chatPolicy(db:SupabaseClient,ownerId:string,actorId:string,timezone:string):Promise<ChatPolicy>{
 const defaults=defaultChatBudgets();
 const r=await db.from('platform_workspaces').select('chat_window_micros,chat_daily_micros').eq('owner_id',ownerId).maybeSingle();
 const row=r.error?null:r.data as {chat_window_micros:number|null;chat_daily_micros:number|null}|null;
 return {kind:'chat',actorId,timezone:timezone||'America/Sao_Paulo',windowMicros:Number(row?.chat_window_micros)||defaults.windowMicros,dailyMicros:Number(row?.chat_daily_micros)||defaults.dailyMicros};
}

const pct=(used:number,limit:number)=>limit>0?Math.min(100,Math.max(0,Math.floor(used/limit*100))):100;
export function toStatus(row:UsageRow,policy:ChatPolicy):ChatLimitStatus{
 const windowUsed=Number(row.window_used)||0,dayUsed=Number(row.day_used)||0;
 const windowPercent=row.window_start?pct(windowUsed,policy.windowMicros):0,dailyPercent=pct(dayUsed,policy.dailyMicros);
 return {windowHours:WINDOW_HOURS,window:{percent:windowPercent,startedAt:row.window_start,resetsAt:row.window_start?row.window_end:null},daily:{percent:dailyPercent,resetsAt:row.day_end},
  blocked:dailyPercent>=100?'daily':windowPercent>=100?'window':null};
}

/** Situação atual da pessoa; null quando a migração ainda não foi aplicada. */
export async function chatLimitStatus(db:SupabaseClient,ownerId:string,policy:ChatPolicy):Promise<ChatLimitStatus|null>{
 const r=await db.rpc('ai_chat_usage',{p_user_id:ownerId,p_actor:policy.actorId,p_timezone:policy.timezone});
 if(r.error||!r.data||typeof r.data!=='object')return null;
 return toStatus(r.data as UsageRow,policy);
}

function clock(iso:string|null|undefined,timezone:string){
 if(!iso)return '';
 const date=new Date(iso);if(Number.isNaN(date.getTime()))return '';
 try{return new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:timezone}).format(date);}catch{return new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'}).format(date);}
}
export function limitMessage(code:string,status:ChatLimitStatus|null,timezone:string){
 if(code==='AI_CHAT_BUSY')return 'Aguarde a resposta anterior da IA terminar antes de enviar outra mensagem.';
 if(code==='AI_CHAT_DAILY_LIMIT'){const at=clock(status?.daily.resetsAt,timezone);return `Você usou 100% do limite diário do chat de IA. O uso volta${at?` amanhã às ${at}`:' amanhã'}. O atendimento automático (SDR IA) continua funcionando normalmente.`;}
 const at=clock(status?.window.resetsAt,timezone);
 return `Você usou 100% da sua sessão de ${WINDOW_HOURS} horas do chat de IA. O uso volta${at?` às ${at}`:' em breve'}. O atendimento automático (SDR IA) continua funcionando normalmente.`;
}
export async function chatLimitError(db:SupabaseClient,ownerId:string,policy:ChatPolicy,code:string){
 const status=await chatLimitStatus(db,ownerId,policy).catch(()=>null);
 return new HttpError(429,limitMessage(code,status,policy.timezone));
}
