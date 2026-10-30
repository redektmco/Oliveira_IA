begin;
alter table public.messages add column if not exists delivery_status text not null default 'stored';
alter table public.messages add column if not exists provider_message_id text;
create index if not exists messages_provider_idx on public.messages(user_id,provider_message_id);
create table if not exists public.whatsapp_channels (
 instance text primary key, user_id uuid not null references auth.users(id) on delete cascade,
 agent_id uuid not null, enabled boolean not null default false, activated_at timestamptz,
 webhook_verified boolean not null default false, ai_allowlist text[] not null default '{}',
 foreign key(user_id,agent_id) references public.agents(user_id,id) on delete restrict
);
create table if not exists public.whatsapp_threads (
 instance text not null references public.whatsapp_channels(instance) on delete cascade,
 remote_jid text not null, user_id uuid not null references auth.users(id) on delete cascade,
 contact_id uuid not null, conversation_id uuid references public.conversations(id) on delete set null,
 primary key(instance,remote_jid),
 foreign key(user_id,contact_id) references public.contacts(user_id,id) on delete cascade
);
create table if not exists public.whatsapp_jobs (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 instance text not null references public.whatsapp_channels(instance) on delete cascade,
 remote_jid text not null, event_id text not null,
 conversation_id uuid not null references public.conversations(id) on delete cascade,
 incoming_id uuid references public.messages(id) on delete cascade,
 outgoing_id uuid references public.messages(id) on delete set null,
 kind text not null check(kind in ('inbound','human')),
 body text not null check(char_length(body) between 1 and 20000), reply text,
 status text not null default 'queued' check(status in ('queued','processing','ready','sending','retry','sent','skipped','failed','uncertain')),
 attempts integer not null default 0, available_at timestamptz not null default now(),
 lease_token uuid, lease_until timestamptz, provider_message_id text, error_code text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(instance,event_id,kind)
);
create index if not exists whatsapp_jobs_queue_idx on public.whatsapp_jobs(status,available_at,created_at);
create index if not exists whatsapp_jobs_thread_idx on public.whatsapp_jobs(instance,remote_jid,status);
do $p$ declare t text; begin foreach t in array array['whatsapp_channels','whatsapp_threads','whatsapp_jobs'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('alter table public.%I force row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 execute format('drop policy if exists own_whatsapp on public.%I',t);
 execute format('create policy own_whatsapp on public.%I for select to authenticated using ((select auth.uid())=user_id)',t);
 end loop; end $p$;

create or replace function public.whatsapp_ingest(p_instance text,p_jid text,p_event_id text,p_text text,p_name text,p_from_me boolean,p_needs_human boolean default false,p_event_time timestamptz default now())
returns jsonb language plpgsql security definer set search_path='' as $f$
declare ch public.whatsapp_channels; th public.whatsapp_threads; cv public.conversations; j public.whatsapp_jobs;
 cid uuid; mid uuid; jid text; s text; begin
 if (select auth.role()) is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
 if p_jid !~ '^[0-9]{8,15}@s.whatsapp.net$' or char_length(p_event_id) not between 1 and 200 or char_length(btrim(p_text)) not between 1 and 20000 then raise exception 'INVALID_EVENT'; end if;
 select * into ch from public.whatsapp_channels where instance=p_instance;
 if not found or ch.activated_at is null or p_event_time < ch.activated_at-interval '5 seconds' then return jsonb_build_object('ignored',true); end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('wa:'||p_instance||':'||p_jid,0));
 if exists(select 1 from public.messages where user_id=ch.user_id and provider_message_id=p_event_id) or exists(select 1 from public.whatsapp_jobs where instance=p_instance and event_id=p_event_id and kind='inbound') then return jsonb_build_object('duplicate',true); end if;
 select * into th from public.whatsapp_threads where instance=p_instance and remote_jid=p_jid;
 if p_from_me then
  select * into j from public.whatsapp_jobs where instance=p_instance and remote_jid=p_jid and status in ('sending','uncertain') and reply=p_text and updated_at>now()-interval '10 minutes' order by created_at limit 1 for update;
  if found then
   update public.whatsapp_jobs set status='sent',provider_message_id=p_event_id,lease_until=null,updated_at=now(),error_code=null where id=j.id;
   update public.messages set delivery_status='sent',provider_message_id=p_event_id where id=j.outgoing_id;
   return jsonb_build_object('echo',true);
  end if;
  if th.conversation_id is null then return jsonb_build_object('ignored',true); end if;
  update public.conversations set status='human' where id=th.conversation_id and user_id=ch.user_id;
  insert into public.messages(user_id,conversation_id,role,content,delivery_status,provider_message_id) values(ch.user_id,th.conversation_id,'human',p_text,'sent',p_event_id);
  return jsonb_build_object('human',true);
 end if;
 if th.contact_id is null then
  select id into cid from public.contacts where user_id=ch.user_id and regexp_replace(phone,'[^0-9]','','g')=split_part(p_jid,'@',1) order by created_at limit 1;
  if cid is null then insert into public.contacts(user_id,name,phone,source) values(ch.user_id,left(coalesce(nullif(btrim(p_name),''),split_part(p_jid,'@',1)),200),split_part(p_jid,'@',1),'WhatsApp') returning id into cid; end if;
  insert into public.whatsapp_threads(instance,remote_jid,user_id,contact_id) values(p_instance,p_jid,ch.user_id,cid) returning * into th;
 end if;
 select * into cv from public.conversations where id=th.conversation_id and user_id=ch.user_id for update;
 if not (split_part(p_jid,'@',1)=any(ch.ai_allowlist)) then p_needs_human:=true;end if;
 if cv.id is null or cv.status='closed' then
  s:=case when ch.enabled and not p_needs_human and exists(select 1 from public.agents where id=ch.agent_id and active) then 'ai' else 'human' end;
  insert into public.conversations(user_id,contact_id,agent_id,channel,status) values(ch.user_id,th.contact_id,ch.agent_id,'whatsapp',s) returning * into cv;
  update public.whatsapp_threads set conversation_id=cv.id where instance=p_instance and remote_jid=p_jid;
 elsif p_needs_human then update public.conversations set status='human' where id=cv.id; cv.status:='human'; end if;
 insert into public.messages(user_id,conversation_id,role,content,delivery_status,provider_message_id) values(ch.user_id,cv.id,'user',p_text,'received',p_event_id) returning id into mid;
 insert into public.whatsapp_jobs(user_id,instance,remote_jid,event_id,conversation_id,incoming_id,kind,body,status,error_code)
 values(ch.user_id,p_instance,p_jid,p_event_id,cv.id,mid,'inbound',p_text,case when cv.status='ai' and ch.enabled then 'queued' else 'skipped' end,case when cv.status<>'ai' then 'human_handoff' else null end) returning * into j;
 return jsonb_build_object('queued',j.status='queued','jobId',j.id,'conversationId',cv.id);
end $f$;

create or replace function public.whatsapp_claim() returns setof public.whatsapp_jobs language plpgsql security definer set search_path='' as $f$
declare j public.whatsapp_jobs; begin
 if (select auth.role()) is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
 update public.conversations c set status='human' from public.whatsapp_jobs expired where c.id=expired.conversation_id and c.status='ai' and expired.status='sending' and expired.lease_until<now();
 update public.messages m set delivery_status='uncertain' from public.whatsapp_jobs expired where m.id=expired.outgoing_id and expired.status='sending' and expired.lease_until<now();
 update public.whatsapp_jobs set status='uncertain',error_code='delivery_unknown',lease_until=null,updated_at=now() where status='sending' and lease_until<now();
 update public.whatsapp_jobs set status=case when attempts>=4 then 'failed' else 'retry' end,error_code='worker_interrupted',available_at=now(),lease_until=null,updated_at=now() where status='processing' and lease_until<now();
 select * into j from public.whatsapp_jobs x where x.status in ('queued','ready','retry') and x.available_at<=now()
 and not exists(select 1 from public.whatsapp_jobs y where y.instance=x.instance and y.remote_jid=x.remote_jid and y.status in ('processing','sending'))
 and not exists(select 1 from public.whatsapp_jobs y where y.instance=x.instance and y.remote_jid=x.remote_jid and y.created_at<x.created_at and y.status in ('queued','ready','retry'))
 order by x.created_at for update skip locked limit 1;
 if not found then return; end if;
 -- The advisory lock closes the race between simultaneous claims for one chat.
 if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('wa:'||j.instance||':'||j.remote_jid,0)) then return; end if;
 if exists(select 1 from public.whatsapp_jobs where instance=j.instance and remote_jid=j.remote_jid and status in ('processing','sending')) then return; end if;
 update public.whatsapp_jobs set status='processing',lease_token=gen_random_uuid(),lease_until=now()+interval '120 seconds',attempts=attempts+1,updated_at=now() where id=j.id returning * into j;
 return next j;
