-- Automações (workflows) no estilo Twenty CRM: gatilho + passos, fila de eventos e histórico de execuções.
-- Aditiva e repetível. Tabelas lidas e escritas somente pelo servidor (service_role), que filtra por workspace;
-- clientes diretos (anon/authenticated) não têm acesso. Os gatilhos de captura nunca bloqueiam a gravação original:
-- qualquer erro dentro deles é descartado, e só gravam evento quando existe automação ativa para aquele objeto.
begin;

create table if not exists public.workflows(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(char_length(name) between 1 and 120),
 description text not null default '' check(char_length(description)<=2000),
 status text not null default 'draft' check(status in ('draft','active','paused')),
 trigger jsonb not null default '{"type":"manual"}'::jsonb,
 steps jsonb not null default '[]'::jsonb,
 created_by uuid references auth.users(id) on delete set null,
 created_via text not null default 'panel' check(created_via in ('panel','assistant')),
 run_count integer not null default 0,
 last_run_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id,id)
);
create index if not exists workflows_status_idx on public.workflows(user_id,status);

create table if not exists public.workflow_runs(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 workflow_id uuid not null,
 status text not null default 'pending' check(status in ('pending','running','completed','failed','stopped')),
 trigger_kind text not null default 'manual',
 record_table text,
 record_id uuid,
 context jsonb not null default '{}'::jsonb,
 log jsonb not null default '[]'::jsonb,
 step_index integer not null default 0,
 error text,
 attempts integer not null default 0,
 dedupe_key text,
 available_at timestamptz not null default now(),
 lease_until timestamptz,
 created_at timestamptz not null default now(),
 finished_at timestamptz,
 foreign key(user_id,workflow_id) references public.workflows(user_id,id) on delete cascade
);
create unique index if not exists workflow_runs_dedupe_idx on public.workflow_runs(dedupe_key);
create index if not exists workflow_runs_queue_idx on public.workflow_runs(status,available_at);
create index if not exists workflow_runs_history_idx on public.workflow_runs(user_id,workflow_id,created_at desc);
create index if not exists workflow_runs_record_idx on public.workflow_runs(user_id,record_id);

create table if not exists public.workflow_events(
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 object text not null,
 op text not null check(op in ('created','updated')),
 record_id uuid not null,
 record jsonb not null,
 previous jsonb,
 processed_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists workflow_events_pending_idx on public.workflow_events(id) where processed_at is null;

do $block$ declare t text; begin
 foreach t in array array['workflows','workflow_runs','workflow_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('alter table public.%I force row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $block$;

-- Captura de eventos. Roda depois da gravação; nunca derruba a transação de quem gravou.
create or replace function public.workflow_capture() returns trigger language plpgsql security definer set search_path='' as $f$
declare
 obj text:=tg_table_name;
 kind text:=case when tg_op='INSERT' then 'created' else 'updated' end;
 ttype text;
begin
 begin
  if obj='messages' then
   if tg_op<>'INSERT' or new.role<>'user' then return null;end if;
   ttype:='message.received';
  else
   ttype:='record.'||kind;
   if tg_op='UPDATE' and to_jsonb(new)=to_jsonb(old) then return null;end if;
  end if;
  if not exists(select 1 from public.workflows w where w.user_id=new.user_id and w.status='active' and w.trigger->>'type'=ttype and (obj='messages' or w.trigger->>'object'=obj)) then return null;end if;
  insert into public.workflow_events(user_id,object,op,record_id,record,previous)
  values(new.user_id,obj,kind,new.id,to_jsonb(new),case when tg_op='UPDATE' then to_jsonb(old) end);
 exception when others then
  return null;
 end;
 return null;
end $f$;
revoke all on function public.workflow_capture() from public,anon,authenticated;

do $block$ declare t text; begin
 foreach t in array array['contacts','deals','meetings','deal_tasks','messages'] loop
  if to_regclass('public.'||t) is not null then
   execute format('drop trigger if exists workflow_capture on public.%I',t);
   execute format('create trigger workflow_capture after insert or update on public.%I for each row execute function public.workflow_capture()',t);
  end if;
 end loop;
end $block$;

-- Fila: eventos são retirados uma única vez; execuções usam lease e voltam se o worker cair.
create or replace function public.workflow_claim_events(p_limit integer default 50) returns setof public.workflow_events language plpgsql security definer set search_path='' as $f$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501';end if;
 return query update public.workflow_events set processed_at=now()
 where id in(select id from public.workflow_events where processed_at is null order by id for update skip locked limit least(greatest(p_limit,1),200)) returning *;
end $f$;
create or replace function public.workflow_claim_runs(p_limit integer default 5) returns setof public.workflow_runs language plpgsql security definer set search_path='' as $f$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501';end if;
 update public.workflow_runs set status='failed',error='A execução foi interrompida várias vezes e foi encerrada.',lease_until=null,finished_at=now()
 where status='running' and lease_until<now() and attempts>=4;
 return query update public.workflow_runs set status='running',attempts=attempts+1,lease_until=now()+interval '120 seconds'
 where id in(select id from public.workflow_runs where ((status='pending' and available_at<=now()) or (status='running' and lease_until<now())) and attempts<4 order by available_at for update skip locked limit least(greatest(p_limit,1),20)) returning *;
end $f$;
revoke all on function public.workflow_claim_events(integer),public.workflow_claim_runs(integer) from public,anon,authenticated;
grant execute on function public.workflow_claim_events(integer),public.workflow_claim_runs(integer) to service_role;

commit;
