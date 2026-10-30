import type {VercelRequest,VercelResponse} from '@vercel/node';
import {waitUntil} from '@vercel/functions';
import {bridgeRpc,bridgeDb,backgroundWorker} from '../server/whatsapp-bridge.js';
import {createRepository,serverConfig} from '../server/supabase.js';
import {parseBearerToken,HttpError} from '../server/validation.js';
export const config={maxDuration:60};
export default async function handler(req:VercelRequest,res:VercelResponse){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='POST')return res.status(405).json({error:'Use POST.'});
 try{
  const token=parseBearerToken(req.headers.authorization);
  const user=await createRepository(serverConfig()).authenticate(token);
  let body=req.body;if(typeof body==='string')body=JSON.parse(body);
  const uuid=/^[0-9a-f-]{36}$/i;
  if(!body||typeof body.text!=='string'||!body.text.trim()||body.text.length>4000||!uuid.test(body.conversationId)||!uuid.test(body.requestId))throw new HttpError(400,'Informe conversa, texto e identificador válidos.');
  const conversation=await bridgeDb().from('conversations').select('id,status').eq('user_id',user.id).eq('id',body.conversationId).eq('channel','whatsapp').maybeSingle();
  if(conversation.error||!conversation.data)throw new HttpError(404,'Conversa WhatsApp não encontrada.');
  if(conversation.data.status!=='human')throw new HttpError(409,'Assuma o atendimento humano antes de enviar.');
  const id=await bridgeRpc('whatsapp_enqueue_human',{p_user:user.id,p_conversation:body.conversationId,p_request:body.requestId,p_text:body.text.trim()});
  waitUntil(backgroundWorker());return res.status(202).json({queued:true,id});
 }catch(e){return res.status(e instanceof HttpError?e.status:400).json({error:e instanceof HttpError?e.message:'Não foi possível enfileirar a resposta.'});}
}
