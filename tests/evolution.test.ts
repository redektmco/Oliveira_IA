import test from 'node:test';
import assert from 'node:assert/strict';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { evolutionConfig, readEvolutionStatus } from '../server/evolution.js';
import { HttpError } from '../server/validation.js';
import { createStatusHandler } from '../api/whatsapp-status.js';

const env = { WHATSAPP_EVO_URL: 'https://evo.example.com', WHATSAPP_EVO_INSTANCE: 'V4', WHATSAPP_TOKEN_EVO: 'private-test-value' };
const httpError = (status: number) => (e: unknown) => e instanceof HttpError && e.status === status;

test('Evolution configuration accepts the deployed alias and rejects unsafe destinations or missing configuration', () => {
  assert.equal(evolutionConfig(env).endpoint, 'https://evo.example.com/instance/connectionState/V4');
  assert.equal(evolutionConfig({...env, WHATSAPP_EVO_TOKEN: 'canonical-test-value'}).token, 'canonical-test-value');
  assert.equal(evolutionConfig({...env, WHATSAPP_EVO_URL: 'https://evo.example.com/api/'}).endpoint, 'https://evo.example.com/api/instance/connectionState/V4');
  for (const base of ['http://evo.example.com', 'https://user:password@evo.example.com', 'https://evo.example.com?token=secret', 'https://evo.example.com#secret', 'invalid']) {
    assert.throws(() => evolutionConfig({...env, WHATSAPP_EVO_URL: base}), httpError(503));
  }
  assert.throws(() => evolutionConfig({}), httpError(503));
  assert.throws(() => evolutionConfig({...env, WHATSAPP_EVO_INSTANCE: '../another-instance'}), httpError(503));
});

test('Evolution status only reads the configured instance and never returns provider credentials or phone data', async () => {
  for (const state of ['open', 'close', 'connecting'] as const) {
    const status = await readEvolutionStatus(evolutionConfig(env), async (input, options) => {
      assert.equal(input, 'https://evo.example.com/instance/connectionState/V4');
      assert.equal(options?.method, 'GET');
      assert.equal(options?.redirect, 'error');
      assert.equal(new Headers(options?.headers).get('apikey'), env.WHATSAPP_TOKEN_EVO);
      assert.ok(options?.signal);
      assert.equal(options?.body, undefined);
      return new Response(JSON.stringify({instance:{state, ownerJid:'private-phone', apikey:env.WHATSAPP_TOKEN_EVO}, token:env.WHATSAPP_TOKEN_EVO}));
    });
    assert.deepEqual(status, {provider:'evolution',instance:'V4',state,connected:state === 'open',messagingEnabled:false});
    assert.equal(JSON.stringify(status).includes(env.WHATSAPP_TOKEN_EVO), false);
    assert.equal(JSON.stringify(status).includes('private-phone'), false);
  }
});

test('Evolution upstream failures expose static guidance and never copy upstream bodies', async () => {
  for (const status of [401,403,404,429,500]) {
    await assert.rejects(readEvolutionStatus(evolutionConfig(env), async () => new Response(env.WHATSAPP_TOKEN_EVO,{status})), error => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.status, 502);
      assert.equal(error.message.includes(env.WHATSAPP_TOKEN_EVO), false);
      return true;
    });
  }
});

test('Evolution resolves only one case variation of the configured instance and keeps other instance data private', async () => {
  const calls: string[] = [];
  let deadline: AbortSignal | null | undefined;
  const status = await readEvolutionStatus(evolutionConfig(env), async (input, options) => {
    const url = String(input); calls.push(url);
    assert.equal(options?.method, 'GET');
    assert.equal(options?.redirect, 'error');
    if (!deadline) deadline = options?.signal;
    assert.equal(options?.signal, deadline);
    if (url.endsWith('/connectionState/V4')) return new Response('{}', {status:404});
    if (url.endsWith('/fetchInstances')) return new Response(JSON.stringify([{name:'another-client',ownerJid:'private-phone',token:env.WHATSAPP_TOKEN_EVO},{name:'v4',token:env.WHATSAPP_TOKEN_EVO}]));
    assert.ok(url.endsWith('/connectionState/v4'));
    return new Response(JSON.stringify({instance:{state:'open'}}));
  });
  assert.equal(status.instance,'v4');
  assert.equal(status.connected,true);
  assert.equal(calls.length,3);
  assert.equal(JSON.stringify(status).includes('another-client'),false);
  assert.equal(JSON.stringify(status).includes(env.WHATSAPP_TOKEN_EVO),false);
});