end $f$;

create or replace function public.whatsapp_save_reply(p_id uuid,p_lease uuid,p_reply text) returns boolean language plpgsql security definer set search_path='' as $f$
declare j public.whatsapp_jobs; mid uuid; begin
 if (select auth.role()) is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
 select * into j from public.whatsapp_jobs where id=p_id and lease_token=p_lease and status='processing' for update;
 if not found then return false; end if;
 perform 1 from public.conversations c join public.agents a on a.id=c.agent_id join public.whatsapp_channels ch on ch.instance=j.instance where c.id=j.conversation_id and c.user_id=j.user_id and c.status='ai' and a.active and ch.enabled for update of c;
 if not found then update public.whatsapp_jobs set status='skipped',error_code='human_handoff',lease_until=null where id=j.id;return false;end if;
 if char_length(btrim(p_reply)) not between 1 and 16000 then raise exception 'INVALID_REPLY'; end if;
 insert into public.messages(user_id,conversation_id,role,content,delivery_status) values(j.user_id,j.conversation_id,'assistant',p_reply,'queued') returning id into mid;
 update public.whatsapp_jobs set reply=p_reply,outgoing_id=mid,status='ready',updated_at=now() where id=j.id;
 return true;
end $f$;

create or replace function public.whatsapp_prepare_send(p_id uuid,p_lease uuid) returns boolean language plpgsql security definer set search_path='' as $f$
declare j public.whatsapp_jobs; s text; begin
 if (select auth.role()) is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
 select * into j from public.whatsapp_jobs where id=p_id and lease_token=p_lease and status in ('processing','ready') for update;
 if not found or j.reply is null then return false; end if;
 select status into s from public.conversations where id=j.conversation_id and user_id=j.user_id for update;
 if (j.kind='human' and s<>'human') or (j.kind='inbound' and (s<>'ai' or not exists(select 1 from public.whatsapp_channels ch join public.agents a on a.id=ch.agent_id where ch.instance=j.instance and ch.enabled and a.active and split_part(j.remote_jid,'@',1)=any(ch.ai_allowlist)))) then
  update public.whatsapp_jobs set status='skipped',error_code='human_handoff',lease_until=null where id=j.id;
  update public.messages set delivery_status='canceled' where id=j.outgoing_id;return false;
 end if;
 update public.whatsapp_jobs set status='sending',updated_at=now(),lease_until=now()+interval '120 seconds' where id=j.id;
 update public.messages set delivery_status='sending' where id=j.outgoing_id;
 return true;
