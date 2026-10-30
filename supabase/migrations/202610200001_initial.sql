-- Oliveira IA: a private commercial workspace per authenticated user.
-- Apply through the Supabase SQL editor (postgres role) or `supabase db push`.
begin;

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  email text not null default '' check (char_length(email) <= 320),
  phone text not null default '' check (char_length(phone) <= 50),
  company text not null default '' check (char_length(company) <= 200),
  source text not null default 'Manual' check (char_length(source) <= 100),
  score integer not null default 0 check (score between 0 and 100),
  status text not null default 'new' check (status in ('new', 'qualifying', 'qualified', 'unqualified')),
  notes text not null default '' check (char_length(notes) <= 12000),
  created_at timestamptz not null default now(),
  unique (user_id, id)
);

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  company text not null default '' check (char_length(company) <= 200),
  system_prompt text not null default '' check (char_length(system_prompt) <= 12000),
  greeting text not null default '' check (char_length(greeting) <= 2000),
  model text not null default 'claude-haiku-4-5-20251001'
    check (model in ('claude-haiku-4-5', 'claude-haiku-4-5-20251001', 'claude-sonnet-4-6')),
  active boolean not null default true,
  qualification_threshold integer not null default 75 check (qualification_threshold between 0 and 100),
  created_at timestamptz not null default now(),
  unique (user_id, id)
);

create table if not exists public.knowledge (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  content text not null check (char_length(btrim(content)) between 1 and 50000),
  created_at timestamptz not null default now()
);

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  contact_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  value numeric(14,2) not null default 0 check (value between 0 and 999999999999.99),
  stage text not null default 'new'
    check (stage in ('new', 'qualifying', 'qualified', 'meeting', 'proposal', 'won', 'lost')),
  created_at timestamptz not null default now(),
  foreign key (user_id, contact_id) references public.contacts(user_id, id) on delete restrict
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  contact_id uuid,
  agent_id uuid,
  channel text not null default 'web' check (channel in ('web', 'whatsapp')),
  status text not null default 'ai' check (status in ('ai', 'human', 'closed')),
  created_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, contact_id) references public.contacts(user_id, id) on delete restrict,
  foreign key (user_id, agent_id) references public.agents(user_id, id) on delete restrict
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  conversation_id uuid not null,
  role text not null check (role in ('user', 'assistant', 'human')),
  content text not null check (char_length(btrim(content)) between 1 and 20000),
  created_at timestamptz not null default now(),
  foreign key (user_id, conversation_id) references public.conversations(user_id, id) on delete cascade
);

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  contact_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  starts_at timestamptz not null,
  duration integer not null default 30 check (duration between 5 and 480),
  location text not null default '' check (char_length(location) <= 2000),
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  foreign key (user_id, contact_id) references public.contacts(user_id, id) on delete restrict
);

-- Only the server may create/complete usage entries. Client-supplied token counts
-- or deletes would otherwise let a user reset their daily allowance.
create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  model text not null check (char_length(model) between 1 and 100),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  created_at timestamptz not null default now()
);

create index if not exists contacts_user_created_idx on public.contacts (user_id, created_at desc);
create index if not exists agents_user_created_idx on public.agents (user_id, created_at desc);
create index if not exists knowledge_user_created_idx on public.knowledge (user_id, created_at desc);
create index if not exists deals_user_stage_idx on public.deals (user_id, stage);
create index if not exists deals_contact_idx on public.deals (user_id, contact_id);
create index if not exists conversations_user_created_idx on public.conversations (user_id, created_at desc);
create index if not exists conversations_contact_idx on public.conversations (user_id, contact_id);
create index if not exists conversations_agent_idx on public.conversations (user_id, agent_id);
create index if not exists messages_conversation_created_idx on public.messages (user_id, conversation_id, created_at);
create index if not exists meetings_user_starts_idx on public.meetings (user_id, starts_at);
create index if not exists meetings_contact_idx on public.meetings (user_id, contact_id);
create index if not exists ai_usage_user_created_idx on public.ai_usage (user_id, created_at desc);

