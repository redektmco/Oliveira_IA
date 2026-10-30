import type { VercelRequest, VercelResponse } from '@vercel/node';
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
    const settings = serverConfig();
    const answer = await executeChat(input, token, {
      repository: createRepository(settings),
      claude: createClaude(settings.anthropicKey),
      configuredModel: settings.configuredModel,
      dailyRequestLimit: settings.dailyRequestLimit,
    });
    return res.status(200).json(answer);
  } catch (error) {
    const safe = publicError(error);
    if (safe.status === 429) res.setHeader('Retry-After', '60');
    return res.status(safe.status).json({ error: safe.error });
  }
}
