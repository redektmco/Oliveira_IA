import {isIP} from 'node:net';
import {HttpError} from './validation.js';
import {defaultSettings,type WorkspaceSettings} from '../src/lib/settings-types.js';
export function validateSection(section:string,raw:unknown):Record<string,any>{
 const defaults=defaultSettings();if(!Object.hasOwn(defaults,section)||!raw||typeof raw!=='object'||Array.isArray(raw))throw new HttpError(400,'Configuração inválida.');
 const value=raw as Record<string,any>,base=defaults[section as keyof WorkspaceSettings];
 if(Object.keys(value).some(k=>!Object.hasOwn(base,k)))throw new HttpError(400,'Configuração contém campos desconhecidos.');
 const out={...base,...value} as Record<string,any>;
 for(const [key,fallback]of Object.entries(base)){
  if(Array.isArray(fallback)){if(!Array.isArray(out[key])||out[key].length>50||out[key].some((x:any)=>typeof x!=='string'||x.length>250))throw new HttpError(400,'Lista de configurações inválida.');}
  else if(key==='schedule'){
   const s=out[key];if(!s||typeof s!=='object'||Object.keys(s).some(k=>!['enabled','days','start','end'].includes(k))||typeof s.enabled!=='boolean'||!Array.isArray(s.days)||!s.days.length||s.days.some((d:any)=>!Number.isInteger(d)||d<0||d>6)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.end)||s.start>=s.end)throw new HttpError(400,'Escolha dias e um horário final posterior ao inicial.');
  }else if(typeof out[key]!==typeof fallback)throw new HttpError(400,'Tipo de configuração inválido.');
  if(typeof out[key]==='string'&&out[key].length>(key==='logo'?2800000:key==='signature'||key==='greeting'?4000:250))throw new HttpError(400,'Um campo excede o tamanho permitido.');
 }
 if(section==='general'){
  if(!out.name.trim())throw new HttpError(400,'Informe o nome do workspace.');
  try{new Intl.DateTimeFormat('pt-BR',{timeZone:out.timezone});}catch{throw new HttpError(400,'Fuso horário inválido.');}
  if(!['pt-BR','en','es'].includes(out.language))throw new HttpError(400,'Idioma inválido.');
  if(out.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email))throw new HttpError(400,'E-mail inválido.');
  if(out.logo&&!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(out.logo))throw new HttpError(400,'Envie um logo PNG, JPEG ou WebP.');
 }
 if(section==='whatsapp'&&(!Number.isInteger(out.typingMin)||!Number.isInteger(out.typingMax)||out.typingMin<0||out.typingMax<out.typingMin||out.typingMax>12))throw new HttpError(400,'Tempo de digitação deve ficar entre 0 e 12 segundos.');
 if(section==='email'&&(!Number.isInteger(out.dailyLimit)||out.dailyLimit<1||out.dailyLimit>1000||/[\r\n]/.test(out.senderName+out.replyTo)||out.replyTo&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.replyTo)))throw new HttpError(400,'Confira o remetente, e-mail de resposta e limite diário (1 a 1000).');
 if(section==='widget'){
  if(!/^#[a-f0-9]{6}$/i.test(out.color)||!['right','left'].includes(out.position))throw new HttpError(400,'Cor ou posição inválida.');
  out.domains=out.domains.map((s:string)=>{try{const u=new URL(s);if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw new Error();return u.origin;}catch{throw new HttpError(400,'Informe origens HTTPS completas, por exemplo https://suaempresa.com.br.');}});
  if(out.enabled&&(!out.domains.length||!out.agentId))throw new HttpError(400,'Escolha um agente e pelo menos um domínio antes de ativar o widget.');
 }
 if(section==='security'){
  if(![1,7,30].includes(out.sessionDays)||![0,3,6,12,24].includes(out.retentionMonths))throw new HttpError(400,'Período inválido.');
  if(out.allowedIps.some((rule:string)=>{const [ip,bits,...rest]=rule.split('/');return !isIP(ip)||rest.length>0||(bits!==undefined&&(isIP(ip)!==4||!/^\d{1,2}$/.test(bits)||Number(bits)>32));}))throw new HttpError(400,'Use IPs válidos ou intervalos IPv4/CIDR.');
 }
 if(section==='scheduling'&&(![15,30,45,60,90].includes(out.duration)||!Number.isInteger(out.minNoticeHours)||out.minNoticeHours<0||out.minNoticeHours>72||!Number.isInteger(out.horizonDays)||out.horizonDays<1||out.horizonDays>30))throw new HttpError(400,'Confira duração (15 a 90 min), antecedência (0 a 72 h) e janela (1 a 30 dias).');
 return out;
}
