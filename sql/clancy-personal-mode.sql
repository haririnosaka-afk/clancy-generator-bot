-- CLANCY personal-only mode: no customer wallet, no sales, no per-video charge.
alter table public.generation_jobs add column if not exists user_id uuid references auth.users(id);
alter table public.generation_jobs add column if not exists provider_usage_tokens bigint;
alter table public.generation_jobs add column if not exists provider_usage jsonb;
create index if not exists generation_jobs_user_created_idx on public.generation_jobs(user_id,created_at desc);

-- Reference images are passed to RelayRouter as public URLs. Keep this bucket limited
-- to generated UUID paths; do not store private documents here.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('clancy-references','clancy-references',true,700000,array['image/png','image/jpeg','image/webp'])
on conflict(id) do update set public=true,file_size_limit=700000,allowed_mime_types=array['image/png','image/jpeg','image/webp'];

-- API writes use the server-side service role. Browser users cannot directly write job records.
revoke insert,update,delete on public.generation_jobs from anon,authenticated;
