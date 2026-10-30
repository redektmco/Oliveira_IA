import type { VercelRequest, VercelResponse } from '@vercel/node';
import { configPresence } from '../server/supabase.js';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Use GET para consultar a configuração.' });
  }
  const configured = configPresence();
  return res.status(200).json({
    status: Object.values(configured).every(Boolean) ? 'configured' : 'configuration_required',
    configured,
    // This reports names/presence, never a successful live provider call.
    verified: false,
    channels: { web: true, whatsapp: Boolean(process.env.WHATSAPP_WEBHOOK_SECRET && process.env.WHATSAPP_WORKER_SECRET && process.env.WHATSAPP_OWNER_USER_ID) },
  });
}
