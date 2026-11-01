import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import type {SupabaseClient} from '@supabase/supabase-js';
import {applySalesAutomation,freeSlots,nextStage,schedulingContext,syncDeal,ensureDealForConversation} from '../server/sales-automation.js';
import {parseTriageAnswer} from '../server/triage.js';
import {defaultSettings} from '../src/lib/settings-types.js';
import {validateSection} from '../server/settings-validation.js';
import type {Contact, Triage} from '../src/lib/types.js';

// Minimal in-memory stand-in for the Supabase query builder used by the automation.
function fakeDb(tables: Record<string, any[]>) {
  let seq = 0;
  const from = (table: string) => {
    const rows = (tables[table] ||= []);
    let filters: ((r: any) => boolean)[] = [], op: 'select' | 'insert' | 'update' = 'select', payload: any = null, max = Infinity, sort: [string, boolean] | null = null;
    const run = () => {
      if (op === 'insert') { const row = {id: `id-${++seq}`, created_at: new Date(Date.now() + seq).toISOString(), ...payload}; rows.push(row); return {data: [row], error: null}; }
      let found = rows.filter(r => filters.every(f => f(r)));
      if (op === 'update') { found.forEach(r => Object.assign(r, payload)); return {data: found, error: null}; }
      if (sort) { const [col, asc] = sort; found = [...found].sort((a, b) => (a[col] > b[col] ? 1 : -1) * (asc ? 1 : -1)); }
      return {data: found.slice(0, max), error: null};
    };
    const b: any = {
      select: () => b, insert: (row: any) => { op = 'insert'; payload = row; return b; }, update: (patch: any) => { op = 'update'; payload = patch; return b; },
      eq: (c: string, v: any) => { filters.push(r => r[c] === v); return b; }, in: (c: string, v: any[]) => { filters.push(r => v.includes(r[c])); return b; },
      gte: (c: string, v: any) => { filters.push(r => r[c] >= v); return b; }, lte: (c: string, v: any) => { filters.push(r => r[c] <= v); return b; },
      order: (c: string, o: {ascending: boolean}) => { sort = [c, o.ascending]; return b; }, limit: (n: number) => { max = n; return b; },
      maybeSingle: async () => { const r = run(); return {data: r.data[0] ?? null, error: null}; }, single: async () => { const r = run(); return r.data[0] ? {data: r.data[0], error: null} : {data: null, error: {message: 'none'}}; },
      then: (resolve: any, reject: any) => Promise.resolve(run()).then(resolve, reject),
    };
    return b;
  };
  return {from} as unknown as SupabaseClient;
}

const owner = 'owner-1';
const contact = {id: 'c1', name: 'Ana', company: 'Acme', email: 'ana@acme.com', assigned_to: null} as unknown as Contact;
const triage = (status: Triage['status']): Triage => ({summary: 's', next_action: 'n', score: 80, status, criteria: {budget: {score: 80, evidence: 'e'}, need: {score: 80, evidence: 'e'}, authority: {score: 80, evidence: 'e'}, timing: {score: 80, evidence: 'e'}}});
// Sunday 2026-11-01 12:00 in São Paulo (UTC-3).
const sunday = new Date('2026-11-01T15:00:00.000Z');

test('pipeline stage only moves forward and never overrides proposal, won or lost', () => {
  assert.equal(nextStage(null, null, false), 'new');
  assert.equal(nextStage('new', 'qualifying', false), 'qualifying');
  assert.equal(nextStage('qualifying', 'qualified', false), 'qualified');
  assert.equal(nextStage('qualified', 'qualifying', false), null);
  assert.equal(nextStage('qualified', 'qualified', true), 'meeting');
  for (const closed of ['proposal', 'won', 'lost'] as const) assert.equal(nextStage(closed, 'qualified', true), null);
});

