import test from 'node:test';
import assert from 'node:assert/strict';
import {whatsappJid} from '../server/channels.js';

test('outbound WhatsApp normalizes Brazilian phones and rejects invalid numbers', () => {
  assert.equal(whatsappJid('(11) 99999-0000'), '5511999990000@s.whatsapp.net');
  assert.equal(whatsappJid('+55 11 3333-4444'), '551133334444@s.whatsapp.net');
  assert.equal(whatsappJid('0044 20 7946 0958'), '442079460958@s.whatsapp.net');
  assert.throws(() => whatsappJid(''), /telefone válido/);
  assert.throws(() => whatsappJid('1234'), /telefone válido/);
});

test('WhatsApp messages are signed with the sender name in bold, once', async () => {
  const {signWhatsApp, cleanSignature} = await import('../server/whatsapp-signature.js');
  assert.equal(signWhatsApp('Felipe', 'Bom dia'), '*Felipe:* Bom dia');
  assert.equal(signWhatsApp('Felipa', 'Olá, sou a Felipa IA!'), '*Felipa:* Olá, sou a Felipa IA!');
  assert.equal(signWhatsApp('Felipe', '*Felipe:* Bom dia'), '*Felipe:* Bom dia', 'retries are not signed twice');
  assert.equal(signWhatsApp('', 'Sem nome'), 'Sem nome');
  assert.equal(cleanSignature('*Ana*\n_Paula_'), 'Ana Paula');
});

test('signed WhatsApp RPCs keep working before the signature migration is applied', async () => {
  const {rpcSigned} = await import('../server/channels.js');
  const calls: Record<string, unknown>[] = [];
  const db = (codes: (string | null)[]) => ({rpc: async (_name: string, args: Record<string, unknown>) => { calls.push(args); const code = codes.shift(); return code ? {data: null, error: {code}} : {data: 'job-1', error: null}; }}) as any;
  assert.equal((await rpcSigned(db([null]), 'whatsapp_enqueue_human', {p_text: 'Oi'}, 'Felipe')).data, 'job-1');
  assert.deepEqual(calls.pop(), {p_text: 'Oi', p_signature: 'Felipe'});
  calls.length = 0;
  assert.equal((await rpcSigned(db(['PGRST202', null]), 'whatsapp_enqueue_human', {p_text: 'Oi'}, 'Felipe')).data, 'job-1');
  assert.deepEqual(calls, [{p_text: 'Oi', p_signature: 'Felipe'}, {p_text: 'Oi'}], 'falls back to the old signature');
  calls.length = 0;
  assert.equal((await rpcSigned(db(['P0001']), 'whatsapp_enqueue_human', {p_text: 'Oi'}, 'Felipe')).error?.code, 'P0001', 'real errors are not retried');
});
