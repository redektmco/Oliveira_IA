import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import chat from '../api/chat.js';
import health from '../api/health.js';
import webhook from '../api/whatsapp-webhook.js';
import worker from '../api/whatsapp-worker.js';
import send from '../api/whatsapp-send.js';
import admin from '../api/whatsapp-admin.js';
import whatsappStatus from '../api/whatsapp-status.js';
import { MAX_BODY_BYTES } from './validation.js';

// Credentials stay in a local ignored file and never become Vite public env vars.
// Existing process bindings take priority. .env.local takes priority over .env.
for (const filename of ['.env.local', '.env']) {
  try { process.loadEnvFile(filename); } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
}

async function dispatch(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const response = res as unknown as VercelResponse;
  response.status = function (status: number) { res.statusCode = status; return response; };
  response.json = function (body: unknown) { res.end(JSON.stringify(body)); return response; };
  const path = new URL(req.url || '/', 'http://localhost').pathname;
  if (!['/api/chat', '/api/health', '/api/whatsapp-status','/api/whatsapp-webhook','/api/whatsapp-worker','/api/whatsapp-send','/api/whatsapp-admin'].includes(path)) return response.status(404).json({ error: 'Endpoint não encontrado.' });
  const request = req as VercelRequest;
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) return response.status(413).json({ error: 'O pedido excede o tamanho permitido.' });
    chunks.push(buffer);
  }
  request.body = Buffer.concat(chunks).toString('utf8');
  if (path === '/api/whatsapp-webhook') return webhook(request,response);
  if (path === '/api/whatsapp-worker') return worker(request,response);
  if (path === '/api/whatsapp-send') return send(request,response);
  if (path === '/api/whatsapp-admin') return admin(request,response);
  if (path === '/api/health') return health(request, response);
  if (path === '/api/whatsapp-status') return whatsappStatus(request, response);
  return chat(request, response);
}

const port = Number(process.env.API_PORT || 3001);
createServer((req, res) => {
  dispatch(req, res).catch(() => {
    if (!res.headersSent) { res.statusCode = 500; res.setHeader('Content-Type', 'application/json'); }
    if (!res.writableEnded) res.end(JSON.stringify({ error: 'Erro interno do servidor local.' }));
  });
}).listen(port, '127.0.0.1', () => console.log(`API local iniciada na porta ${port}.`));
