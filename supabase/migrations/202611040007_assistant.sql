-- Assistente de IA da tela inicial: histórico de conversas por pessoa.
-- Aditiva e repetível. Lida e escrita somente pelo servidor (service_role), que filtra por workspace
-- e autor; clientes diretos (anon/authenticated) não têm acesso. Nada aqui apaga dados existentes.
begin;

create table if not exists public.assistant_threads(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 author_id uuid not null references auth.users(id) on delete cascade,
 title text not null default 'Nova conversa' check(char_length(title) between 1 and 200),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(owner_id,id)
);
create table if not exists public.assistant_messages(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 thread_id uuid not null,
 role text not null check(role in ('user','assistant')),
 content text not null check(char_length(content) between 1 and 40000),
 actions jsonb not null default '[]'::jsonb,
 created_at timestamptz not null default clock_timestamp(),
 foreign key(owner_id,thread_id) references public.assistant_threads(owner_id,id) on delete cascade
);
create index if not exists assistant_threads_author_idx on public.assistant_threads(owner_id,author_id,updated_at desc);
create index if not exists assistant_messages_thread_idx on public.assistant_messages(owner_id,thread_id,created_at);

do $block$ declare t text; begin
 foreach t in array array['assistant_threads','assistant_messages'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('alter table public.%I force row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $block$;

commit;
