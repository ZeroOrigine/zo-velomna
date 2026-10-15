-- v6: a visitor may read tonight's dream before signing in. kind 'guest' is a dreamer keyed by a browser-held secret
-- (hash stored in agent_key_hash, same column the agents use); it can observe and read, never act, seed, ask, or register.
alter table public.velomna_dreamers drop constraint velomna_dreamers_kind_check;
alter table public.velomna_dreamers add constraint velomna_dreamers_kind_check check (kind = any (array['human'::text,'agent'::text,'echo'::text,'guest'::text]));
comment on column public.velomna_dreamers.kind is 'human (signed in), agent (keyed program), echo (seeded from public dream reports), guest (browser-held key; observe + read only; becomes the human row on first sign-in)';