end $f$;

create or replace function public.whatsapp_finish(p_id uuid,p_lease uuid,p_result text,p_provider_id text default null,p_error text default null) returns void language plpgsql security definer set search_path='' as $f$
declare j public.whatsapp_jobs; s text; begin
 if (select auth.role()) is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
 if p_result not in ('sent','retry','failed','uncertain','skipped') then raise exception 'INVALID_RESULT';end if;
 select * into j from public.whatsapp_jobs where id=p_id and lease_token=p_lease for update;
 if not found or j.status in ('sent','skipped') then return;end if;
 s:=case when p_result='retry' and j.attempts>=4 then 'failed' else p_result end;
 update public.whatsapp_jobs set status=s,provider_message_id=p_provider_id,error_code=p_error,lease_until=null,available_at=now()+make_interval(secs=>least(300,15*(2^least(j.attempts,4))::integer)),updated_at=now() where id=j.id;
 update public.messages set delivery_status=case when s='retry' then 'queued' when s='skipped' then 'canceled' else s end,provider_message_id=coalesce(p_provider_id,provider_message_id) where id=j.outgoing_id;
 if s in ('failed','uncertain') and j.kind='inbound' then update public.conversations set status='human' where id=j.conversation_id and status='ai';end if;
end $f$;

create or replace function public.whatsapp_enqueue_human(p_user uuid,p_conversation uuid,p_request uuid,p_text text) returns uuid language plpgsql security definer set search_path='' as $f$
declare th public.whatsapp_threads; mid uuid; jid uuid; begin
 if (select auth.role()) is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
 if char_length(btrim(p_text)) not between 1 and 4000 then raise exception 'INVALID_REPLY';end if;
 select id into jid from public.whatsapp_jobs where user_id=p_user and event_id=p_request::text and kind='human';if found then return jid;end if;
 select t.* into th from public.whatsapp_threads t join public.conversations c on c.id=t.conversation_id where t.conversation_id=p_conversation and t.user_id=p_user and c.status='human' for update of c;
 if not found then raise exception 'HUMAN_CONVERSATION_REQUIRED';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('wa:'||th.instance||':'||th.remote_jid,0));
 select id into jid from public.whatsapp_jobs where user_id=p_user and event_id=p_request::text and kind='human';if found then return jid;end if;
 insert into public.messages(user_id,conversation_id,role,content,delivery_status) values(p_user,p_conversation,'human',p_text,'queued') returning id into mid;
 insert into public.whatsapp_jobs(user_id,instance,remote_jid,event_id,conversation_id,outgoing_id,kind,body,reply,status) values(p_user,th.instance,th.remote_jid,p_request::text,p_conversation,mid,'human',p_text,p_text,'ready') returning id into jid;
 return jid;
