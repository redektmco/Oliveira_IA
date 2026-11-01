-- Opportunity record: owner, forecast fields, tasks, notes and an automatic timeline.
-- Additive and repeatable. Tasks, notes and timeline are written only by the server (service_role);
-- authenticated clients can read them under the same workspace/assignment rules as deals.
begin;

alter table public.deals add column if not exists assigned_to uuid references auth.users(id) on delete set null;
alter table public.deals add column if not exists close_date date;
alter table public.deals add column if not exists probability integer;
alter table public.deals add column if not exists next_step text not null default '';
alter table public.deals add column if not exists lost_reason text not null default '';
alter table public.deals add column if not exists description text not null default '';
alter table public.deals add column if not exists updated_at timestamptz;
alter table public.deals add column if not exists stage_changed_at timestamptz;
alter table public.deals add column if not exists closed_at timestamptz;
-- Write-only attribution for the timeline. The trigger reads and clears it on every write.
alter table public.deals add column if not exists last_actor uuid;
update public.deals set updated_at=created_at where updated_at is null;
update public.deals set stage_changed_at=created_at where stage_changed_at is null;
update public.deals set closed_at=created_at where closed_at is null and stage in ('won','lost');
alter table public.deals alter column updated_at set default now();
alter table public.deals alter column updated_at set not null;
alter table public.deals alter column stage_changed_at set default now();
alter table public.deals alter column stage_changed_at set not null;
alter table public.deals drop constraint if exists deals_probability_check;
alter table public.deals add constraint deals_probability_check check(probability is null or probability between 0 and 100);
alter table public.deals drop constraint if exists deals_next_step_check;
alter table public.deals add constraint deals_next_step_check check(char_length(next_step)<=500);
alter table public.deals drop constraint if exists deals_lost_reason_check;
alter table public.deals add constraint deals_lost_reason_check check(char_length(lost_reason)<=500);
alter table public.deals drop constraint if exists deals_description_check;
alter table public.deals add constraint deals_description_check check(char_length(description)<=12000);
do $c$ begin
 if not exists(select 1 from pg_constraint where conname='deals_user_id_id_key' and conrelid='public.deals'::regclass) then
  alter table public.deals add constraint deals_user_id_id_key unique(user_id,id);
 end if;
end $c$;
create index if not exists deals_assigned_idx on public.deals(user_id,assigned_to);

create table if not exists public.deal_tasks(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 deal_id uuid not null,
 title text not null check(char_length(btrim(title)) between 1 and 300),
 due_at timestamptz,
 done_at timestamptz,
 assigned_to uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 foreign key(user_id,deal_id) references public.deals(user_id,id) on delete cascade
);
create table if not exists public.deal_notes(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 deal_id uuid not null,
 content text not null check(char_length(btrim(content)) between 1 and 12000),
 author text not null default '' check(char_length(author)<=320),
 created_at timestamptz not null default now(),
 foreign key(user_id,deal_id) references public.deals(user_id,id) on delete cascade
);
create table if not exists public.deal_events(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 deal_id uuid not null,
 kind text not null check(kind in ('created','stage','value','owner','close_date')),
 detail jsonb not null default '{}'::jsonb,
 actor_id uuid,
 created_at timestamptz not null default clock_timestamp(),
 foreign key(user_id,deal_id) references public.deals(user_id,id) on delete cascade
);
create index if not exists deal_tasks_deal_idx on public.deal_tasks(user_id,deal_id);
create index if not exists deal_tasks_open_idx on public.deal_tasks(user_id,due_at) where done_at is null;
create index if not exists deal_notes_deal_idx on public.deal_notes(user_id,deal_id,created_at);
create index if not exists deal_events_deal_idx on public.deal_events(user_id,deal_id,created_at);

