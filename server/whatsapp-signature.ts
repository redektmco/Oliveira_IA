/** WhatsApp markers would break the bold signature; keep a short, single-line name. */
export function cleanSignature(name:string){return String(name||'').replace(/[*_~`\r\n]/g,' ').replace(/\s+/g,' ').trim().slice(0,60);}
/** "*Felipe:* Bom dia" — idempotent, so a retried job is never signed twice. */
export function signWhatsApp(name:string,message:string){const clean=cleanSignature(name);if(!clean)return message;const prefix=`*${clean}:*`;return message.startsWith(prefix)?message:`${prefix} ${message}`;}
