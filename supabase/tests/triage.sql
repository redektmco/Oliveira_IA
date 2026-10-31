begin;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000001'), ('10000000-0000-4000-8000-000000000002');
insert into public.contacts(id, user_id, name) values ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Teste CRM');
insert into public.conversations(id,user_id,contact_id) values ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$
declare payload jsonb := '{"summary":"Necessidade confirmada","next_action":"Confirmar orçamento","criteria":{},"score":25,"status":"qualifying"}'; rev bigint; n integer;
begin
 perform public.append_triaged_turn('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',0,'Preciso automatizar','Qual o orçamento?',payload);
 select crm_revision into rev from public.contacts where id='20000000-0000-4000-8000-000000000001';
 if rev <= 0 then raise exception 'revision did not advance'; end if;
 if not exists(select 1 from public.contacts where id='20000000-0000-4000-8000-000000000001' and score=25 and status='qualifying' and triage_message_count=2 and triage_updated_at is not null) then raise exception 'profile not persisted'; end if;
 begin
  perform public.append_triaged_turn('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',0,'stale','stale',payload);
  raise exception 'stale analysis accepted';
 exception when raise_exception then if sqlerrm <> 'CRM_CHANGED' then raise; end if; end;
 begin
  perform public.append_triaged_turn('10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',rev,'other owner','other owner',payload);
  raise exception 'cross-owner write accepted';
 exception when raise_exception then if sqlerrm <> 'CRM_CHANGED' then raise; end if; end;
 update public.conversations set status='human' where id='30000000-0000-4000-8000-000000000001';
 begin
  perform public.append_triaged_turn('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',rev,'late','late',payload);
  raise exception 'handoff ignored';
 exception when raise_exception then if sqlerrm <> 'CONVERSATION_NOT_AI' then raise; end if; end;
 select count(*) into n from public.messages;
 if n <> 2 then raise exception 'rejected call wrote partial messages'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000001"}',true);
do $$
begin
 begin
  update public.contacts set triage='{"summary":"Forged"}' where id='20000000-0000-4000-8000-000000000001';
  raise exception 'client forged AI provenance';
 exception when insufficient_privilege then null; end;
 update public.contacts set notes='Nota da equipe' where id='20000000-0000-4000-8000-000000000001';
 if not exists(select 1 from public.contacts where notes='Nota da equipe') then raise exception 'ordinary edit failed'; end if;
end $$;
reset role;
rollback;
