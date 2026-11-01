-- Workspaces de clientes criados pela agência e limite de uso do chat de IA.
-- Aditiva e idempotente: não apaga dados, mantém RLS e as funções existentes.
begin;

-- Membros ocultos: a agência acessa o workspace do cliente sem aparecer na equipe dele.
alter table public.workspace_members add column if not exists hidden boolean not null default false;

-- Workspaces de clientes gerenciados pelo painel da agência (somente servidor).
create table if not exists public.platform_workspaces (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 name text not null check(char_length(btrim(name)) between 1 and 120),
 owner_email text not null default '',
 created_by uuid references auth.users(id) on delete set null,
 chat_window_micros bigint check(chat_window_micros is null or chat_window_micros between 10000 and 1000000000),
 chat_daily_micros bigint check(chat_daily_micros is null or chat_daily_micros between 10000 and 1000000000),
 created_at timestamptz not null default now()
);

-- Janela móvel de 5 horas por pessoa em cada workspace (estilo Claude).
create table if not exists public.ai_chat_windows (
 user_id uuid not null references auth.users(id) on delete cascade,
 actor_id uuid not null references auth.users(id) on delete cascade,
 started_at timestamptz not null,
 primary key(user_id,actor_id)
);

do $block$ declare t text; begin
 foreach t in array array['platform_workspaces','ai_chat_windows'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('alter table public.%I force row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $block$;

-- Tipo de uso: chat (Assistente e Playground, com limite), sdr (atendimento automático, sem limite),
-- automation (passo "Gerar com IA") e summary (resumos no painel).
alter table public.ai_usage add column if not exists kind text not null default 'sdr';
alter table public.ai_usage drop constraint if exists ai_usage_kind_check;
alter table public.ai_usage add constraint ai_usage_kind_check check(kind in ('chat','sdr','automation','summary'));
alter table public.ai_usage add column if not exists actor_id uuid references auth.users(id) on delete set null;
-- Custo equivalente em micro-dólares (preço público por milhão de tokens: Haiku 4.5 1/5, Sonnet 4.6 3/15).
alter table public.ai_usage add column if not exists cost_micros bigint generated always as (
 case when model like 'claude-sonnet%' then input_tokens::bigint*3+output_tokens::bigint*15 else input_tokens::bigint+output_tokens::bigint*5 end
) stored;
create index if not exists ai_usage_chat_idx on public.ai_usage(user_id,actor_id,created_at) where kind='chat';

create or replace function public.ai_chat_usage(p_user_id uuid,p_actor uuid,p_timezone text default 'America/Sao_Paulo')
returns jsonb language plpgsql stable security definer set search_path='' as $f$
declare
 tz text:=coalesce(nullif(p_timezone,''),'America/Sao_Paulo');
 local_day timestamp; day_start timestamptz; day_end timestamptz; w timestamptz; wu bigint:=0; du bigint:=0; pending bigint:=0;
begin
 if (select auth.role()) is distinct from 'service_role' then
  raise exception using errcode='42501',message='SERVICE_ROLE_REQUIRED';
 end if;
 begin local_day:=pg_catalog.date_trunc('day',pg_catalog.now() at time zone tz);
 exception when others then tz:='America/Sao_Paulo';local_day:=pg_catalog.date_trunc('day',pg_catalog.now() at time zone tz); end;
 day_start:=local_day at time zone tz;day_end:=(local_day+interval '1 day') at time zone tz;
 select started_at into w from public.ai_chat_windows where user_id=p_user_id and actor_id=p_actor;
 if w is not null and w<=pg_catalog.now()-interval '5 hours' then w:=null; end if;
 if w is not null then
  select coalesce(sum(cost_micros),0) into wu from public.ai_usage where user_id=p_user_id and actor_id=p_actor and kind='chat' and created_at>=w;
 end if;
 select coalesce(sum(cost_micros),0) into du from public.ai_usage where user_id=p_user_id and actor_id=p_actor and kind='chat' and created_at>=day_start;
 select count(*) into pending from public.ai_usage where user_id=p_user_id and actor_id=p_actor and kind='chat' and status='pending' and created_at>pg_catalog.now()-interval '2 minutes';
 return pg_catalog.jsonb_build_object('window_start',w,'window_end',w+interval '5 hours','window_used',wu,'day_used',du,'day_start',day_start,'day_end',day_end,'pending',pending);
end
$f$;
revoke all on function public.ai_chat_usage(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.ai_chat_usage(uuid,uuid,text) to service_role;

-- Reserva serializada por pessoa. Somente o tipo chat tem limite; o SDR IA não é bloqueado.
create or replace function public.reserve_ai_usage(
 p_user_id uuid,p_model text,p_kind text,p_actor uuid default null,
 p_window_budget bigint default null,p_daily_budget bigint default null,p_timezone text default 'America/Sao_Paulo'
) returns uuid language plpgsql security definer set search_path='' as $f$
declare rid uuid; u jsonb;
begin
 if (select auth.role()) is distinct from 'service_role' then
  raise exception using errcode='42501',message='SERVICE_ROLE_REQUIRED';
 end if;
 if p_user_id is null or p_kind is null or p_kind not in ('chat','sdr','automation','summary') then
  raise exception using errcode='22023',message='INVALID_AI_RESERVATION';
 end if;
 if p_model is null or p_model not in ('claude-haiku-5-5','claude-haiku-4-5','claude-haiku-4-5-20251001','claude-sonnet-4-6') then
  raise exception using errcode='22023',message='INVALID_AI_MODEL';
 end if;
 if p_kind='chat' then
  if p_actor is null or coalesce(p_window_budget,0)<1 or coalesce(p_daily_budget,0)<1 then
   raise exception using errcode='22023',message='INVALID_AI_RESERVATION';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('oliveira-ai-chat:'||p_user_id::text||':'||p_actor::text,0));
  u:=public.ai_chat_usage(p_user_id,p_actor,p_timezone);
  if (u->>'pending')::bigint>=2 then raise exception using errcode='P0001',message='AI_CHAT_BUSY'; end if;
  if (u->>'day_used')::bigint>=p_daily_budget then raise exception using errcode='P0001',message='AI_CHAT_DAILY_LIMIT'; end if;
  if u->>'window_start' is null then
   insert into public.ai_chat_windows(user_id,actor_id,started_at) values(p_user_id,p_actor,pg_catalog.now())
    on conflict(user_id,actor_id) do update set started_at=excluded.started_at;
  elsif (u->>'window_used')::bigint>=p_window_budget then
   raise exception using errcode='P0001',message='AI_CHAT_WINDOW_LIMIT';
  end if;
 end if;
 insert into public.ai_usage(user_id,model,status,kind,actor_id)
  values(p_user_id,p_model,'pending',p_kind,case when p_kind='chat' then p_actor else null end) returning id into rid;
 return rid;
end
$f$;
revoke all on function public.reserve_ai_usage(uuid,text,text,uuid,bigint,bigint,text) from public,anon,authenticated;
grant execute on function public.reserve_ai_usage(uuid,text,text,uuid,bigint,bigint,text) to service_role;

commit;
