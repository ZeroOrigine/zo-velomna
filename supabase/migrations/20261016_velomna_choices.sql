-- VELOMNA: reading by click. Each figure carries four plain-word options (one true, three decoys); the true index is never served.
-- A reading records its mode: 'written' (free text, judged by the oracle, 5 per figure, full pay) or 'choice' (one click per figure, half pay).
alter table public.velomna_latents add column if not exists choices jsonb;
alter table public.velomna_latents add column if not exists answer_idx smallint;
alter table public.velomna_readings add column if not exists mode text not null default 'written';
alter table public.velomna_readings drop constraint if exists velomna_readings_mode_check;
alter table public.velomna_readings add constraint velomna_readings_mode_check check (mode in ('written', 'choice'));
create index if not exists velomna_readings_mode_idx on public.velomna_readings (dreamer_id, figure_id, mode);
