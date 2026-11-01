-- Tom de voz e pesos dos critérios de qualificação por agente. Aditiva: agentes existentes
-- ficam com tom consultivo e pesos iguais (25 cada), que reproduz a média simples usada até aqui.
begin;
alter table public.agents add column if not exists tone text not null default 'consultive'
  check (tone in ('consultive','friendly','formal','specialist'));
alter table public.agents add column if not exists criteria_weights jsonb not null
  default '{"budget":25,"need":25,"authority":25,"timing":25}'::jsonb;
alter table public.agents drop constraint if exists agents_criteria_weights_check;
alter table public.agents add constraint agents_criteria_weights_check check (
  jsonb_typeof(criteria_weights) = 'object'
  and criteria_weights ?& array['budget','need','authority','timing']
  and (criteria_weights - 'budget' - 'need' - 'authority' - 'timing') = '{}'::jsonb
  and jsonb_typeof(criteria_weights->'budget') = 'number' and jsonb_typeof(criteria_weights->'need') = 'number'
  and jsonb_typeof(criteria_weights->'authority') = 'number' and jsonb_typeof(criteria_weights->'timing') = 'number'
  and (criteria_weights->>'budget')::numeric between 0 and 100 and (criteria_weights->>'need')::numeric between 0 and 100
  and (criteria_weights->>'authority')::numeric between 0 and 100 and (criteria_weights->>'timing')::numeric between 0 and 100
  and (criteria_weights->>'budget')::numeric + (criteria_weights->>'need')::numeric
    + (criteria_weights->>'authority')::numeric + (criteria_weights->>'timing')::numeric > 0
);
commit;
