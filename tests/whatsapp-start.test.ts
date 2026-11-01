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