-- Sellers reach a deal through an assigned contact or by owning the deal itself.
create or replace function public.workspace_deal_access(p_owner uuid,p_deal uuid) returns boolean language sql stable security definer set search_path='' as $f$
 select public.workspace_role(p_owner) in ('admin','manager') or (public.workspace_role(p_owner)='seller' and exists(
  select 1 from public.deals d where d.user_id=p_owner and d.id=p_deal and (d.assigned_to=auth.uid() or exists(select 1 from public.contacts c where c.user_id=p_owner and c.id=d.contact_id and c.assigned_to=auth.uid()))))
$f$;
revoke all on function public.workspace_deal_access(uuid,uuid) from public,anon;
grant execute on function public.workspace_deal_access(uuid,uuid) to authenticated,service_role;

drop policy if exists workspace_read on public.deals;
drop policy if exists workspace_write on public.deals;
create policy workspace_read on public.deals for select to authenticated using(public.workspace_direct_access(user_id) and (public.workspace_contact_access(user_id,contact_id) or (public.workspace_role(user_id)='seller' and assigned_to=auth.uid())));
create policy workspace_write on public.deals for all to authenticated
 using(public.workspace_direct_access(user_id) and (public.workspace_contact_access(user_id,contact_id) or (public.workspace_role(user_id)='seller' and assigned_to=auth.uid())))
 with check(public.workspace_direct_access(user_id) and (public.workspace_contact_access(user_id,contact_id) or (public.workspace_role(user_id)='seller' and assigned_to=auth.uid())));