do $policies$
declare
  table_name text;
begin
  foreach table_name in array array['contacts', 'agents', 'knowledge', 'deals', 'conversations', 'messages', 'meetings']
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
    execute format('drop policy if exists own_rows on public.%I', table_name);
    execute format(
      'create policy own_rows on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      table_name
    );
  end loop;
end
$policies$;

alter table public.ai_usage enable row level security;
alter table public.ai_usage force row level security;
revoke all on public.ai_usage from anon, authenticated;
grant select on public.ai_usage to authenticated;
grant all on public.ai_usage to service_role;
drop policy if exists own_usage on public.ai_usage;
create policy own_usage on public.ai_usage for select to authenticated
  using ((select auth.uid()) = user_id);

-- A transaction-scoped lock serializes reservations for each user across all
-- serverless instances. All attempts count, including failed provider requests.
create or replace function public.reserve_ai_request(
  p_user_id uuid,
  p_model text,
  p_daily_limit integer default 50
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  reservation_id uuid;
  used_today bigint;
  day_start timestamptz := pg_catalog.date_trunc('day', pg_catalog.now() at time zone 'UTC') at time zone 'UTC';
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_user_id is null or p_daily_limit is null or p_daily_limit < 1 or p_daily_limit > 10000 then
    raise exception using errcode = '22023', message = 'INVALID_AI_RESERVATION';
  end if;
  if p_model is null or p_model not in ('claude-haiku-4-5', 'claude-haiku-4-5-20251001', 'claude-sonnet-4-6') then
    raise exception using errcode = '22023', message = 'INVALID_AI_MODEL';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('oliveira-ai:' || p_user_id::text, 0));
  select count(*) into used_today from public.ai_usage
    where user_id = p_user_id and created_at >= day_start and created_at < day_start + interval '1 day';
  if used_today >= p_daily_limit then
    raise exception using errcode = 'P0001', message = 'AI_DAILY_LIMIT_REACHED';
  end if;
  insert into public.ai_usage (user_id, model, status)
    values (p_user_id, p_model, 'pending') returning id into reservation_id;
  return reservation_id;
end
$function$;

revoke all on function public.reserve_ai_request(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.reserve_ai_request(uuid, text, integer) to service_role;

-- Recheck handoff state while holding the conversation lock. If the owner
-- assumed/closed a conversation during the provider request, no AI turn is
-- appended. A failed second insert also rolls back the first message.
create or replace function public.append_ai_turn(
  p_user_id uuid,
  p_conversation_id uuid,
  p_user_content text,
  p_assistant_content text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  conversation_status text;
  conversation_channel text;
  message_time timestamptz;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_user_content is null or char_length(btrim(p_user_content)) not between 1 and 4000
    or p_assistant_content is null or char_length(btrim(p_assistant_content)) not between 1 and 16000 then
    raise exception using errcode = '22023', message = 'INVALID_AI_TURN';
  end if;

  select status, channel into conversation_status, conversation_channel
    from public.conversations where id = p_conversation_id and user_id = p_user_id for update;
  if not found or conversation_status <> 'ai' or conversation_channel <> 'web' then
    raise exception using errcode = 'P0001', message = 'CONVERSATION_NOT_AI';
  end if;

  select greatest(pg_catalog.clock_timestamp(), coalesce(max(created_at) + interval '1 millisecond', 'epoch'::timestamptz))
    into message_time from public.messages where conversation_id = p_conversation_id and user_id = p_user_id;
  insert into public.messages (user_id, conversation_id, role, content, created_at) values
    (p_user_id, p_conversation_id, 'user', p_user_content, message_time),
    (p_user_id, p_conversation_id, 'assistant', p_assistant_content, message_time + interval '1 millisecond');
end
$function$;

revoke all on function public.append_ai_turn(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.append_ai_turn(uuid, uuid, text, text) to service_role;

commit;
