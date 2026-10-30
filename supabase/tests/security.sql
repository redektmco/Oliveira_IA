-- Run after the migration in a disposable Supabase database as postgres.
-- All test fixtures are rolled back. This tests database authorization, not
-- HTTP authentication or a real Anthropic request.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'oliveira-security-a@example.invalid'),
  ('00000000-0000-4000-8000-000000000002', 'oliveira-security-b@example.invalid');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into public.contacts (id, name) values ('10000000-0000-4000-8000-000000000001', 'Contato A');
insert into public.agents (id, name) values ('20000000-0000-4000-8000-000000000001', 'Agente A');
insert into public.conversations (id, contact_id, agent_id) values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
insert into public.contacts (id, name) values ('10000000-0000-4000-8000-000000000002', 'Contato B');

do $test$
declare n integer;
begin
  assert (select count(*) from public.contacts) = 1, 'RLS exposed another user contact';
  assert (select count(*) from public.conversations) = 0, 'RLS exposed another user conversation';
  update public.contacts set name = 'Changed by B' where id = '10000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  assert n = 0, 'RLS allowed cross-user update';
  delete from public.contacts where id = '10000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  assert n = 0, 'RLS allowed cross-user delete';
  begin
    insert into public.contacts (user_id, name) values ('00000000-0000-4000-8000-000000000001', 'Forged owner');
    raise exception 'RLS accepted forged user_id';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.deals (title, contact_id) values ('Cross-owner deal', '10000000-0000-4000-8000-000000000001');
    raise exception 'Composite FK accepted another owner contact';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.messages (conversation_id, role, content) values ('30000000-0000-4000-8000-000000000001', 'user', 'Forged turn');
    raise exception 'Composite FK accepted another owner conversation';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.ai_usage (user_id, model) values ('00000000-0000-4000-8000-000000000002', 'claude-haiku-4-5');
    raise exception 'Client created usage rows';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.reserve_ai_request('00000000-0000-4000-8000-000000000002', 'claude-haiku-4-5', 50);
    raise exception 'Client invoked quota RPC';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.append_ai_turn('00000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Hello', 'Hi');
    raise exception 'Client invoked server-only message RPC';
  exception when insufficient_privilege then null;
  end;
end
$test$;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $test$
begin
  begin
    perform count(*) from public.contacts;
    raise exception 'Anonymous caller read contacts';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.reserve_ai_request('00000000-0000-4000-8000-000000000001', 'claude-haiku-4-5', 50);
    raise exception 'Anonymous caller invoked quota RPC';
  exception when insufficient_privilege then null;
  end;
end
$test$;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select public.reserve_ai_request('00000000-0000-4000-8000-000000000001', 'claude-haiku-4-5', 2);
select public.reserve_ai_request('00000000-0000-4000-8000-000000000001', 'claude-haiku-4-5', 2);
do $test$
begin
  begin
    perform public.reserve_ai_request('00000000-0000-4000-8000-000000000001', 'claude-haiku-4-5', 2);
    raise exception 'Quota allowed third reservation';
  exception when raise_exception then
    if sqlerrm <> 'AI_DAILY_LIMIT_REACHED' then raise; end if;
  end;
  update public.ai_usage set status = 'failed' where user_id = '00000000-0000-4000-8000-000000000001';
  begin
    perform public.reserve_ai_request('00000000-0000-4000-8000-000000000001', 'claude-haiku-4-5', 2);
    raise exception 'Failed usage bypassed daily quota';
  exception when raise_exception then
    if sqlerrm <> 'AI_DAILY_LIMIT_REACHED' then raise; end if;
  end;
  begin
    perform public.reserve_ai_request('00000000-0000-4000-8000-000000000001', 'arbitrary-model', 50);
    raise exception 'Quota accepted unsupported model';
  exception when invalid_parameter_value then null;
  end;
end
$test$;

