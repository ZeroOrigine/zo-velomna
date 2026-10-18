-- VELOMNA catch-and-act: each figure answers to ONE of the four acts (touch, speak to, follow, open).
-- verb_idx is the index into the API's ACT_VERBS; reactions holds four lines, one per verb, in that order.
-- The right act's line reveals what the figure is; the other three are the figure refusing, with a hint. Neither leaves the door until acted on.
alter table public.velomna_latents add column if not exists verb_idx smallint;
alter table public.velomna_latents add column if not exists reactions jsonb;
alter table public.velomna_readings drop constraint if exists velomna_readings_mode_check;
alter table public.velomna_readings add constraint velomna_readings_mode_check check (mode = any (array['written'::text, 'choice'::text, 'act'::text]));
