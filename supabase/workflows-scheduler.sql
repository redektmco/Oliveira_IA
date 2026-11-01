-- Agendador das automações (workflows). Aplique depois de migrations/202611050008_workflows.sql.
-- Reutiliza o segredo felipa_whatsapp_worker que já está no Supabase Vault (o mesmo de WHATSAPP_WORKER_SECRET).
-- Roda a cada minuto, mas só chama o servidor quando há trabalho: eventos novos, execuções vencidas
-- (inclusive após "Aguardar") ou, a cada 5 minutos, automações agendadas ativas.
-- Não liga as outras rotinas de workspace-scheduler.sql (resumo diário, follow-up de e-mail, retenção).
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create or replace function public.workflow_dispatch_pending() returns bigint language plpgsql security definer set search_path='' as $f$
declare request_id bigint; token text;
begin
 if not exists(select 1 from public.workflow_events where processed_at is null)
  and not exists(select 1 from public.workflow_runs where (status='pending' and available_at<=now()) or (status='running' and lease_until<now()))
  and not (extract(minute from now())::int % 5=0 and exists(select 1 from public.workflows where status='active' and trigger->>'type'='schedule'))
 then return null;end if;
 select decrypted_secret into token from vault.decrypted_secrets where name='felipa_whatsapp_worker' limit 1;
 if token is null then raise exception 'WORKER_SECRET_MISSING';end if;
 select net.http_post(url:='https://ai.v4oliveira.com.br/api/whatsapp-worker?workflows=1',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),body:='{}'::jsonb,timeout_milliseconds:=10000) into request_id;
 return request_id;
end $f$;
revoke all on function public.workflow_dispatch_pending() from public,anon,authenticated;
do $block$ begin
 if exists(select 1 from cron.job where jobname='oliveira_workflows')then perform cron.unschedule('oliveira_workflows');end if;
 perform cron.schedule('oliveira_workflows','* * * * *','select public.workflow_dispatch_pending()');
end $block$;
