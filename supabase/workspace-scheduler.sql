-- Run after 202610310003_workspace.sql; reuses the private worker secret already in Vault.
-- Supabase must have pg_cron, pg_net and the felipa_whatsapp_worker Vault entry.
do $block$ begin
 if exists(select 1 from cron.job where jobname='oliveira_workspace_automations')then perform cron.unschedule('oliveira_workspace_automations');end if;
 perform cron.schedule('oliveira_workspace_automations','*/5 * * * *',$job$
 select net.http_post(
  url:='https://ai.v4oliveira.com.br/api/whatsapp-worker?automation=1',
  headers:=jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='felipa_whatsapp_worker'),'Content-Type','application/json'),
  body:='{}'::jsonb,timeout_milliseconds:=60000
 );
 $job$);
end $block$;
