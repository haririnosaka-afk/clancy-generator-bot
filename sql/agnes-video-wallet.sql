-- Agnes Video 2.5 Flash wallet-backed job creation
alter table public.generation_jobs add column if not exists user_id uuid references auth.users(id);
alter table public.generation_jobs add column if not exists customer_price_idr bigint not null default 2000;
alter table public.generation_jobs add column if not exists wallet_settled_at timestamptz;
create or replace function public.clancy_create_agnes_job(
 p_user_id uuid,p_prompt text,p_duration_seconds integer,p_aspect_ratio text
) returns jsonb language plpgsql security definer set search_path=public
as $$
declare v_balance bigint;v_reserved bigint;v_job public.generation_jobs%rowtype;
begin
 if p_user_id is null then raise exception 'Login wajib';end if;
 if length(trim(coalesce(p_prompt,'')))>5000 then raise exception 'Prompt terlalu panjang';end if;
 if p_duration_seconds<4 or p_duration_seconds>12 then raise exception 'Durasi harus 4-12 detik';end if;
 if p_aspect_ratio not in ('16:9','9:16','1:1','4:3','3:4','21:9') then raise exception 'Rasio tidak valid';end if;
 insert into public.wallets(user_id) values(p_user_id) on conflict(user_id) do nothing;
 select balance_idr,reserved_idr into v_balance,v_reserved from public.wallets where user_id=p_user_id for update;
 if v_balance-v_reserved<2000 then raise exception 'Saldo tidak cukup. Top up dahulu.';end if;
 insert into public.generation_jobs(user_id,provider,model,resolution,duration_seconds,aspect_ratio,prompt,reference_files,customer_price_idr,status)
 values(p_user_id,'agnes','agnes-video-2.5-flash','720P',p_duration_seconds,p_aspect_ratio,trim(p_prompt),'[]'::jsonb,2000,'queued') returning * into v_job;
 insert into public.wallet_holds(user_id,job_id,amount_idr,status) values(p_user_id,v_job.id,2000,'held');
 update public.wallets set reserved_idr=reserved_idr+2000,updated_at=now() where user_id=p_user_id;
 return to_jsonb(v_job);
end;$$;
revoke all on function public.clancy_create_agnes_job(uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public.clancy_create_agnes_job(uuid,text,integer,text) to service_role;