test('free slots respect working hours, notice, busy time and spread at most three per day', () => {
  const settings = defaultSettings().scheduling;
  const slots = freeSlots(settings, 'America/Sao_Paulo', [], sunday);
  assert.equal(slots[0].toISOString(), '2026-11-02T12:00:00.000Z', 'first slot is Monday 09:00 in São Paulo');
  const perDay = new Map<string, number>();
  for (const s of slots) { const day = s.toISOString().slice(0, 10); perDay.set(day, (perDay.get(day) ?? 0) + 1); const hour = (s.getUTCHours() + 21) % 24; assert.ok(hour >= 9 && hour < 18); }
  assert.ok([...perDay.values()].every(n => n <= 3));
  const busy = freeSlots(settings, 'America/Sao_Paulo', [{start: Date.parse('2026-11-02T12:00:00Z'), end: Date.parse('2026-11-02T13:30:00Z')}], sunday);
  assert.equal(busy[0].toISOString(), '2026-11-02T13:30:00.000Z');
  const soon = freeSlots(settings, 'America/Sao_Paulo', [], new Date('2026-11-02T12:10:00Z'));
  assert.ok(soon[0].getTime() >= Date.parse('2026-11-02T14:10:00Z'), 'minimum notice is respected');
});

test('triage answer carries the confirmed slot and tolerates its absence', () => {
  const base = {reply: 'Ok', triage: {summary: 's', next_action: 'n', disqualified: false, criteria: {budget: {score: null, evidence: 'x'}, need: {score: null, evidence: 'x'}, authority: {score: null, evidence: 'x'}, timing: {score: null, evidence: 'x'}}}};
  assert.equal(parseTriageAnswer(JSON.stringify(base), 70).meeting, null);
  assert.equal(parseTriageAnswer(JSON.stringify({...base, meeting: '2026-11-02T12:00:00.000Z'}), 70).meeting, '2026-11-02T12:00:00.000Z');
});

test('scheduling settings are validated', () => {
  assert.equal(validateSection('scheduling', {...defaultSettings().scheduling, duration: 45}).duration, 45);
  assert.throws(() => validateSection('scheduling', {...defaultSettings().scheduling, duration: 7}));
  assert.throws(() => validateSection('scheduling', {...defaultSettings().scheduling, schedule: {days: [], start: '09:00', end: '18:00', enabled: true}}));
});

test('first message creates one opportunity and triage advances it', async () => {
  const tables: Record<string, any[]> = {conversations: [{id: 'cv1', user_id: owner, contact_id: 'c1'}], contacts: [{id: 'c1', user_id: owner, name: 'Ana', company: 'Acme'}], deals: []};
  const db = fakeDb(tables);
  await ensureDealForConversation(db, 'cv1');
  await ensureDealForConversation(db, 'cv1');
  assert.equal(tables.deals.length, 1);
  assert.deepEqual([tables.deals[0].stage, tables.deals[0].title], ['new', 'Ana · Acme']);
  await syncDeal(db, owner, contact, 'qualified');
  assert.equal(tables.deals[0].stage, 'qualified');
  tables.deals[0].stage = 'won';
  await syncDeal(db, owner, contact, 'qualifying', true);
  assert.equal(tables.deals.length, 1, 'a closed opportunity is not reopened automatically');
  assert.equal(tables.deals[0].stage, 'won');
});

test('AI booking creates the meeting only for an offered free slot and is idempotent', async () => {
  const tables: Record<string, any[]> = {meetings: [], contacts: [{id: 'c1', user_id: owner, assigned_to: null}], calendar_accounts: [], deals: []};
  const db = fakeDb(tables), settings = defaultSettings().scheduling;
  const ctx = await schedulingContext(db, owner, contact, settings, 'America/Sao_Paulo', sunday);
  assert.ok(ctx && ctx.slots.length > 0 && ctx.prompt.includes(ctx.slots[0].id));
  const invented = await applySalesAutomation(db, {owner, contact, triage: triage('qualified'), meeting: '2026-11-02T03:00:00.000Z', reply: 'Confirmado!', scheduling: ctx, settings});
  assert.equal(invented.booked, false);
  assert.match(invented.reply, /não está mais disponível/);
  assert.equal(tables.meetings.length, 0);
  const slot = ctx!.slots[0].id;
  const booked = await applySalesAutomation(db, {owner, contact, triage: triage('qualified'), meeting: slot, reply: 'Perfeito!', scheduling: ctx, settings});
  assert.equal(booked.booked, true);
  assert.match(booked.reply, /Reunião confirmada/);
  assert.equal(tables.meetings.length, 1);
  assert.deepEqual([tables.meetings[0].starts_at, tables.meetings[0].duration, tables.meetings[0].source, tables.meetings[0].contact_id], [slot, 30, 'ai', 'c1']);
  const retry = await applySalesAutomation(db, {owner, contact, triage: triage('qualified'), meeting: slot, reply: 'Perfeito!', scheduling: ctx, settings});
  assert.equal(retry.booked, true);
  assert.equal(tables.meetings.length, 1, 'a retried job does not book twice');
  const other = {...contact, id: 'c2'} as Contact;
  tables.contacts.push({id: 'c2', user_id: owner, assigned_to: null});
  const taken = await applySalesAutomation(db, {owner, contact: other, triage: triage('qualified'), meeting: slot, reply: 'Perfeito!', scheduling: ctx, settings});
  assert.equal(taken.booked, false, 'the SDR cannot be double booked');
  const off = await schedulingContext(db, owner, contact, {...settings, aiBooking: false}, 'America/Sao_Paulo', sunday);
  assert.equal(off, null);
});

