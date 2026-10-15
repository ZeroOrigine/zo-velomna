-- VELOMNA: a Big Dream may carry a picture painted from its own scene (Cloudinary public id such as velomna/night/7).
-- Painted from the manifest the Censor built (already condensed from at least three seeds, no names), never from a seed as typed.
-- The painter is armed only when CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET exist in zo_config; the founder inserts those himself.
alter table public.velomna_scenes add column if not exists picture_id text;
insert into public.zo_config (key, value) values ('CLOUDINARY_CLOUD_NAME', 'doemifuxr') on conflict (key) do nothing;
