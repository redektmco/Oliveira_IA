-- WhatsApp messages signed with the sender name ("*Felipe:* Bom dia", "*Felipa:* Olá!").
-- The worker writes the signed text to whatsapp_jobs.reply before sending, so the provider echo still matches.
-- Additive and repeatable; existing callers keep working because the new parameter has a default.
begin;
alter table public.whatsapp_jobs add column if not exists signature text not null default '';
alter table public.whatsapp_jobs drop constraint if exists whatsapp_jobs_signature_check;
alter table public.whatsapp_jobs add constraint whatsapp_jobs_signature_check check(char_length(signature)<=80);

drop function if exists public.whatsapp_enqueue_human(uuid,uuid,uuid,text);
create or replace function public.whatsapp_enqueue_human(p_user uuid,p_conversation uuid,p_request uuid,p_text text,p_signature text default '') returns uuid language plpgsql security definer set search_path='' as $f$
declare th public.whatsapp_threads; mid uuid; jid uuid; begin
 if (select auth.role()) is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
 if char_length(btrim(p_text)) not between 1 and 4000 then raise exception 'INVALID_REPLY';end if;
 select id into jid from public.whatsapp_jobs where user_id=p_user and event_id=p_request::text and kind='human';if found then return jid;end if;
 select t.* into th from public.whatsapp_threads t join public.conversations c on c.id=t.conversation_id where t.conversation_id=p_conversation and t.user_id=p_user and c.status='human' for update of c;
 if not found then raise exception 'HUMAN_CONVERSATION_REQUIRED';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('wa:'||th.instance||':'||th.remote_jid,0));
 select id into jid from public.whatsapp_jobs where user_id=p_user and event_id=p_request::text and kind='human';if found then return jid;end if;
 insert into public.messages(user_id,conversation_id,role,content,delivery_status) values(p_user,p_conversation,'human',p_text,'queued') returning id into mid;
 insert into public.whatsapp_jobs(user_id,instance,remote_jid,event_id,conversation_id,outgoing_id,kind,body,reply,status,signature) values(p_user,th.instance,th.remote_jid,p_request::text,p_conversation,mid,'human',p_text,p_text,'ready',left(coalesce(p_signature,''),80)) returning id into jid;
 return jid;
end $f$;
revoke all on function public.whatsapp_enqueue_human(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.whatsapp_enqueue_human(uuid,uuid,uuid,text,text) to service_role;

drop function if exists public.whatsapp_start_human(uuid,text,uuid,text,uuid,text);
create or replace function public.whatsapp_start_human(p_user uuid,p_instance text,p_contact uuid,p_jid text,p_request uuid,p_text text,p_signature text default '') returns jsonb language plpgsql security definer set search_path='' as $f$
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
 job:=public.whatsapp_enqueue_human(p_user,cv.id,p_request,p_text,p_signature);
 return jsonb_build_object('conversationId',cv.id,'jobId',job);
end $f$;
revoke all on function public.whatsapp_start_human(uuid,text,uuid,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.whatsapp_start_human(uuid,text,uuid,text,uuid,text,text) to service_role;
commit;