test('migration keeps calendars private, accepts scheduling settings and adds channel leads to the pipeline once', async () => {
  const db = new PGlite();
  const ownerId = '10000000-0000-4000-8000-000000000001';
  try {
    await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claims',true)::jsonb->>'sub','')::uuid$$;create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb->>'role'$$;grant usage on schema auth,public to anon,authenticated,service_role;`);
    for (const f of ['202610200001_initial.sql', '202610300002_whatsapp.sql', '202610300003_crm_triage.sql', '202610310003_workspace.sql', '202611010004_sales_automation.sql', '202611010004_sales_automation.sql'])
      await db.exec(await readFile(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8'));
    await db.exec(`insert into auth.users values('${ownerId}','owner@example.com');insert into public.contacts(id,user_id,name,company) values('20000000-0000-4000-8000-000000000001','${ownerId}','Ana','Acme'),('20000000-0000-4000-8000-000000000002','${ownerId}','Bia','');`);
    await db.exec(`insert into public.conversations(user_id,contact_id,channel,status) values('${ownerId}','20000000-0000-4000-8000-000000000001','whatsapp','ai'),('${ownerId}','20000000-0000-4000-8000-000000000001','whatsapp','human'),('${ownerId}','20000000-0000-4000-8000-000000000002','web','ai')`);
    const deals = await db.query<{title: string; stage: string}>('select title,stage from public.deals');
    assert.deepEqual(deals.rows, [{title: 'Ana · Acme', stage: 'new'}], 'one deal for the channel lead, none for internal web tests');
    await db.exec(`insert into public.workspace_settings(user_id,config) values('${ownerId}','{"scheduling":{"createDeals":false}}');insert into public.conversations(user_id,contact_id,channel,status) values('${ownerId}','20000000-0000-4000-8000-000000000002','email','human')`);
    assert.equal((await db.query('select * from public.deals')).rows.length, 1, 'the workspace can disable automatic opportunities');
    await db.exec(`insert into public.meetings(user_id,contact_id,title,starts_at,source) values('${ownerId}','20000000-0000-4000-8000-000000000001','IA','2026-11-02T12:00:00Z','ai')`);
    await assert.rejects(db.exec(`insert into public.meetings(user_id,contact_id,title,starts_at,source) values('${ownerId}','20000000-0000-4000-8000-000000000001','X','2026-11-02T12:00:00Z','robot')`));
    await db.exec(`insert into public.calendar_accounts(owner_id,member_id,email,secret) values('${ownerId}','${ownerId}','owner@example.com','sealed')`);
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({sub: ownerId, role: 'authenticated'})]);
    await db.exec('set role authenticated');
    await assert.rejects(db.exec('select secret from public.calendar_accounts'));
    await assert.rejects(db.query('select public.workspace_save_section($1,$2,$3)', [ownerId, 'scheduling', '{}']));
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({role: 'service_role'})]);
    await db.exec('set role service_role');
    await db.query('select public.workspace_save_section($1,$2,$3)', [ownerId, 'scheduling', JSON.stringify({aiBooking: false})]);
    const saved = await db.query<{config: any}>('select config from public.workspace_settings where user_id=$1', [ownerId]);
    assert.equal(saved.rows[0].config.scheduling.aiBooking, false);
  } finally { await db.close(); }
});
