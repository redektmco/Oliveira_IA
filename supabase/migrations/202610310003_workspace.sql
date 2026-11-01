begin;

create table if not exists public.workspace_settings (
 user_id uuid primary key references auth.users(id) on delete cascade,
 config jsonb not null default '{}'::jsonb,
 widget_key text not null unique default replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),
 updated_at timestamptz not null default now()
);
create table if not exists public.workspace_members (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id) on delete cascade,
 user_id uuid references auth.users(id) on delete set null,email text not null,name text not null default '',
 role text not null check(role in ('admin','manager','seller')),status text not null default 'pending' check(status in ('pending','active','disabled')),
 token_hash text unique,expires_at timestamptz,last_seen_at timestamptz,created_at timestamptz not null default now(),
 unique(owner_id,email),unique(owner_id,user_id)
);
create index if not exists workspace_members_user_idx on public.workspace_members(user_id,status);
create table if not exists public.workspace_sessions (
 id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,
 device text not null default '',ip text not null default '',created_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now(),revoked_at timestamptz
);
create table if not exists public.workspace_audit (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 actor_id uuid,actor_email text not null default '',action text not null,created_at timestamptz not null default now()
);
create table if not exists public.integration_accounts (
 user_id uuid not null references auth.users(id) on delete cascade,provider text not null check(provider in ('google','instagram','stripe')),
 account_id text not null default '',label text not null default '',secret text not null default '',metadata jsonb not null default '{}',
 connected_at timestamptz not null default now(),synced_at timestamptz,primary key(user_id,provider)
);
create table if not exists public.oauth_requests (
 state_hash text primary key,user_id uuid not null references auth.users(id) on delete cascade,
 provider text not null,expires_at timestamptz not null,created_at timestamptz not null default now()
);
create table if not exists public.workspace_api_keys (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(char_length(name) between 1 and 120),prefix text not null,token_hash text not null unique,
 created_at timestamptz not null default now(),last_used_at timestamptz,revoked_at timestamptz
);
create table if not exists public.workspace_webhooks (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 url text not null,events text[] not null,secret text not null,enabled boolean not null default true,
 failure_count integer not null default 0,created_at timestamptz not null default now()
);
create table if not exists public.webhook_deliveries (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 endpoint_id uuid not null references public.workspace_webhooks(id) on delete cascade,
 event text not null,payload jsonb not null,status text not null default 'pending',response_code integer,duration_ms integer,
 attempts integer not null default 0,available_at timestamptz not null default now(),lease_until timestamptz,
 created_at timestamptz not null default now()
);
create table if not exists public.contact_notes (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 contact_id uuid not null,content text not null check(char_length(btrim(content)) between 1 and 12000),author text not null default '',
 created_at timestamptz not null default now(),foreign key(user_id,contact_id) references public.contacts(user_id,id) on delete cascade
);
create table if not exists public.contact_files (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 contact_id uuid not null,name text not null,mime text not null,bytes integer not null check(bytes between 0 and 2097152),
 storage_path text not null,created_at timestamptz not null default now(),
 foreign key(user_id,contact_id) references public.contacts(user_id,id) on delete cascade
);
create table if not exists public.widget_sessions (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 token_hash text not null unique,conversation_id uuid not null references public.conversations(id) on delete cascade,
 origin text not null,ip_hash text not null,created_at timestamptz not null default now(),expires_at timestamptz not null
);
create table if not exists public.channel_events (
 id text primary key,user_id uuid not null references auth.users(id) on delete cascade,provider text not null,
 created_at timestamptz not null default now()
);
create table if not exists public.channel_jobs (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 conversation_id uuid not null references public.conversations(id) on delete cascade,incoming_id uuid references public.messages(id) on delete cascade,
 kind text not null,status text not null default 'pending',payload jsonb not null default '{}',attempts integer not null default 0,
 available_at timestamptz not null default now(),lease_until timestamptz,created_at timestamptz not null default now(),unique(incoming_id,kind)
);

