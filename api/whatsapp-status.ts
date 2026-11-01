import {access,safeError} from '../server/access.js';
import {whatsappDiagnosis} from '../server/whatsapp-settings.js';
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

export default async function handler(req:VercelRequest,res:VercelResponse){res.setHeader('Cache-Control','private, no-store');if(req.method!=='GET')return res.status(405).json({error:'Use GET.'});try{return res.status(200).json(await whatsappDiagnosis(await access(req)));}catch(e){const safe=safeError(e);return res.status(safe.status).json({error:safe.error});}}
