import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {defaultChatBudgets,limitMessage,toStatus,type ChatPolicy} from '../server/ai-limits.ts';
import {isPlatformAdmin} from '../server/access.ts';
import {platformAction} from '../server/platform.ts';

const OWNER='10000000-0000-4000-8000-000000000001',USER='10000000-0000-4000-8000-000000000002',OTHER='10000000-0000-4000-8000-000000000003';

test('chat limit: 5h window and daily cap per person, SDR without limit', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claims',true)::jsonb->>'sub','')::uuid$$;create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb->>'role'$$;grant usage on schema auth,public to anon,authenticated,service_role;`);
    const files = (await readdir(new URL('../supabase/migrations/', import.meta.url))).filter(f => f.endsWith('.sql')).sort();
    for (const file of files) await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
    // Re-applying the new migration keeps data and functions.
    await db.exec(await readFile(new URL('../supabase/migrations/202611070010_platform_limits.sql', import.meta.url), 'utf8'));
    await db.exec(`insert into auth.users values('${OWNER}','owner@cliente.com'),('${USER}','pessoa@cliente.com'),('${OTHER}','outra@cliente.com')`);
    const as = async (role: string, sub = USER) => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({sub, role})]); if (role !== 'postgres') await db.exec(`set role ${role}`); };
    const reserve = (kind: string, actor: string | null = USER, window = 100_000, daily = 250_000) =>
      db.query<{id: string}>(`select public.reserve_ai_usage($1,'claude-haiku-4-5',$2,$3,$4,$5,'America/Sao_Paulo') as id`, [OWNER, kind, actor, window, daily]).then(r => r.rows[0].id);
    const complete = (id: string, input: number, output: number) => db.query(`update public.ai_usage set status='completed',input_tokens=$2,output_tokens=$3 where id=$1`, [id, input, output]);

    await as('authenticated');
    await assert.rejects(reserve('chat'), /SERVICE_ROLE_REQUIRED|permission denied/, 'clients cannot reserve');
    await as('service_role');
    // Cost: Haiku 1 µ$/input token and 5 µ$/output token.
    const first = await reserve('chat');
    await complete(first, 50_000, 6_000); // 80.000 µ$ = 80% of the window
    const usage = (await db.query<{u: any}>(`select public.ai_chat_usage($1,$2,'America/Sao_Paulo') as u`, [OWNER, USER])).rows[0].u;
    assert.equal(Number(usage.window_used), 80_000);
    assert.ok(usage.window_start && usage.window_end, 'first message starts the 5h window');
    const policy: ChatPolicy = {kind: 'chat', actorId: USER, windowMicros: 100_000, dailyMicros: 250_000, timezone: 'America/Sao_Paulo'};
    const status = toStatus(usage, policy);
    assert.equal(status.window.percent, 80);
    assert.equal(status.daily.percent, 32);
    assert.equal(status.blocked, null);

    const second = await reserve('chat');
    await complete(second, 20_000, 1_000); // 105.000 µ$ in this window
    await assert.rejects(reserve('chat'), /AI_CHAT_WINDOW_LIMIT/, 'window exhausted');
    // Another person in the same workspace has an independent window.
    await complete(await reserve('chat', OTHER), 10, 10);
    // SDR, automations and summaries are never blocked and carry no actor.
    for (let i = 0; i < 5; i++) await complete(await reserve('sdr', null), 1_000_000, 100_000);
    const sdr = await db.query<{kind: string; actor_id: string | null}>(`select kind,actor_id from public.ai_usage where kind='sdr' limit 1`);
    assert.deepEqual(sdr.rows[0], {kind: 'sdr', actor_id: null});

    // After 5 hours the next message opens a new window, while the daily total keeps counting.
    await db.exec(`update public.ai_chat_windows set started_at=now()-interval '5 hours 1 minute' where actor_id='${USER}'`);
    await db.exec(`update public.ai_usage set created_at=now()-interval '5 hours 2 minutes' where actor_id='${USER}'`);
    const third = await reserve('chat');
    await complete(third, 100_000, 30_000); // 250.000 µ$ in the new window
    await assert.rejects(reserve('chat'), /AI_CHAT_(DAILY|WINDOW)_LIMIT/);
    // Two requests in flight at once are refused.
    await db.exec(`update public.ai_chat_windows set started_at=now() where actor_id='${OTHER}'`);
    await reserve('chat', OTHER); await reserve('chat', OTHER);
    await assert.rejects(reserve('chat', OTHER), /AI_CHAT_BUSY/);
    await assert.rejects(reserve('chat', null), /INVALID_AI_RESERVATION/, 'chat requires the person');
    // Haiku 5.5: US$ 0,10/0,50 por milhão até 100 mil tokens de entrada; 0,50/2,50 acima.
    const h55 = (await db.query<{id: string}>(`select public.reserve_ai_usage($1,'claude-haiku-5-5','sdr') as id`, [OWNER])).rows[0].id;
    await complete(h55, 50_000, 10_000);
    assert.equal(Number((await db.query<{c: string}>(`select cost_micros as c from public.ai_usage where id=$1`, [h55])).rows[0].c), 10_000);
    await complete(h55, 200_000, 10_000);
    assert.equal(Number((await db.query<{c: string}>(`select cost_micros as c from public.ai_usage where id=$1`, [h55])).rows[0].c), 125_000);
    await db.exec(`update public.agents set model=model`);
    await assert.rejects(db.query(`select public.reserve_ai_usage($1,'claude-opus-4-6','sdr')`, [OWNER]), /INVALID_AI_MODEL/);

    // Hidden members exist and platform tables are server-only.
    await db.exec(`insert into public.workspace_members(owner_id,user_id,email,role,status,hidden) values('${OWNER}','${OTHER}','agencia@v4.com','admin','active',true)`);
    await as('authenticated', OWNER);
    await assert.rejects(db.query('select * from public.platform_workspaces'), 'platform rows are not exposed to clients');
    await assert.rejects(db.query('select * from public.ai_chat_windows'));
  } finally { await db.close(); }
});

