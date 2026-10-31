begin;

alter table public.contacts
  add column if not exists job_title text not null default '' check (char_length(job_title) <= 150),
  add column if not exists city text not null default '' check (char_length(city) <= 150),
  add column if not exists owner_name text not null default '' check (char_length(owner_name) <= 150),
  add column if not exists tags text[] not null default '{}' check (cardinality(tags) <= 20 and char_length(array_to_string(tags, ',')) <= 1000),
  add column if not exists files jsonb not null default '[]' check (jsonb_typeof(files) = 'array' and jsonb_array_length(files) <= 20 and octet_length(files::text) <= 50000),
  add column if not exists triage jsonb,
  add column if not exists triage_updated_at timestamptz,
  add column if not exists triage_message_count integer not null default 0,
  add column if not exists crm_revision bigint not null default 0;

-- AI provenance is server-owned. Every edit invalidates in-flight analyses.
create or replace function public.guard_crm_profile() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select auth.role()) = 'authenticated' then
    if tg_op = 'INSERT' then
      if new.triage is not null or new.triage_updated_at is not null or new.triage_message_count <> 0 then
        raise exception using errcode = '42501', message = 'SERVER_TRIAGE_REQUIRED';
      end if;
    elsif new.triage is distinct from old.triage or new.triage_updated_at is distinct from old.triage_updated_at
      or new.triage_message_count is distinct from old.triage_message_count then
      raise exception using errcode = '42501', message = 'SERVER_TRIAGE_REQUIRED';
    end if;
  end if;
  new.crm_revision := case when tg_op = 'INSERT' then 0 else old.crm_revision + 1 end;
  return new;
end $$;
drop trigger if exists guard_crm_profile on public.contacts;
create trigger guard_crm_profile before insert or update on public.contacts for each row execute function public.guard_crm_profile();

-- A human reply/deletion also invalidates any summary currently being generated.
create or replace function public.invalidate_message_triage() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and row(new.content, new.role, new.conversation_id) is not distinct from row(old.content, old.role, old.conversation_id) then return null; end if;
  if tg_op in ('UPDATE', 'DELETE') then
    update public.contacts set crm_revision = crm_revision + 1
    where user_id = old.user_id and id in (select contact_id from public.conversations where id = old.conversation_id and user_id = old.user_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    update public.contacts set crm_revision = crm_revision + 1
    where user_id = new.user_id and id in (select contact_id from public.conversations where id = new.conversation_id and user_id = new.user_id);
  end if;
  return null;
end $$;
drop trigger if exists invalidate_message_triage on public.messages;
create trigger invalidate_message_triage after insert or update or delete on public.messages for each row execute function public.invalidate_message_triage();

create or replace function public.append_triaged_turn(
  p_user_id uuid, p_conversation_id uuid, p_contact_id uuid, p_expected_revision bigint,
  p_user_content text, p_assistant_content text, p_triage jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare current_revision bigint; linked_contact uuid; total_messages integer;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  -- Follow the conversation -> contact lock order used by inbound message ingestion.
  select contact_id into linked_contact from public.conversations
    where id = p_conversation_id and user_id = p_user_id for update;
  if not found or linked_contact is distinct from p_contact_id then
    raise exception using errcode = 'P0001', message = 'CRM_CHANGED';
  end if;
  select crm_revision into current_revision from public.contacts
    where id = p_contact_id and user_id = p_user_id for update;
  if not found or p_expected_revision is null or current_revision <> p_expected_revision then
    raise exception using errcode = 'P0001', message = 'CRM_CHANGED';
  end if;
  if p_triage is null or jsonb_typeof(p_triage) <> 'object'
    or coalesce(p_triage->>'status', '') not in ('qualifying', 'qualified', 'unqualified')
    or coalesce((p_triage->>'score')::integer, -1) not between 0 and 100
    or coalesce(char_length(p_triage->>'summary'), 0) not between 1 and 1800
    or coalesce(char_length(p_triage->>'next_action'), 0) not between 1 and 500
    or coalesce(jsonb_typeof(p_triage->'criteria'), '') <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_TRIAGE';
  end if;
  perform public.append_ai_turn(p_user_id, p_conversation_id, p_user_content, p_assistant_content);
  select count(*) into total_messages from public.messages m join public.conversations c on c.id = m.conversation_id and c.user_id = m.user_id
    where c.contact_id = p_contact_id and c.user_id = p_user_id;
  update public.contacts set triage = p_triage, score = (p_triage->>'score')::integer,
    status = p_triage->>'status', triage_updated_at = pg_catalog.clock_timestamp(), triage_message_count = total_messages
    where id = p_contact_id and user_id = p_user_id;
end $$;
revoke all on function public.append_triaged_turn(uuid, uuid, uuid, bigint, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.append_triaged_turn(uuid, uuid, uuid, bigint, text, text, jsonb) to service_role;
revoke all on function public.guard_crm_profile(), public.invalidate_message_triage() from public, anon, authenticated;

-- Preserve the existing WhatsApp queue, lease and handoff protocol. Only validated
-- customer-facing reply text enters the outbox; the analysis stays in the CRM.
create or replace function public.whatsapp_save_triaged_reply(
  p_id uuid, p_lease uuid, p_contact_id uuid, p_expected_revision bigint, p_reply text, p_triage jsonb
) returns boolean language plpgsql security definer set search_path = '' as $$
declare job public.whatsapp_jobs; linked_contact uuid; current_revision bigint; saved boolean; total_messages integer;
begin
  if (select auth.role()) is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select * into job from public.whatsapp_jobs where id=p_id and lease_token=p_lease and status='processing' for update;
  if not found then return false; end if;
  select contact_id into linked_contact from public.conversations where id=job.conversation_id and user_id=job.user_id for update;
  if not found or linked_contact is distinct from p_contact_id then raise exception 'CRM_CHANGED'; end if;
  select crm_revision into current_revision from public.contacts where id=p_contact_id and user_id=job.user_id for update;
  if not found or p_expected_revision is null or current_revision <> p_expected_revision then raise exception 'CRM_CHANGED'; end if;
  if p_triage is null or jsonb_typeof(p_triage) <> 'object'
    or coalesce(p_triage->>'status', '') not in ('qualifying', 'qualified', 'unqualified')
    or coalesce((p_triage->>'score')::integer, -1) not between 0 and 100
    or coalesce(char_length(p_triage->>'summary'), 0) not between 1 and 1800
    or coalesce(char_length(p_triage->>'next_action'), 0) not between 1 and 500
    or coalesce(jsonb_typeof(p_triage->'criteria'), '') <> 'object' then raise exception 'INVALID_TRIAGE'; end if;
  saved := public.whatsapp_save_reply(p_id,p_lease,p_reply);
  if not saved then return false; end if;
  select count(*) into total_messages from public.messages m join public.conversations c on c.id=m.conversation_id and c.user_id=m.user_id
    where c.contact_id=p_contact_id and c.user_id=job.user_id;
  update public.contacts set triage=p_triage, score=(p_triage->>'score')::integer, status=p_triage->>'status',
    triage_updated_at=pg_catalog.clock_timestamp(), triage_message_count=total_messages
    where id=p_contact_id and user_id=job.user_id;
  return true;
end $$;
revoke all on function public.whatsapp_save_triaged_reply(uuid,uuid,uuid,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.whatsapp_save_triaged_reply(uuid,uuid,uuid,bigint,text,jsonb) to service_role;
commit;