test('Evolution discovery does not select an unrelated instance or expose its identity', async () => {
  let calls=0;
  await assert.rejects(readEvolutionStatus(evolutionConfig(env), async input => {
    calls++;
    return String(input).endsWith('/fetchInstances') ? new Response(JSON.stringify([{name:'private-other-client'}])) : new Response('{}',{status:404});
  }), error => {
    assert.ok(error instanceof HttpError);
    assert.match(error.message,/chave foi aceita/i);
    assert.equal(error.message.includes('private-other-client'),false);
    return true;
  });
  assert.equal(calls,2);
});

test('Evolution redirects, network failures and unexpected responses cannot produce a connected result', async () => {
  const responses: Array<() => Promise<Response>> = [
    async () => {throw new Error(`request failed: ${env.WHATSAPP_TOKEN_EVO}`);},
    async () => new Response('<html>Login</html>'),
    async () => new Response(JSON.stringify({instance:{state:'unknown'}})),
    async () => new Response(null,{status:302,headers:{location:'https://another.example.com'}}),
  ];
  for (const fetcher of responses) {
    await assert.rejects(readEvolutionStatus(evolutionConfig(env),fetcher), error => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.status,502);
      assert.equal(error.message.includes(env.WHATSAPP_TOKEN_EVO),false);
      return true;
    });
  }
});

function response() {
  const result: {status:number;body?:unknown;headers:Record<string,string>} = {status:200,headers:{}};
  const res = {
    setHeader(name:string,value:string) {result.headers[name]=value;return res;},
    status(status:number) {result.status=status;return res;},
    json(body:unknown) {result.body=body;return res;},
  } as unknown as VercelResponse;
  return {res,result};
}

test('Evolution HTTP status requires a valid session before contacting the provider', async () => {
  let authCalls=0, providerCalls=0;
  const handler=createStatusHandler({authenticate:async () => {authCalls++;throw new HttpError(401,'Sessão expirada.');},status:async () => {providerCalls++;throw new Error('must not run');}});
  const missing=response();
  await handler({method:'GET',headers:{}} as VercelRequest,missing.res);
  assert.equal(missing.result.status,401);
  assert.equal(authCalls,0);
  const expired=response();
  await handler({method:'GET',headers:{authorization:'Bearer valid-format'}} as VercelRequest,expired.res);
  assert.equal(expired.result.status,401);
  assert.equal(authCalls,1);
  const wrongMethod=response();
  await handler({method:'POST',headers:{authorization:'Bearer valid-format'}} as VercelRequest,wrongMethod.res);
  assert.equal(wrongMethod.result.status,405);
  assert.equal(wrongMethod.result.headers.Allow,'GET');
  assert.equal(authCalls,1);
  assert.equal(providerCalls,0);
});

test('Evolution authenticated status is private, read only and does not enable messaging', async () => {
  const calls:string[]=[];
  const handler=createStatusHandler({authenticate:async token => {assert.equal(token,'valid-format');calls.push('auth');},status:async () => {calls.push('status');return {provider:'evolution',instance:'V4',state:'open',connected:true,messagingEnabled:false};}});
  const {res,result}=response();
  await handler({method:'GET',headers:{authorization:'Bearer valid-format'}} as VercelRequest,res);
  assert.deepEqual(calls,['auth','status']);
  assert.equal(result.status,200);
  assert.equal(result.headers['Cache-Control'],'private, no-store');
  assert.deepEqual(result.body,{provider:'evolution',instance:'V4',state:'open',connected:true,messagingEnabled:false});
});
