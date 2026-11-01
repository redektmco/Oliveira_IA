import type { VercelRequest, VercelResponse } from '@vercel/node';
import {access,contactAccess} from '../server/access.js';
import {applySalesAutomation,schedulingContext,syncDealAfterTurn,type SchedulingContext} from '../server/sales-automation.js';
import { createClaude } from '../server/anthropic.js';
import { executeChat } from '../server/chat.js';
import { createRepository, serverConfig } from '../server/supabase.js';
import { HttpError, parseBearerToken, parseChatInput, publicError } from '../server/validation.js';

export const config = { maxDuration: 60 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Use POST para enviar uma mensagem.' });
  }
  try {
    const token = parseBearerToken(req.headers.authorization);
    const contentType = req.headers['content-type'];
    if (typeof contentType !== 'string' || !/^application\/json(?:\s*;|$)/i.test(contentType)) {
      throw new HttpError(415, 'Use Content-Type: application/json.');
    }
    const input = parseChatInput(req.body);
    const scope = await access(req);
    if(scope.role==='seller'&&!input.conversationId)throw new HttpError(403,'Vendedores usam a IA nas conversas atribuídas.');
    const settings = serverConfig();
    const repository=createRepository(settings);
    repository.authenticate=async()=>({id:scope.ownerId});
    const conversation=repository.conversation.bind(repository);
    repository.conversation=async(owner,id)=>{const cv=await conversation(owner,id);if(cv&&scope.role==='seller'&&!cv.contact_id)throw new HttpError(404,'Conversa não encontrada ou sem acesso.');if(cv?.contact_id)await contactAccess(scope,cv.contact_id);return cv;};
    const answer = await executeChat(input, token, {
      repository,
      claude: createClaude(settings.anthropicKey),
      configuredModel: settings.configuredModel,
      dailyRequestLimit: settings.dailyRequestLimit,
      language:scope.settings.general.language,
      automation:{
        context:contact=>schedulingContext(scope.db,scope.ownerId,contact,scope.settings.scheduling,scope.settings.general.timezone),
        apply:(contact,parsed,context)=>applySalesAutomation(scope.db,{owner:scope.ownerId,contact,triage:parsed.triage,meeting:parsed.meeting,reply:parsed.reply,scheduling:context as SchedulingContext|null,settings:scope.settings.scheduling}),
        sync:(contact,triage,booked)=>syncDealAfterTurn(scope.db,scope.ownerId,contact,triage,booked,scope.settings.scheduling),
      },
    });
    return res.status(200).json(answer);
  } catch (error) {
    const safe = publicError(error);
    if (safe.status === 429) res.setHeader('Retry-After', '60');
    return res.status(safe.status).json({ error: safe.error });
  }
}