select public.append_ai_turn('00000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'First question', 'First answer');
select public.append_ai_turn('00000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Second question', 'Second answer');
do $test$
declare contents text[];
begin
  select array_agg(content order by created_at) into contents from public.messages
    where conversation_id = '30000000-0000-4000-8000-000000000001';
  assert contents = array['First question', 'First answer', 'Second question', 'Second answer'], 'AI turn order is unstable';
  begin
    perform public.append_ai_turn('00000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', 'Wrong owner', 'No');
    raise exception 'AI turn accepted wrong owner';
  exception when raise_exception then
    if sqlerrm <> 'CONVERSATION_NOT_AI' then raise; end if;
  end;
  begin
    perform public.append_ai_turn('00000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', repeat('x', 4001), 'No');
    raise exception 'AI turn accepted oversized input';
  exception when invalid_parameter_value then null;
  end;
  update public.conversations set status = 'human' where id = '30000000-0000-4000-8000-000000000001';
  begin
    perform public.append_ai_turn('00000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'After handoff', 'No');
    raise exception 'AI turn ignored human handoff';
  exception when raise_exception then
    if sqlerrm <> 'CONVERSATION_NOT_AI' then raise; end if;
  end;
  assert (select count(*) from public.messages where conversation_id = '30000000-0000-4000-8000-000000000001') = 4,
    'Rejected turn left partial messages';
end
$test$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $test$
begin
  assert (select count(*) from public.ai_usage) = 0, 'RLS exposed another user usage';
  assert (select count(*) from public.messages) = 0, 'RLS exposed another user messages';
end
$test$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $test$
begin
  assert (select count(*) from public.ai_usage) = 2, 'User cannot read own usage';
  begin
    delete from public.ai_usage;
    raise exception 'Client could reset quota';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.ai_usage set input_tokens = 0;
    raise exception 'Client could forge token counts';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.contacts where id = '10000000-0000-4000-8000-000000000001';
    raise exception 'Referenced contact deleted';
  exception when foreign_key_violation or restrict_violation then null;
  end;
  delete from public.conversations where id = '30000000-0000-4000-8000-000000000001';
  assert (select count(*) from public.messages) = 0, 'Conversation deletion did not cascade';
  delete from public.contacts where id = '10000000-0000-4000-8000-000000000001';
  assert (select count(*) from public.contacts) = 0, 'Unreferenced own contact could not be deleted';
end
$test$;

-- Removing an auth account must clean all dependent rows despite the guards
-- against deleting an individual referenced contact.
insert into public.contacts (id, name) values ('10000000-0000-4000-8000-000000000003', 'Account cleanup');
insert into public.deals (contact_id, title) values ('10000000-0000-4000-8000-000000000003', 'Cleanup deal');
insert into public.meetings (contact_id, title, starts_at) values ('10000000-0000-4000-8000-000000000003', 'Cleanup meeting', now());
insert into public.conversations (id, contact_id, agent_id) values
  ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001');
insert into public.messages (conversation_id, role, content) values ('30000000-0000-4000-8000-000000000003', 'user', 'Cleanup message');
reset role;
delete from auth.users where id = '00000000-0000-4000-8000-000000000001';
do $test$
begin
  assert (select count(*) from public.contacts where user_id = '00000000-0000-4000-8000-000000000001') = 0, 'Auth deletion retained contacts';
  assert (select count(*) from public.deals where user_id = '00000000-0000-4000-8000-000000000001') = 0, 'Auth deletion retained deals';
  assert (select count(*) from public.conversations where user_id = '00000000-0000-4000-8000-000000000001') = 0, 'Auth deletion retained conversations';
  assert (select count(*) from public.messages where user_id = '00000000-0000-4000-8000-000000000001') = 0, 'Auth deletion retained messages';
  assert (select count(*) from public.ai_usage where user_id = '00000000-0000-4000-8000-000000000001') = 0, 'Auth deletion retained usage';
end
$test$;

rollback;