do $block$ declare t text; begin
 foreach t in array array['deal_tasks','deal_notes','deal_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('alter table public.%I force row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  execute format('drop policy if exists workspace_read on public.%I',t);
  execute format('create policy workspace_read on public.%I for select to authenticated using(public.workspace_direct_access(user_id) and public.workspace_deal_access(user_id,deal_id))',t);
 end loop;
end $block$;

-- Timestamps and timeline. BEFORE keeps derived fields consistent for every writer
-- (panel, AI automation, direct SDK); AFTER records what changed and who changed it.
create or replace function public.deal_before_write() returns trigger language plpgsql security definer set search_path='' as $f$
begin
 perform set_config('oliveira.deal_actor_'||replace(new.id::text,'-',''),coalesce(coalesce(new.last_actor,auth.uid())::text,''),true);
 new.last_actor:=null;
 if tg_op='INSERT' then
  new.updated_at:=now();new.stage_changed_at:=now();
  new.closed_at:=case when new.stage in ('won','lost') then now() else null end;
 else
  new.updated_at:=now();
  if new.stage is distinct from old.stage then
   new.stage_changed_at:=now();
   new.closed_at:=case when new.stage in ('won','lost') then now() else null end;
  end if;
 end if;
 return new;
end $f$;
create or replace function public.deal_after_write() returns trigger language plpgsql security definer set search_path='' as $f$
declare actor uuid:=nullif(current_setting('oliveira.deal_actor_'||replace(new.id::text,'-',''),true),'')::uuid;
begin
 perform set_config('oliveira.deal_actor_'||replace(new.id::text,'-',''),'',true);
 if tg_op='INSERT' then
  insert into public.deal_events(user_id,deal_id,kind,detail,actor_id) values(new.user_id,new.id,'created',jsonb_build_object('stage',new.stage,'value',new.value),actor);
  return new;
 end if;
 if new.stage is distinct from old.stage then insert into public.deal_events(user_id,deal_id,kind,detail,actor_id) values(new.user_id,new.id,'stage',jsonb_build_object('from',old.stage,'to',new.stage,'reason',case when new.stage='lost' then new.lost_reason else '' end),actor);end if;
 if new.value is distinct from old.value then insert into public.deal_events(user_id,deal_id,kind,detail,actor_id) values(new.user_id,new.id,'value',jsonb_build_object('from',old.value,'to',new.value),actor);end if;
 if new.assigned_to is distinct from old.assigned_to then insert into public.deal_events(user_id,deal_id,kind,detail,actor_id) values(new.user_id,new.id,'owner',jsonb_build_object('from',old.assigned_to,'to',new.assigned_to),actor);end if;
 if new.close_date is distinct from old.close_date then insert into public.deal_events(user_id,deal_id,kind,detail,actor_id) values(new.user_id,new.id,'close_date',jsonb_build_object('from',old.close_date,'to',new.close_date),actor);end if;
 return new;
end $f$;
revoke all on function public.deal_before_write(),public.deal_after_write() from public,anon,authenticated;
drop trigger if exists deals_before_write on public.deals;
create trigger deals_before_write before insert or update on public.deals for each row execute function public.deal_before_write();
drop trigger if exists deals_after_write on public.deals;
create trigger deals_after_write after insert or update on public.deals for each row execute function public.deal_after_write();

-- Clients may only add team (human) messages directly. Customer, AI and delivery records come from the server,
-- so a signed-in user cannot forge a conversation turn or rewrite history through the public API.
create or replace function public.messages_client_guard() returns trigger language plpgsql security definer set search_path='' as $f$
begin
 if auth.role() is distinct from 'authenticated' then return new;end if;
 if tg_op='UPDATE' then raise exception 'CLIENT_MESSAGE_IMMUTABLE' using errcode='42501';end if;
 if new.role<>'human' then raise exception 'CLIENT_MESSAGE_ROLE' using errcode='42501';end if;
 return new;
end $f$;
revoke all on function public.messages_client_guard() from public,anon,authenticated;
drop trigger if exists messages_client_guard on public.messages;
create trigger messages_client_guard before insert or update on public.messages for each row execute function public.messages_client_guard();

-- Outbound WhatsApp from the panel: open (or reuse) the thread for a contact and queue a human message.
-- Previously a thread existed only after the contact wrote first, so "Nova conversa" could never reach WhatsApp.
create or replace function public.whatsapp_start_human(p_user uuid,p_instance text,p_contact uuid,p_jid text,p_request uuid,p_text text) returns jsonb language plpgsql security definer set search_path='' as $f$
declare ch public.whatsapp_channels; th public.whatsapp_threads; cv public.conversations; job uuid;
begin
 if (select auth.role()) is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501';end if;
 if p_jid !~ '^[0-9]{8,15}@s.whatsapp.net$' then raise exception 'INVALID_PHONE';end if;
 select * into ch from public.whatsapp_channels where instance=p_instance and user_id=p_user;
 if not found or not ch.enabled then raise exception 'WHATSAPP_NOT_CONNECTED';end if;
 if not exists(select 1 from public.contacts where user_id=p_user and id=p_contact) then raise exception 'CONTACT_NOT_FOUND';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('wa:'||p_instance||':'||p_jid,0));
 select * into th from public.whatsapp_threads where instance=p_instance and remote_jid=p_jid for update;
 if found and th.contact_id<>p_contact then raise exception 'PHONE_OF_OTHER_CONTACT';end if;
 if not found then insert into public.whatsapp_threads(instance,remote_jid,user_id,contact_id) values(p_instance,p_jid,p_user,p_contact) returning * into th;end if;
 select * into cv from public.conversations where id=th.conversation_id and user_id=p_user for update;
 if cv.id is null or cv.status='closed' then
  insert into public.conversations(user_id,contact_id,agent_id,channel,status) values(p_user,p_contact,ch.agent_id,'whatsapp','human') returning * into cv;
  update public.whatsapp_threads set conversation_id=cv.id where instance=p_instance and remote_jid=p_jid;
 elsif cv.status<>'human' then
  update public.conversations set status='human' where id=cv.id;
 end if;
 job:=public.whatsapp_enqueue_human(p_user,cv.id,p_request,p_text);
 return jsonb_build_object('conversationId',cv.id,'jobId',job);
end $f$;
revoke all on function public.whatsapp_start_human(uuid,text,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.whatsapp_start_human(uuid,text,uuid,text,uuid,text) to service_role;

commit;