test('limit status, messages and budgets', () => {
  const policy: ChatPolicy = {kind: 'chat', actorId: USER, windowMicros: 1_000_000, dailyMicros: 3_000_000, timezone: 'America/Sao_Paulo'};
  const idle = toStatus({window_start: null, window_end: null, window_used: 0, day_used: 0, day_end: '2026-11-02T03:00:00Z', pending: 0}, policy);
  assert.deepEqual([idle.window.percent, idle.window.resetsAt, idle.blocked], [0, null, null]);
  const full = toStatus({window_start: '2026-11-01T12:00:00Z', window_end: '2026-11-01T17:00:00Z', window_used: 1_200_000, day_used: 1_200_000, day_end: '2026-11-02T03:00:00Z', pending: 0}, policy);
  assert.deepEqual([full.window.percent, full.daily.percent, full.blocked], [100, 40, 'window']);
  assert.match(limitMessage('AI_CHAT_WINDOW_LIMIT', full, 'America/Sao_Paulo'), /100% da sua sessão de 5 horas.*às 14:00/);
  assert.match(limitMessage('AI_CHAT_DAILY_LIMIT', full, 'America/Sao_Paulo'), /limite diário.*amanhã às 00:00/);
  assert.deepEqual(defaultChatBudgets({}), {windowMicros: 100_000, dailyMicros: 300_000});
  assert.deepEqual(defaultChatBudgets({AI_CHAT_WINDOW_USD: '0.5', AI_CHAT_DAILY_USD: 'abc'}), {windowMicros: 500_000, dailyMicros: 300_000});
});

test('only confirmed agency e-mails are platform admins', async () => {
  const env = {PLATFORM_ADMIN_EMAILS: 'Equipe@Agencia.com, outra@agencia.com'};
  assert.equal(isPlatformAdmin({email: 'equipe@agencia.com', email_confirmed_at: '2026-01-01'}, env), true);
  assert.equal(isPlatformAdmin({email: 'equipe@agencia.com', email_confirmed_at: undefined}, env), false);
  assert.equal(isPlatformAdmin({email: 'cliente@empresa.com', email_confirmed_at: '2026-01-01'}, env), false);
  assert.equal(isPlatformAdmin({email: 'equipe@agencia.com', email_confirmed_at: '2026-01-01'}, {}), false);
  // A client (not in the list) cannot use any agency action.
  await assert.rejects(platformAction({platformAdmin: false} as any, {action: 'platform.list'}), /equipe da agência/);
});

test('agency creates an isolated client workspace and joins it hidden', async () => {
  process.env.APP_ORIGIN = 'https://ai.example.com';
  const writes: {table: string; op: string; row: any}[] = [];
  const invites: any[] = [];
  const table = (name: string) => ({
    upsert: (row: any) => { writes.push({table: name, op: 'upsert', row}); return Promise.resolve({error: null}); },
    insert: (row: any) => { writes.push({table: name, op: 'insert', row}); return Promise.resolve({error: null}); },
  });
  const db = {
    from: table,
    auth: {admin: {
      inviteUserByEmail: async (email: string, options: any) => { invites.push({email, options}); return {data: {user: {id: OTHER}}, error: null}; },
      listUsers: async () => ({data: {users: []}, error: null}),
    }},
  };
  const a = {db, user: {id: OWNER, email: 'equipe@agencia.com'}, ownerId: OWNER, role: 'admin', platformAdmin: true} as any;
  const result = await platformAction(a, {action: 'platform.create', name: 'Clínica Sorriso', email: 'Dono@Clinica.com', contactName: 'Ana'});
  assert.deepEqual(result, {ownerId: OTHER, emailSent: true, url: null});
  assert.equal(invites[0].email, 'dono@clinica.com');
  assert.equal(invites[0].options.redirectTo, 'https://ai.example.com/app');
  const settings = writes.find(w => w.table === 'workspace_settings')!.row;
  assert.equal(settings.user_id, OTHER);
  assert.equal(settings.config.general.name, 'Clínica Sorriso');
  const member = writes.find(w => w.table === 'workspace_members')!.row;
  assert.deepEqual({owner: member.owner_id, user: member.user_id, role: member.role, hidden: member.hidden, status: member.status}, {owner: OTHER, user: OWNER, role: 'admin', hidden: true, status: 'active'});
  assert.equal(writes.find(w => w.table === 'platform_workspaces')!.row.owner_id, OTHER);
  await assert.rejects(platformAction(a, {action: 'platform.create', name: 'X', email: 'equipe@agencia.com'}), /e-mail do cliente/);
  await assert.rejects(platformAction(a, {action: 'platform.create', name: '', email: 'a@b.com'}), /Preencha/);
});