end $f$;

create or replace function public.whatsapp_handoff_trigger() returns trigger language plpgsql security definer set search_path='' as $f$
begin
 if new.status in ('human','closed') then
  update public.messages m set delivery_status='canceled' from public.whatsapp_jobs j where m.id=j.outgoing_id and j.conversation_id=new.id and j.status in ('queued','processing','ready','retry') and (j.kind='inbound' or new.status='closed');
  update public.whatsapp_jobs set status='skipped',error_code='human_handoff',lease_until=null,updated_at=now() where conversation_id=new.id and status in ('queued','processing','ready','retry') and (kind='inbound' or new.status='closed');
 end if;return new;
end $f$;
drop trigger if exists whatsapp_handoff on public.conversations;
create trigger whatsapp_handoff after update of status on public.conversations for each row when (old.status is distinct from new.status) execute function public.whatsapp_handoff_trigger();

do $p$ declare r record; begin for r in select p.oid::regprocedure as f from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('whatsapp_ingest','whatsapp_claim','whatsapp_save_reply','whatsapp_prepare_send','whatsapp_finish','whatsapp_enqueue_human','whatsapp_handoff_trigger') loop
 execute format('revoke all on function %s from public,anon,authenticated',r.f);
 execute format('grant execute on function %s to service_role',r.f);
 end loop;end $p$;
commit;
-- Private rollback copy: provider webhook headers can contain credentials.
create table if not exists public.whatsapp_webhook_backup(instance text primary key,configuration jsonb not null,created_at timestamptz not null default now());
alter table public.whatsapp_webhook_backup enable row level security;
alter table public.whatsapp_webhook_backup force row level security;
revoke all on public.whatsapp_webhook_backup from public,anon,authenticated;
grant all on public.whatsapp_webhook_backup to service_role;
