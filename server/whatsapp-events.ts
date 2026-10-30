import {createHash,timingSafeEqual} from 'node:crypto';
export type IncomingWhatsApp={instance:string;jid:string;eventId:string;text:string;name:string;fromMe:boolean;needsHuman:boolean;eventTime:string};
const record=(v:unknown):v is Record<string,any>=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
export function secretMatches(value:unknown,expected:string|undefined){return typeof value==='string'&&Boolean(expected)&&timingSafeEqual(createHash('sha256').update(value).digest(),createHash('sha256').update(expected||'').digest());}
export function parseWhatsAppEvent(raw:unknown,instance:string):IncomingWhatsApp|null{
 let body=raw;if(typeof body==='string'){try{body=JSON.parse(body);}catch{return null;}}
 if(!record(body)||JSON.stringify(body).length>524288||body.instance!==instance||typeof body.event!=='string'||body.event.toLowerCase().replaceAll('_','.')!=='messages.upsert')return null;
 const data=body.data;if(!record(data)||!record(data.key)||typeof data.key.id!=='string'||data.key.id.length>200||typeof data.key.fromMe!=='boolean')return null;
 const key=data.key;
 const jid=[key.remoteJid,key.remoteJidAlt,data.senderPn].find(v=>typeof v==='string'&&/^\d{8,15}@s\.whatsapp\.net$/.test(v));
 if(!jid||/@g\.us$|broadcast|newsletter/.test(String(key.remoteJid)))return null;
 let message=data.message;
 for(let i=0;i<3&&record(message);i++){
  const nested=message.ephemeralMessage?.message||message.viewOnceMessage?.message||message.viewOnceMessageV2?.message;
  if(!nested)break;message=nested;
 }
 if(!record(message))return null;
 // Protocol edits, reactions and deletions must never start new AI turns.
 if(message.protocolMessage||message.reactionMessage||message.pollUpdateMessage)return null;
 let text=typeof message.conversation==='string'?message.conversation:message.extendedTextMessage?.text;
 let needsHuman=false;
 if(typeof text!=='string'||!text.trim()){
  const media=['audioMessage','imageMessage','videoMessage','documentMessage','stickerMessage','contactMessage','locationMessage'].find(k=>message[k]);
  if(!media)return null;
  const label:Record<string,string>={audioMessage:'Áudio',imageMessage:'Imagem',videoMessage:'Vídeo',documentMessage:'Documento',stickerMessage:'Figurinha',contactMessage:'Contato',locationMessage:'Localização'};
  text=`[${label[media]} recebido pelo WhatsApp. Consulte o aplicativo WhatsApp para abrir o conteúdo.]`;
  needsHuman=true;
 }
 if(text.length>4000){text=text.slice(0,3900)+'\n[Mensagem longa; atendimento humano necessário.]';needsHuman=true;}
 let stamp=record(data.messageTimestamp)?Number(data.messageTimestamp.low>>>0)+Number(data.messageTimestamp.high||0)*4294967296:Number(data.messageTimestamp);if(stamp>1e12)stamp/=1000;
 if(!Number.isFinite(stamp)||stamp<=0)stamp=Date.now()/1000;
 if(stamp*1000>Date.now()+300000)return null;
 return {instance,jid,eventId:key.id,text:text.trim(),name:typeof data.pushName==='string'?data.pushName.slice(0,200):'',fromMe:key.fromMe,needsHuman,eventTime:new Date(stamp*1000).toISOString()};
}
