create extension if not exists pgcrypto;

create table if not exists public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'queued'
    check (status in ('queued','submitted','processing','succeeded','failed','blocked')),
  provider text not null default 'sunnyside-telegram',
  model text not null,
  resolution text not null,
  duration_seconds integer not null,
  aspect_ratio text not null,
  prompt text not null,
  reference_files jsonb not null default '[]'::jsonb,
  provider_task_id text,
  result_url text,
  result_storage_path text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists generation_jobs_created_at_idx
  on public.generation_jobs (created_at desc);