alter table public.contacts add column if not exists job_title text not null default '';
alter table public.contacts add column if not exists city text not null default '';
alter table public.contacts add column if not exists tags text[] not null default '{}';
alter table public.contacts add column if not exists assigned_to uuid references auth.users(id) on delete set null;
alter table public.contacts add column if not exists qualification jsonb not null default '{}';
alter table public.contacts add column if not exists ai_summary text not null default '';
alter table public.contacts add column if not exists ai_next_action text not null default '';
alter table public.contacts add column if not exists summary_at timestamptz;
alter table public.contacts add column if not exists consent_at timestamptz;
alter table public.contacts add column if not exists consent_text text not null default '';
alter table public.conversations drop constraint if exists conversations_channel_check;
alter table public.conversations add constraint conversations_channel_check check(channel in ('web','whatsapp','email','instagram','widget'));
alter table public.conversations add column if not exists external_id text;
create unique index if not exists conversations_external_idx on public.conversations(user_id,channel,external_id) where external_id is not null;

-- Server-only objects: never expose OAuth tokens, API digests or webhook secrets through PostgREST.
do $block$ declare t text; begin
 foreach t in array array['workspace_settings','workspace_members','workspace_sessions','workspace_audit','integration_accounts','oauth_requests','workspace_api_keys','workspace_webhooks','webhook_deliveries','widget_sessions','channel_events','channel_jobs'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('alter table public.%I force row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $block$;

create or replace function public.workspace_role(p_owner uuid) returns text language sql stable security definer set search_path='' as $f$
 select case when auth.uid()=p_owner then 'admin' else
 (select role from public.workspace_members where owner_id=p_owner and user_id=auth.uid() and status='active') end
$f$;
create or replace function public.workspace_direct_access(p_owner uuid) returns boolean language sql stable security definer set search_path='' as $f$
 select public.workspace_role(p_owner) is not null
 and not exists(select 1 from public.workspace_sessions where id=nullif(current_setting('request.jwt.claims',true)::jsonb->>'session_id','')::uuid and (revoked_at is not null or last_seen_at<now()-make_interval(days=>coalesce((select(config#>>'{security,sessionDays}')::integer from public.workspace_settings where user_id=p_owner),7))))
 and not exists(select 1 from public.workspace_settings where user_id=p_owner and (
  coalesce((config#>>'{security,requireMfa}')::boolean,false)
  or coalesce((config#>>'{security,maskContacts}')::boolean,false)
  or coalesce(jsonb_array_length(config#>'{security,allowedIps}'),0)>0
  or coalesce((config#>>'{security,sessionDays}')::integer,7)<>7
 ))
$f$;
create or replace function public.workspace_contact_access(p_owner uuid,p_contact uuid) returns boolean language sql stable security definer set search_path='' as $f$
 select public.workspace_role(p_owner) in ('admin','manager') or (public.workspace_role(p_owner)='seller' and exists(select 1 from public.contacts where user_id=p_owner and id=p_contact and assigned_to=auth.uid()))
$f$;
revoke all on function public.workspace_role(uuid),public.workspace_direct_access(uuid),public.workspace_contact_access(uuid,uuid) from public,anon;
grant execute on function public.workspace_role(uuid),public.workspace_direct_access(uuid),public.workspace_contact_access(uuid,uuid) to authenticated,service_role;

-- Separate policies retain ownership and assigned-contact scope even for direct SDK clients.
do $block$ declare t text; predicate text; begin
 foreach t in array array['contacts','deals','conversations','messages','meetings','agents','knowledge','ai_usage','contact_notes','contact_files'] loop
  execute format('alter table public.%I enable row level security',t);execute format('alter table public.%I force row level security',t);
  execute format('drop policy if exists own_rows on public.%I',t);execute format('drop policy if exists own_usage on public.%I',t);
  execute format('drop policy if exists workspace_read on public.%I',t);execute format('drop policy if exists workspace_write on public.%I',t);
  predicate:=case when t='contacts' then '(public.workspace_role(user_id) in (''admin'',''manager'') or (public.workspace_role(user_id)=''seller'' and assigned_to=auth.uid()))' when t in ('deals','conversations','meetings','contact_notes','contact_files') then 'public.workspace_contact_access(user_id,contact_id)' when t='messages' then 'exists(select 1 from public.conversations c where c.id=conversation_id and c.user_id=public.messages.user_id and public.workspace_contact_access(c.user_id,c.contact_id))' else 'public.workspace_role(user_id) is not null' end;
  execute format('create policy workspace_read on public.%I for select to authenticated using(public.workspace_direct_access(user_id) and %s)',t,predicate);
  if t not in ('ai_usage','contact_files') then
   predicate:=case when t in ('agents','knowledge') then 'public.workspace_role(user_id) in (''admin'',''manager'')' else predicate end;
   execute format('create policy workspace_write on public.%I for all to authenticated using(public.workspace_direct_access(user_id) and %s) with check(public.workspace_direct_access(user_id) and %s)',t,predicate,predicate);
  end if;
 end loop;
end $block$;
grant select,insert,update,delete on public.contact_notes to authenticated;
grant select on public.contact_files to authenticated;
grant all on public.contact_notes,public.contact_files to service_role;

-- Immutability closes the cross-owner move loophole in UPDATE policies.
create or replace function public.workspace_row_guard() returns trigger language plpgsql security definer set search_path='' as $f$
begin
 if new.user_id is distinct from old.user_id then raise exception 'OWNER_IMMUTABLE' using errcode='42501';end if;
 return new;
end $f$;
do $block$ declare t text; begin foreach t in array array['contacts','deals','conversations','messages','meetings','agents','knowledge','contact_notes','contact_files'] loop
 execute format('drop trigger if exists workspace_owner_guard on public.%I',t);
 execute format('create trigger workspace_owner_guard before update on public.%I for each row execute function public.workspace_row_guard()',t);
end loop;end $block$;

create or replace function public.workspace_claim_jobs(p_kind text,p_limit integer default 5) returns setof public.channel_jobs language plpgsql security definer set search_path='' as $f$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501';end if;
 return query update public.channel_jobs set status='processing',attempts=attempts+1,lease_until=now()+interval '90 seconds'
 where id in(select id from public.channel_jobs where kind=p_kind and attempts<4 and (status='pending' or (status='processing' and lease_until<now())) and available_at<=now() order by created_at for update skip locked limit least(greatest(p_limit,1),10)) returning *;
end $f$;
revoke all on function public.workspace_claim_jobs(text,integer) from public,anon,authenticated;grant execute on function public.workspace_claim_jobs(text,integer) to service_role;
commit;
begin;
alter table public.oauth_requests add column if not exists actor_id uuid references auth.users(id) on delete cascade;
alter table public.widget_sessions add column if not exists busy_until timestamptz;
create or replace function public.workspace_claim_deliveries() returns setof public.webhook_deliveries language plpgsql security definer set search_path='' as $f$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501';end if;
 return query update public.webhook_deliveries set status='processing',attempts=attempts+1,lease_until=now()+interval '60 seconds'
 where id in(select id from public.webhook_deliveries where attempts<4 and (status='pending' or status='processing' and lease_until<now()) and available_at<=now() order by created_at for update skip locked limit 3) returning *;
end $f$;
revoke all on function public.workspace_claim_deliveries() from public,anon,authenticated;grant execute on function public.workspace_claim_deliveries() to service_role;
commit;
begin;
create or replace function public.workspace_import_message(p_event text,p_owner uuid,p_provider text,p_conversation uuid,p_content text,p_external text) returns boolean language plpgsql security definer set search_path='' as $f$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_event,0));
 if exists(select 1 from public.channel_events where id=p_event) then return false;end if;
 if not exists(select 1 from public.conversations where id=p_conversation and user_id=p_owner) then raise exception 'CONVERSATION_NOT_FOUND';end if;
 insert into public.channel_events(id,user_id,provider) values(p_event,p_owner,p_provider);
 insert into public.messages(user_id,conversation_id,role,content,provider_message_id,delivery_status) values(p_owner,p_conversation,'user',p_content,p_external,'received');
 if p_provider='google' then update public.conversations set status='human' where id=p_conversation;end if;
 return true;
end $f$;
revoke all on function public.workspace_import_message(text,uuid,text,uuid,text,text) from public,anon,authenticated;grant execute on function public.workspace_import_message(text,uuid,text,uuid,text,text) to service_role;
commit;
begin;
create or replace function public.workspace_save_section(p_owner uuid,p_section text,p_value jsonb) returns void language plpgsql security definer set search_path='' as $f$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501';end if;
 if p_section not in ('general','whatsapp','email','instagram','widget','security') or jsonb_typeof(p_value)<>'object' then raise exception 'INVALID_SECTION';end if;
 insert into public.workspace_settings(user_id) values(p_owner) on conflict do nothing;
 update public.workspace_settings set config=jsonb_set(config,array[p_section],p_value),updated_at=now() where user_id=p_owner;
end $f$;
create or replace function public.workspace_erase_contact(p_owner uuid,p_contact uuid) returns void language plpgsql security definer set search_path='' as $f$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501';end if;
 delete from public.conversations where user_id=p_owner and contact_id=p_contact;
 delete from public.meetings where user_id=p_owner and contact_id=p_contact;
 delete from public.deals where user_id=p_owner and contact_id=p_contact;
 delete from public.contacts where user_id=p_owner and id=p_contact;
end $f$;
create or replace function public.workspace_erase(p_owner uuid) returns void language plpgsql security definer set search_path='' as $f$
declare t text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501';end if;
 delete from public.whatsapp_channels where user_id=p_owner;
 delete from public.conversations where user_id=p_owner;
 delete from public.meetings where user_id=p_owner;
 delete from public.deals where user_id=p_owner;
 delete from public.contacts where user_id=p_owner;
 delete from public.agents where user_id=p_owner;
 delete from public.knowledge where user_id=p_owner;
 delete from public.ai_usage where user_id=p_owner;
 foreach t in array array['workspace_settings','workspace_audit','integration_accounts','oauth_requests','workspace_api_keys','workspace_webhooks','webhook_deliveries','widget_sessions','channel_events','channel_jobs'] loop
 execute format('delete from public.%I where user_id=$1',t) using p_owner;
 end loop;
 delete from public.workspace_members where owner_id=p_owner;
end $f$;
revoke all on function public.workspace_save_section(uuid,text,jsonb),public.workspace_erase_contact(uuid,uuid),public.workspace_erase(uuid) from public,anon,authenticated;
grant execute on function public.workspace_save_section(uuid,text,jsonb),public.workspace_erase_contact(uuid,uuid),public.workspace_erase(uuid) to service_role;
-- Storage is optional in SQL unit tests; Supabase supplies the private bucket in production.
do $block$ begin if to_regclass('storage.buckets') is not null then
 execute $q$insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('crm-files','crm-files',false,2097152,array['application/pdf','text/plain','text/markdown','image/png','image/jpeg','image/webp']) on conflict(id) do nothing$q$;
end if;end $block$;
commit;
begin;
create table if not exists public.workspace_rates(bucket text not null,window_start timestamptz not null,count integer not null default 0,primary key(bucket,window_start));
alter table public.workspace_rates enable row level security;alter table public.workspace_rates force row level security;revoke all on public.workspace_rates from anon,authenticated;grant all on public.workspace_rates to service_role;
create or replace function public.workspace_rate(p_bucket text,p_window timestamptz,p_limit integer) returns boolean language plpgsql security definer set search_path='' as $f$
declare n integer;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501';end if;
 insert into public.workspace_rates(bucket,window_start,count)values(p_bucket,p_window,1) on conflict(bucket,window_start)do update set count=public.workspace_rates.count+1 where public.workspace_rates.count<p_limit returning count into n;return n is not null;
end $f$;
create table if not exists public.channel_contacts(user_id uuid not null references auth.users(id) on delete cascade,provider text not null,external_id text not null,contact_id uuid not null,primary key(user_id,provider,external_id),foreign key(user_id,contact_id)references public.contacts(user_id,id)on delete cascade);
alter table public.channel_contacts enable row level security;alter table public.channel_contacts force row level security;revoke all on public.channel_contacts from anon,authenticated;grant all on public.channel_contacts to service_role;
create table if not exists public.workspace_notifications(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id)on delete cascade,recipient_id uuid references auth.users(id)on delete cascade,contact_id uuid,title text not null,read_at timestamptz,created_at timestamptz not null default now(),foreign key(user_id,contact_id)references public.contacts(user_id,id)on delete cascade);
alter table public.workspace_notifications enable row level security;alter table public.workspace_notifications force row level security;revoke all on public.workspace_notifications from anon,authenticated;grant all on public.workspace_notifications to service_role;
alter table public.workspace_members add column if not exists last_assigned_at timestamptz;
create or replace function public.workspace_contact_guard() returns trigger language plpgsql security definer set search_path='' as $f$
declare next_member uuid;cfg jsonb;
begin
 if (tg_op='INSERT' or new.assigned_to is distinct from old.assigned_to)and new.assigned_to is not null and new.assigned_to<>new.user_id and not exists(select 1 from public.workspace_members where owner_id=new.user_id and user_id=new.assigned_to and status='active')then raise exception 'ASSIGNEE_NOT_IN_WORKSPACE';end if;
 select config into cfg from public.workspace_settings where user_id=new.user_id;
 if new.status='qualified' and new.assigned_to is null and coalesce((cfg#>>'{general,roundRobin}')::boolean,false) then
  perform pg_advisory_xact_lock(hashtextextended('assignment:'||new.user_id::text,0));
  select m.user_id into next_member from public.workspace_members m where m.owner_id=new.user_id and m.role='seller' and m.status='active' and m.user_id is not null
   order by (select count(*)from public.contacts c where c.user_id=new.user_id and c.assigned_to=m.user_id),m.last_assigned_at nulls first,m.created_at limit 1;
  if next_member is not null then new.assigned_to=next_member;update public.workspace_members set last_assigned_at=now()where owner_id=new.user_id and user_id=next_member;end if;
 end if;
 return new;
end $f$;
drop trigger if exists contacts_assignment on public.contacts;create trigger contacts_assignment before insert or update on public.contacts for each row execute function public.workspace_contact_guard();
create or replace function public.workspace_hot_lead()returns trigger language plpgsql security definer set search_path='' as $f$
begin
 if new.score>=70 and old.score<70 and coalesce((select(config#>>'{whatsapp,hotLeadAlert}')::boolean from public.workspace_settings where user_id=new.user_id),true) then
 insert into public.workspace_notifications(user_id,recipient_id,contact_id,title)values(new.user_id,coalesce(new.assigned_to,new.user_id),new.id,'Lead quente: '||new.name||' atingiu '||new.score||'/100');
 end if;return new;
end $f$;
drop trigger if exists contacts_hot_lead on public.contacts;create trigger contacts_hot_lead after update on public.contacts for each row execute function public.workspace_hot_lead();
create or replace function public.workspace_ingest_instagram(p_owner uuid,p_event text,p_sender text,p_content text,p_name text,p_auto boolean,p_source text)returns jsonb language plpgsql security definer set search_path='' as $f$
declare cid uuid;cv public.conversations;mid uuid;agent uuid;
begin
 if auth.role() is distinct from 'service_role'then raise exception 'SERVICE_ROLE_REQUIRED'using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('instagram:'||p_owner::text||p_sender,0));
 if exists(select 1 from public.channel_events where id=p_event)then return jsonb_build_object('duplicate',true);end if;
 select contact_id into cid from public.channel_contacts where user_id=p_owner and provider='instagram'and external_id=p_sender;
 if cid is null then insert into public.contacts(user_id,name,source)values(p_owner,left(p_name,200),left(p_source,100))returning id into cid;insert into public.channel_contacts values(p_owner,'instagram',p_sender,cid);end if;
 select * into cv from public.conversations where user_id=p_owner and channel='instagram'and external_id=p_sender for update;
 if cv.id is null or cv.status='closed'then
  if cv.id is not null then update public.conversations set external_id=null where id=cv.id;end if;
  select id into agent from public.agents where user_id=p_owner and active order by created_at limit 1;
  insert into public.conversations(user_id,contact_id,agent_id,channel,status,external_id)values(p_owner,cid,agent,'instagram',case when p_auto and agent is not null then 'ai'else 'human'end,p_sender)returning * into cv;
 end if;
 insert into public.channel_events(id,user_id,provider)values(p_event,p_owner,'instagram');
 insert into public.messages(user_id,conversation_id,role,content,provider_message_id,delivery_status)values(p_owner,cv.id,'user',p_content,p_event,'received')returning id into mid;
 if cv.status='ai'and p_auto then insert into public.channel_jobs(user_id,conversation_id,incoming_id,kind,payload)values(p_owner,cv.id,mid,'instagram.reply',jsonb_build_object('sender',p_sender,'text',p_content));end if;
 return jsonb_build_object('conversationId',cv.id,'contactId',cid,'queued',cv.status='ai'and p_auto);
end $f$;
create or replace function public.workspace_save_reply(p_owner uuid,p_conversation uuid,p_content text)returns uuid language plpgsql security definer set search_path='' as $f$
declare mid uuid;
begin
 if auth.role() is distinct from 'service_role'then raise exception 'SERVICE_ROLE_REQUIRED'using errcode='42501';end if;
 perform 1 from public.conversations c join public.agents a on a.id=c.agent_id and a.user_id=c.user_id where c.id=p_conversation and c.user_id=p_owner and c.status='ai'and a.active for update of c;
 if not found then return null;end if;
 insert into public.messages(user_id,conversation_id,role,content,delivery_status)values(p_owner,p_conversation,'assistant',p_content,'stored')returning id into mid;return mid;
end $f$;
create or replace function public.whatsapp_defer(p_id uuid,p_lease uuid,p_until timestamptz)returns void language plpgsql security definer set search_path='' as $f$
begin
 if auth.role() is distinct from 'service_role'then raise exception 'SERVICE_ROLE_REQUIRED'using errcode='42501';end if;
 update public.whatsapp_jobs set status='retry',available_at=p_until,lease_until=null,attempts=greatest(0,attempts-1),updated_at=now()where id=p_id and lease_token=p_lease and status in('processing','ready');
end $f$;
revoke all on function public.workspace_rate(text,timestamptz,integer),public.workspace_ingest_instagram(uuid,text,text,text,text,boolean,text),public.workspace_save_reply(uuid,uuid,text),public.whatsapp_defer(uuid,uuid,timestamptz)from public,anon,authenticated;
grant execute on function public.workspace_rate(text,timestamptz,integer),public.workspace_ingest_instagram(uuid,text,text,text,text,boolean,text),public.workspace_save_reply(uuid,uuid,text),public.whatsapp_defer(uuid,uuid,timestamptz)to service_role;
commit;
begin;
alter table public.channel_jobs alter column conversation_id drop not null;
alter table public.channel_jobs add column if not exists dedupe_key text;
create unique index if not exists channel_jobs_dedupe_idx on public.channel_jobs(dedupe_key)where dedupe_key is not null;
alter table public.workspace_settings add column if not exists email_followup_since timestamptz;
create or replace function public.workspace_save_section(p_owner uuid,p_section text,p_value jsonb)returns void language plpgsql security definer set search_path=''as $f$
begin
 if auth.role()is distinct from 'service_role'then raise exception 'SERVICE_ROLE_REQUIRED'using errcode='42501';end if;
 if p_section not in('general','whatsapp','email','instagram','widget','security')or jsonb_typeof(p_value)<>'object'then raise exception 'INVALID_SECTION';end if;
 insert into public.workspace_settings(user_id)values(p_owner)on conflict do nothing;
 update public.workspace_settings set email_followup_since=case when p_section='email'and coalesce((p_value->>'autoFollowup')::boolean,false)and not coalesce((config#>>'{email,autoFollowup}')::boolean,false)then now()else email_followup_since end,config=jsonb_set(config,array[p_section],p_value),updated_at=now()where user_id=p_owner;
end $f$;
create or replace function public.workspace_claim_jobs(p_kind text,p_limit integer default 5)returns setof public.channel_jobs language plpgsql security definer set search_path=''as $f$
declare j public.channel_jobs;
begin
 if auth.role()is distinct from 'service_role'then raise exception 'SERVICE_ROLE_REQUIRED'using errcode='42501';end if;
 select * into j from public.channel_jobs q where kind=p_kind and attempts<4 and(status='pending'or status='processing'and lease_until<now())and available_at<=now()
 and not exists(select 1 from public.channel_jobs active where active.id<>q.id and active.conversation_id=q.conversation_id and active.status in('processing','sending')and active.lease_until>now())
 order by created_at for update skip locked limit 1;
 if j.id is null then return;end if;
 if j.conversation_id is not null then
 perform pg_advisory_xact_lock(hashtextextended('channel:'||j.conversation_id::text,0));
 if exists(select 1 from public.channel_jobs where id<>j.id and conversation_id=j.conversation_id and status in('processing','sending')and lease_until>now())then return;end if;
 end if;
 return query update public.channel_jobs set status='processing',attempts=attempts+1,lease_until=now()+interval '90 seconds'where id=j.id returning *;
end $f$;
create or replace function public.workspace_enqueue_email(p_owner uuid,p_conversation uuid,p_request uuid,p_text text,p_payload jsonb)returns uuid language plpgsql security definer set search_path=''as $f$
declare jid uuid;mid uuid;
begin
 if auth.role()is distinct from 'service_role'then raise exception 'SERVICE_ROLE_REQUIRED'using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('mail:'||p_owner::text||p_request::text,0));
 select id into jid from public.channel_jobs where dedupe_key='mail:'||p_owner::text||p_request::text;if jid is not null then return jid;end if;
 perform 1 from public.conversations where id=p_conversation and user_id=p_owner and channel='email'and status='human'for update;if not found then raise exception 'HUMAN_CONVERSATION_REQUIRED';end if;
 insert into public.messages(user_id,conversation_id,role,content,delivery_status)values(p_owner,p_conversation,'human',p_text,'queued')returning id into mid;
 insert into public.channel_jobs(user_id,conversation_id,kind,payload,dedupe_key)values(p_owner,p_conversation,'email.send',p_payload||jsonb_build_object('messageId',mid,'manual',true),'mail:'||p_owner::text||p_request::text)returning id into jid;return jid;
end $f$;
create or replace function public.workspace_followup_candidates(p_owner uuid)returns table(conversation_id uuid,contact_id uuid,email text,anchor_id uuid,anchor_at timestamptz)language sql stable security definer set search_path=''as $f$
 select c.id,p.id,p.email,m.id,m.created_at from public.conversations c join public.contacts p on p.id=c.contact_id and p.user_id=c.user_id join public.workspace_settings s on s.user_id=c.user_id
 join lateral(select id,role,created_at from public.messages where conversation_id=c.id and user_id=c.user_id and delivery_status not in('failed','canceled','uncertain')order by created_at desc,id desc limit 1)m on true
 where auth.role()='service_role'and c.user_id=p_owner and c.channel in('whatsapp','email')and c.status<>'closed'and p.email<>''and m.role in('assistant','human')and m.created_at<now()-interval '24 hours'and m.created_at>=s.email_followup_since
 and not exists(select 1 from public.channel_jobs where dedupe_key='followup:'||m.id::text)
$f$;
revoke all on function public.workspace_enqueue_email(uuid,uuid,uuid,text,jsonb),public.workspace_followup_candidates(uuid)from public,anon,authenticated;
grant execute on function public.workspace_enqueue_email(uuid,uuid,uuid,text,jsonb),public.workspace_followup_candidates(uuid)to service_role;
commit;
