import type { VercelRequest, VercelResponse } from '@vercel/node';
import { evolutionConfig, readEvolutionStatus, type EvolutionStatus } from '../server/evolution.js';
import {bridgeDb} from '../server/whatsapp-bridge.js';
import { createRepository, serverConfig } from '../server/supabase.js';
import { HttpError, parseBearerToken } from '../server/validation.js';

export const config = { maxDuration: 30 };

export function createStatusHandler(deps: {
  authenticate: (token: string) => Promise<unknown>;
  status: () => Promise<EvolutionStatus>;
}) {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Use GET para consultar a conexão.' });
    }
    try {
      const token = parseBearerToken(req.headers.authorization);
      await deps.authenticate(token);
      return res.status(200).json(await deps.status());
    } catch (error) {
      return res.status(error instanceof HttpError ? error.status : 502).json({
        error: error instanceof HttpError ? error.message : 'Não foi possível verificar a conexão com a Evolution.',
      });
    }
  };
}

export default createStatusHandler({
  authenticate: async token => {const user=await createRepository(serverConfig()).authenticate(token);if(process.env.WHATSAPP_OWNER_USER_ID && user.id!==process.env.WHATSAPP_OWNER_USER_ID)throw new HttpError(403,'O WhatsApp pertence a outra conta.');return user;},
  status: async () => {const c=evolutionConfig();const status=await readEvolutionStatus(c);const channel=await bridgeDb().from('whatsapp_channels').select('enabled,webhook_verified').eq('instance',c.instance).maybeSingle();return {...status,messagingEnabled:Boolean(channel.data?.enabled&&channel.data?.webhook_verified)};},
});
