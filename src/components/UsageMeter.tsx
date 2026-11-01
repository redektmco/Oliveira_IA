import {useCallback,useEffect,useState} from 'react';
import {useWorkspace} from '../lib/workspace';
import './usage-meter.css';

/** Situação do limite do chat de IA, calculada no servidor (server/ai-limits.ts). */
export type ChatLimits={windowHours:number;window:{percent:number;startedAt:string|null;resetsAt:string|null};daily:{percent:number;resetsAt:string};blocked:null|'window'|'daily'};
/** Peça para todos os medidores atualizarem (após uma resposta da IA). */
export const notifyUsage=(limits?:ChatLimits|null)=>window.dispatchEvent(new CustomEvent('oliveira-ai-usage',{detail:limits??null}));

function until(iso:string|null|undefined,now:number){
 if(!iso)return '';const ms=Date.parse(iso)-now;if(!Number.isFinite(ms))return '';
 if(ms<=60_000)return 'em instantes';const h=Math.floor(ms/3_600_000),m=Math.ceil((ms%3_600_000)/60_000);
 return h?`em ${h} h${m&&m<60?` ${m} min`:''}`:`em ${m} min`;
}
const clock=(iso:string|null|undefined)=>iso?new Date(iso).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'';
const tone=(p:number)=>p>=100?'full':p>=80?'high':p>=50?'mid':'low';

function useChatLimits(){
 const {api,demo,role,ownerId}=useWorkspace();
 const [limits,setLimits]=useState<ChatLimits|null>(null),[now,setNow]=useState(()=>Date.now());
 const load=useCallback(()=>{if(demo||role==='seller')return;api<{limits:ChatLimits|null}>('ai.limits').then(r=>setLimits(r.limits)).catch(()=>undefined);},[api,demo,role]);
 useEffect(()=>{setLimits(null);load();},[load,ownerId]);
 useEffect(()=>{
  const onUsage=(e:Event)=>{const detail=(e as CustomEvent<ChatLimits|null>).detail;if(detail)setLimits(detail);else load();};
  window.addEventListener('oliveira-ai-usage',onUsage);return()=>window.removeEventListener('oliveira-ai-usage',onUsage);
 },[load]);
 useEffect(()=>{const t=window.setInterval(()=>setNow(Date.now()),30_000);return()=>window.clearInterval(t);},[]);
 // Quando a sessão ou o dia virarem, busca o novo estado.
 useEffect(()=>{if(!limits)return;const next=[limits.window.resetsAt,limits.daily.resetsAt].map(v=>v?Date.parse(v):NaN).filter(v=>Number.isFinite(v)&&v<=now);if(next.length)load();},[limits,now,load]);
 return {limits,now};
}

function Bar({label,percent,detail}:{label:string;percent:number;detail:string}){
 return <div className={`usage-row ${tone(percent)}`}>
  <div className="usage-row-head"><b>{label}</b><span>{percent}% usado</span></div>
  <div className="usage-bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><i style={{width:`${percent}%`}}/></div>
  <small>{detail}</small>
 </div>;
}

/** Versão completa (tela Uso da IA): sessão de 5h e limite diário. */
export function UsageMeter(){
 const {limits,now}=useChatLimits();const {demo,role}=useWorkspace();
 if(demo)return <div className="usage-meter card"><p className="usage-note">Na demonstração a IA não é chamada e não há consumo.</p></div>;
 if(role==='seller')return null;
 if(!limits)return <div className="usage-meter card"><p className="usage-note">Carregando seus limites… Se não aparecer, a migração de limites ainda não foi aplicada no Supabase.</p></div>;
 const w=limits.window,d=limits.daily;
 return <div className="usage-meter card">
  <div className="usage-meter-head"><b>Seus limites do chat de IA</b><small>Assistente da tela inicial e Playground</small></div>
  <Bar label={`Sessão atual (${limits.windowHours} horas)`} percent={w.percent} detail={w.resetsAt?`Reinicia ${until(w.resetsAt,now)} · às ${clock(w.resetsAt)}`:`Começa na sua próxima mensagem e dura ${limits.windowHours} horas`}/>
  <Bar label="Limite diário" percent={d.percent} detail={`Reinicia ${until(d.resetsAt,now)} · à meia-noite`}/>
  <p className="usage-note">O atendimento automático (SDR IA) no WhatsApp, widget, e-mail e Instagram <b>não tem limite</b> e não consome estes valores.</p>
 </div>;
}

/** Versão compacta (abaixo do campo de mensagem). */
export function UsageInline({className=''}:{className?:string}){
 const {limits,now}=useChatLimits();
 if(!limits)return null;
 const w=limits.window,d=limits.daily,p=Math.max(w.percent,d.percent);
 const text=limits.blocked==='daily'?`Limite diário atingido · volta ${until(d.resetsAt,now)}`:limits.blocked==='window'?`Sessão de ${limits.windowHours}h esgotada · volta ${until(w.resetsAt,now)} (${clock(w.resetsAt)})`
  :w.resetsAt?`Sessão: ${w.percent}% usada · reinicia ${until(w.resetsAt,now)}`:`Sessão de ${limits.windowHours}h: começa na próxima mensagem`;
 return <a className={`usage-inline ${tone(p)} ${className}`} href="#usage" title={`Diário: ${d.percent}% usado`}>
  <span className="usage-inline-bar" aria-hidden="true"><i style={{width:`${w.resetsAt?w.percent:0}%`}}/></span><span>{text}</span>
 </a>;
}
