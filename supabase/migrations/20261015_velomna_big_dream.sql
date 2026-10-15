-- VELOMNA: the Big Dream. One night a day opens at a fixed local hour whether or not anyone is here.
-- The hour and zone live in zo_config (VELOMNA_BIG_DREAM_HOUR, VELOMNA_BIG_DREAM_TZ); the API reads them with a 60 s cache.
alter table public.velomna_nights add column if not exists kind text not null default 'night';
alter table public.velomna_nights drop constraint if exists velomna_nights_kind_check;
alter table public.velomna_nights add constraint velomna_nights_kind_check check (kind in ('night', 'big'));
create index if not exists velomna_nights_kind_idx on public.velomna_nights (matrix_id, kind, started_at desc);
insert into public.zo_config (key, value) values ('VELOMNA_BIG_DREAM_HOUR', '21'), ('VELOMNA_BIG_DREAM_TZ', 'America/Toronto') on conflict (key) do nothing;
