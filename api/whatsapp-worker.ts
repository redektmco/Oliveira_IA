import type {VercelRequest,VercelResponse} from '@vercel/node';
import {waitUntil} from '@vercel/functions';
import {secretMatches} from '../server/whatsapp-events.js';
import {kickWorkflows,runAutomations,runWorkflowQueue} from '../server/automations.js';
import {backgroundWorker} from '../server/whatsapp-bridge.js';
export const config={maxDuration:60};
export default async function handler(req:VercelRequest,res:VercelResponse){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'Use POST.'});
 if(!secretMatches(req.headers.authorization,process.env.WHATSAPP_WORKER_SECRET?`Bearer ${process.env.WHATSAPP_WORKER_SECRET}`:undefined))return res.status(401).json({error:'Acesso não autorizado.'});
 // Mensagens recebidas viram eventos de automação; processa logo após a fila do WhatsApp.
 waitUntil(req.query?.workflows==='1'?runWorkflowQueue():req.query?.automation==='1'?runAutomations():backgroundWorker().then(kickWorkflows));return res.status(202).json({accepted:true});
}
