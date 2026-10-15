-- VELOMNA alpha · the core action table, the six agent citizens, the first sleeper's echoes (applied 2026-10-15)
create table if not exists public.velomna_resolutions (id uuid primary key default gen_random_uuid(), user_id uuid not null, figure_id uuid not null references public.velomna_figures(id), night int, created_at timestamptz not null default now());
alter table public.velomna_resolutions enable row level security;
create trigger velomna_resolutions_append_only before update or delete on public.velomna_resolutions for each row execute function public.velomna_refuse_mutation();
-- six agent citizens (Philosopher, Architect, Ethicist, Builder, Scientist, Storyteller), operator 'zeroorigine', driven by /agents/tick
-- one echo dreamer 'the first sleeper' with 24 echo seeds of common human dream themes (see the applied migration in Supabase for the texts)

-- 2026-10-15 brakes (applied as migration velomna_brakes_and_privileges)
-- insert into zo_config(key,value) values ('VELOMNA_PAUSE','false'), ('VELOMNA_DAILY_BUDGET_USD','5');
-- revoke all privileges on all velomna_* tables and the velomna_balances view from anon, authenticated;
