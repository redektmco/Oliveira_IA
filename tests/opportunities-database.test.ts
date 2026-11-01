import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('opportunity migration is repeatable, records the timeline and keeps seller scope', async () => {
  const db = new PGlite();
  const owner = '10000000-0000-4000-8000-000000000001', seller = '10000000-0000-4000-8000-000000000003', other = '10000000-0000-4000-8000-000000000004';
  try {
    await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claims',true)::jsonb->>'sub','')::uuid$$;create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb->>'role'$$;grant usage on schema auth,public to anon,authenticated,service_role;`);
    for (const file of ['202610200001_initial.sql', '202610300002_whatsapp.sql', '202610300003_crm_triage.sql', '202610310003_workspace.sql', '202611010004_sales_automation.sql', '202611020005_opportunities.sql']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
    }
    await db.exec(`insert into auth.users values('${owner}','owner@example.com'),('${seller}','seller@example.com'),('${other}','other@example.com');
      insert into public.workspace_members(owner_id,user_id,email,role,status) values('${owner}','${seller}','seller@example.com','seller','active'),('${owner}','${other}','other@example.com','seller','active');
      insert into public.contacts(id,user_id,name) values('20000000-0000-4000-8000-000000000001','${owner}','Lead');
      insert into public.deals(id,user_id,contact_id,title,value,stage,assigned_to,last_actor) values
        ('50000000-0000-4000-8000-000000000001','${owner}','20000000-0000-4000-8000-000000000001','Com contato',1000,'new',null,'${owner}'),
        ('50000000-0000-4000-8000-000000000002','${owner}',null,'Do vendedor',500,'qualified','${seller}',null);`);
    // Re-applying must keep data and triggers intact.
    await db.exec(await readFile(new URL('../supabase/migrations/202611020005_opportunities.sql', import.meta.url), 'utf8'));
    const created = await db.query<{kind: string; actor_id: string | null}>(`select kind,actor_id from public.deal_events where deal_id='50000000-0000-4000-8000-000000000001'`);
    assert.deepEqual(created.rows, [{kind: 'created', actor_id: owner}]);
    assert.equal((await db.query<{last_actor: string | null}>(`select last_actor from public.deals where id='50000000-0000-4000-8000-000000000001'`)).rows[0].last_actor, null, 'actor is write-only');

    await db.exec(`update public.deals set stage='lost',lost_reason='Sem orçamento',value=1200,last_actor='${seller}' where id='50000000-0000-4000-8000-000000000001'`);
    const changes = await db.query<{kind: string; actor_id: string; detail: any}>(`select kind,actor_id,detail from public.deal_events where deal_id='50000000-0000-4000-8000-000000000001' and kind<>'created' order by kind`);
    assert.deepEqual(changes.rows.map(r => r.kind), ['stage', 'value']);
    assert.ok(changes.rows.every(r => r.actor_id === seller));
    assert.equal(changes.rows[0].detail.reason, 'Sem orçamento');
    const closed = await db.query<{closed_at: string | null}>(`select closed_at from public.deals where id='50000000-0000-4000-8000-000000000001'`);
    assert.ok(closed.rows[0].closed_at, 'closing sets closed_at');
    // An automated write without attribution must not inherit the previous actor.
    await db.exec(`update public.deals set stage='new' where id='50000000-0000-4000-8000-000000000001'`);
    const automated = await db.query<{actor_id: string | null; closed_at: string | null}>(`select e.actor_id,d.closed_at from public.deal_events e join public.deals d on d.id=e.deal_id where e.deal_id='50000000-0000-4000-8000-000000000001' and e.kind='stage' and e.detail->>'to'='new'`);
    assert.equal(automated.rows[0].actor_id, null);
    assert.equal(automated.rows[0].closed_at, null, 'reopening clears closed_at');

    await db.exec(`insert into public.deal_tasks(user_id,deal_id,title) values('${owner}','50000000-0000-4000-8000-000000000001','Ligar'),('${owner}','50000000-0000-4000-8000-000000000002','Enviar proposta')`);
    const as = async (id: string) => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({sub: id, role: 'authenticated', session_id: '40000000-0000-4000-8000-000000000001', aal: 'aal1'})]); await db.exec('set role authenticated'); };
    await as(seller);
    assert.deepEqual((await db.query<{title: string}>('select title from public.deals')).rows.map(r => r.title), ['Do vendedor']);
    assert.deepEqual((await db.query<{title: string}>('select title from public.deal_tasks')).rows.map(r => r.title), ['Enviar proposta']);
    await assert.rejects(db.exec(`insert into public.deal_tasks(user_id,deal_id,title) values('${owner}','50000000-0000-4000-8000-000000000002','Forjada')`), 'tasks are server-only writes');
    await assert.rejects(db.exec(`insert into public.deal_events(user_id,deal_id,kind) values('${owner}','50000000-0000-4000-8000-000000000002','stage')`), 'timeline is server-only');
    await db.exec('reset role');
    await db.exec(`insert into public.conversations(id,user_id,contact_id,status) values('30000000-0000-4000-8000-000000000001','${owner}','20000000-0000-4000-8000-000000000001','human')`);
    await as(owner);
    await assert.rejects(db.exec(`insert into public.messages(user_id,conversation_id,role,content) values('${owner}','30000000-0000-4000-8000-000000000001','assistant','IA forjada')`), 'clients cannot forge AI turns');
    await assert.rejects(db.exec(`insert into public.messages(user_id,conversation_id,role,content) values('${owner}','30000000-0000-4000-8000-000000000001','user','Cliente forjado')`), 'clients cannot forge customer turns');
    await db.exec(`insert into public.messages(user_id,conversation_id,role,content) values('${owner}','30000000-0000-4000-8000-000000000001','human','Resposta da equipe')`);
    await assert.rejects(db.exec(`update public.messages set content='Editada' where role='human'`), 'history is immutable for clients');
    await as(other);
    assert.equal((await db.query('select * from public.deals')).rows.length, 0);
    assert.equal((await db.query('select * from public.deal_events')).rows.length, 0);
    await db.exec('reset role');
    await db.exec(`delete from public.deals where id='50000000-0000-4000-8000-000000000002'`);
    assert.equal((await db.query(`select * from public.deal_tasks where deal_id='50000000-0000-4000-8000-000000000002'`)).rows.length, 0, 'deleting a deal removes its tasks');
    // Outbound WhatsApp: opens the thread for a contact who never wrote first and queues the human message.
    await db.exec('reset role');
    await db.exec(`insert into public.agents(id,user_id,name) values('60000000-0000-4000-8000-000000000001','${owner}','Felipa');
      insert into public.whatsapp_channels(instance,user_id,agent_id,enabled,activated_at) values('v4','${owner}','60000000-0000-4000-8000-000000000001',true,now());
      insert into public.contacts(id,user_id,name,phone) values('20000000-0000-4000-8000-000000000009','${owner}','Novo lead','11999990000'),('20000000-0000-4000-8000-000000000010','${owner}','Outro','11999990000');`);
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({role: 'service_role'})]);
    await db.exec('set role service_role');
    const start = (contact: string, request: string, text: string) => db.query<{r: any}>(`select public.whatsapp_start_human('${owner}','v4','${contact}','5511999990000@s.whatsapp.net','${request}',$1) as r`, [text]);
    const first = (await start('20000000-0000-4000-8000-000000000009', '70000000-0000-4000-8000-000000000001', 'Olá!')).rows[0].r;
    const again = (await start('20000000-0000-4000-8000-000000000009', '70000000-0000-4000-8000-000000000002', 'Tudo bem?')).rows[0].r;
    assert.equal(first.conversationId, again.conversationId, 'the same thread is reused');
    const conversation = await db.query<{channel: string; status: string}>(`select channel,status from public.conversations where id=$1`, [first.conversationId]);
    assert.deepEqual(conversation.rows[0], {channel: 'whatsapp', status: 'human'});
    const jobs = await db.query<{status: string; reply: string}>(`select status,reply from public.whatsapp_jobs where conversation_id=$1 order by created_at`, [first.conversationId]);
    assert.deepEqual(jobs.rows.map(j => [j.status, j.reply]), [['ready', 'Olá!'], ['ready', 'Tudo bem?']]);
    const retry = (await start('20000000-0000-4000-8000-000000000009', '70000000-0000-4000-8000-000000000001', 'Olá!')).rows[0].r;
    assert.equal(retry.jobId, first.jobId, 'retrying the same request does not send twice');
    await assert.rejects(start('20000000-0000-4000-8000-000000000010', '70000000-0000-4000-8000-000000000003', 'Oi'), /PHONE_OF_OTHER_CONTACT/);
    await db.exec('reset role');
    await as(owner);
    await assert.rejects(start('20000000-0000-4000-8000-000000000009', '70000000-0000-4000-8000-000000000004', 'Oi'), 'only the server may start WhatsApp sends');
  } finally {
    await db.close();
  }
});
