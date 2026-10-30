-- Apply administratively after storing felipa_whatsapp_worker in Supabase Vault.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create or replace function public.whatsapp_dispatch_pending() returns bigint language plpgsql security definer set search_path='' as $f$
declare request_id bigint; token text;begin
 if not exists(select 1 from public.whatsapp_jobs where (status in ('queued','ready','retry') and available_at<=now()) or (status in ('processing','sending') and lease_until<now())) then return null;end if;
 select decrypted_secret into token from vault.decrypted_secrets where name='felipa_whatsapp_worker' limit 1;
 if token is null then raise exception 'WORKER_SECRET_MISSING';end if;
 select net.http_post(url:='https://ai.v4oliveira.com.br/api/whatsapp-worker',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),body:='{}'::jsonb,timeout_milliseconds:=10000) into request_id;
 return request_id;
end $f$;
revoke all on function public.whatsapp_dispatch_pending() from public,anon,authenticated;
select cron.schedule('felipa_whatsapp_retry','* * * * *','select public.whatsapp_dispatch_pending()');
