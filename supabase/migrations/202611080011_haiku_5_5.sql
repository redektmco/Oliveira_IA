-- Claude Haiku 5.5 (claude-haiku-5-5) como modelo padrão. Aditiva e idempotente.
-- Agentes em Haiku 4.5 passam para Haiku 5.5; Sonnet 4.6 continua disponível.
begin;

alter table public.agents drop constraint if exists agents_model_check;
alter table public.agents add constraint agents_model_check
 check (model in ('claude-haiku-5-5','claude-haiku-4-5','claude-haiku-4-5-20251001','claude-sonnet-4-6'));
alter table public.agents alter column model set default 'claude-haiku-5-5';
update public.agents set model='claude-haiku-5-5' where model in ('claude-haiku-4-5','claude-haiku-4-5-20251001');

-- Custo em micro-dólares por preço público por milhão de tokens:
-- Haiku 5.5: 0,10/0,50 (prompt até 100 mil tokens) e 0,50/2,50 acima; Haiku 4.5: 1/5; Sonnet 4.6: 3/15.
alter table public.ai_usage drop column if exists cost_micros;
alter table public.ai_usage add column cost_micros bigint generated always as (
 case
  when model like 'claude-sonnet%' then input_tokens::bigint*3+output_tokens::bigint*15
  when model='claude-haiku-5-5' and input_tokens>100000 then (input_tokens::bigint*5+output_tokens::bigint*25+9)/10
  when model='claude-haiku-5-5' then (input_tokens::bigint+output_tokens::bigint*5+9)/10
  else input_tokens::bigint+output_tokens::bigint*5
 end
) stored;

create or replace function public.reserve_ai_request(p_user_id uuid,p_model text,p_daily_limit integer default 50)
returns uuid language plpgsql security definer set search_path='' as $function$
declare
 reservation_id uuid; used_today bigint;
 day_start timestamptz:=pg_catalog.date_trunc('day',pg_catalog.now() at time zone 'UTC') at time zone 'UTC';
begin
 if (select auth.role()) is distinct from 'service_role' then
  raise exception using errcode='42501',message='SERVICE_ROLE_REQUIRED';
 end if;
 if p_user_id is null or p_daily_limit is null or p_daily_limit<1 or p_daily_limit>10000 then
  raise exception using errcode='22023',message='INVALID_AI_RESERVATION';
 end if;
 if p_model is null or p_model not in ('claude-haiku-5-5','claude-haiku-4-5','claude-haiku-4-5-20251001','claude-sonnet-4-6') then
  raise exception using errcode='22023',message='INVALID_AI_MODEL';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('oliveira-ai:'||p_user_id::text,0));
 select count(*) into used_today from public.ai_usage where user_id=p_user_id and created_at>=day_start and created_at<day_start+interval '1 day';
 if used_today>=p_daily_limit then raise exception using errcode='P0001',message='AI_DAILY_LIMIT_REACHED'; end if;
 insert into public.ai_usage(user_id,model,status) values(p_user_id,p_model,'pending') returning id into reservation_id;
 return reservation_id;
end
$function$;
revoke all on function public.reserve_ai_request(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.reserve_ai_request(uuid,text,integer) to service_role;

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
