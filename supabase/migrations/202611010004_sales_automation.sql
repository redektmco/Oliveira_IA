-- Sales automation: AI booking settings, per-SDR Google Calendar and automatic pipeline entries.
-- Additive and repeatable. Calendar credentials are reachable only by the server (service_role).
begin;

-- Settings section for meeting booking and pipeline automation.
create or replace function public.workspace_save_section(p_owner uuid,p_section text,p_value jsonb)returns void language plpgsql security definer set search_path=''as $f$
begin
 if auth.role()is distinct from 'service_role'then raise exception 'SERVICE_ROLE_REQUIRED'using errcode='42501';end if;
 if p_section not in('general','whatsapp','email','instagram','widget','security','scheduling')or jsonb_typeof(p_value)<>'object'then raise exception 'INVALID_SECTION';end if;
 insert into public.workspace_settings(user_id)values(p_owner)on conflict do nothing;
 update public.workspace_settings set email_followup_since=case when p_section='email'and coalesce((p_value->>'autoFollowup')::boolean,false)and not coalesce((config#>>'{email,autoFollowup}')::boolean,false)then now()else email_followup_since end,config=jsonb_set(config,array[p_section],p_value),updated_at=now()where user_id=p_owner;
end $f$;
revoke all on function public.workspace_save_section(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.workspace_save_section(uuid,text,jsonb) to service_role;

-- One Google Calendar per SDR (workspace member or owner). The refresh token is sealed by the server.
create table if not exists public.calendar_accounts(
 owner_id uuid not null references auth.users(id) on delete cascade,
 member_id uuid not null references auth.users(id) on delete cascade,
 provider text not null default 'google' check(provider='google'),
 email text not null default '' check(char_length(email)<=320),
 secret text not null,
 connected_at timestamptz not null default now(),
 primary key(owner_id,member_id)
);
alter table public.calendar_accounts enable row level security;
alter table public.calendar_accounts force row level security;
revoke all on public.calendar_accounts from anon,authenticated;
grant all on public.calendar_accounts to service_role;

-- Meetings booked by the AI keep their origin, SDR and Google event.
alter table public.meetings add column if not exists source text not null default 'manual';
alter table public.meetings drop constraint if exists meetings_source_check;
alter table public.meetings add constraint meetings_source_check check(source in ('manual','ai'));
alter table public.meetings add column if not exists assigned_to uuid references auth.users(id) on delete set null;
alter table public.meetings add column if not exists calendar_event_id text not null default '' ;
create index if not exists meetings_schedule_idx on public.meetings(user_id,status,starts_at);
create index if not exists deals_contact_idx on public.deals(user_id,contact_id);

-- Every lead that starts a conversation through a channel lands in the pipeline once.
create or replace function public.workspace_channel_deal()returns trigger language plpgsql security definer set search_path=''as $f$
declare lead record;
begin
 if new.contact_id is null or new.channel not in('whatsapp','email','instagram','widget')then return new;end if;
 if coalesce((select(config#>>'{scheduling,createDeals}')::boolean from public.workspace_settings where user_id=new.user_id),true)=false then return new;end if;
 if exists(select 1 from public.deals where user_id=new.user_id and contact_id=new.contact_id)then return new;end if;
 select name,company into lead from public.contacts where user_id=new.user_id and id=new.contact_id;
 if not found then return new;end if;
 insert into public.deals(user_id,contact_id,title,value,stage)
  values(new.user_id,new.contact_id,left(case when btrim(coalesce(lead.company,''))<>''then btrim(lead.name)||' · '||btrim(lead.company)else coalesce(nullif(btrim(lead.name),''),'Lead')end,200),0,'new');
 return new;
end $f$;
revoke all on function public.workspace_channel_deal() from public,anon,authenticated;
drop trigger if exists conversations_channel_deal on public.conversations;
create trigger conversations_channel_deal after insert on public.conversations for each row execute function public.workspace_channel_deal();

commit;
