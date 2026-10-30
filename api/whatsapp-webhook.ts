import type {VercelRequest,VercelResponse} from '@vercel/node';
import {waitUntil} from '@vercel/functions';
import {parseWhatsAppEvent,secretMatches} from '../server/whatsapp-events.js';
import {ingestWhatsApp,backgroundWorker} from '../server/whatsapp-bridge.js';
export const config={maxDuration:60};
export default async function handler(req:VercelRequest,res:VercelResponse){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'Use POST.'});
 if(!secretMatches(req.headers['x-oliveira-webhook-secret'],process.env.WHATSAPP_WEBHOOK_SECRET))return res.status(401).json({error:'Webhook não autorizado.'});
 if(typeof req.headers['content-type']!=='string'||!/^application\/json(?:;|$)/i.test(req.headers['content-type']))return res.status(415).json({error:'Envie JSON.'});
 const event=parseWhatsAppEvent(req.body,process.env.WHATSAPP_EVO_INSTANCE||'');
 if(!event)return res.status(200).json({ignored:true});
 try{const result=await ingestWhatsApp(event);if(result.queued)waitUntil(backgroundWorker());return res.status(200).json({accepted:true,duplicate:Boolean(result.duplicate)});}
 catch{return res.status(503).json({error:'Não foi possível guardar o evento; tente novamente.'});}
}
