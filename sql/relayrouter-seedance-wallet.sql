-- RelayRouter.ai Seedance 2.0 / Fast / Mini / 2.5 integration
alter table public.generation_jobs add column if not exists provider_usage_tokens bigint;
alter table public.generation_jobs add column if not exists provider_usage jsonb;
alter table public.generation_jobs add column if not exists wallet_settled_at timestamptz;
alter table public.generation_jobs add column if not exists user_id uuid references auth.users(id);
alter table public.generation_jobs add column if not exists customer_price_idr bigint not null default 2000;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('clancy-references','clancy-references',true,700000,array['image/png','image/jpeg','image/webp'])
on conflict(id) do update set public=true,file_size_limit=700000,allowed_mime_types=array['image/png','image/jpeg','image/webp'];

create or replace function public.clancy_create_seedance_job(
 p_user_id uuid,p_model text,p_resolution text,p_duration_seconds integer,
 p_aspect_ratio text,p_prompt text,p_customer_price_idr bigint default 2000
) returns jsonb language plpgsql security definer set search_path=public
as $$
declare v_balance bigint;v_reserved bigint;v_job public.generation_jobs%rowtype;
begin
 if p_user_id is null then raise exception 'Login wajib';end if;
 if p_model not in ('doubao-seedance-2-0-260128','doubao-seedance-2-0-fast-260128','doubao-seedance-2-0-mini-260615','doubao-seedance-2-5-260628') then raise exception 'Model Seedance tidak dikenal';end if;
 if p_duration_seconds<4 or p_duration_seconds>case when p_model='doubao-seedance-2-5-260628' then 30 else 15 end then raise exception 'Durasi tidak didukung model';end if;
 if p_resolution not in ('480p','720p','1080p','4k') then raise exception 'Resolusi tidak valid';end if;
 if p_customer_price_idr<>2000 then raise exception 'Harga generate tidak valid';end if;
 if length(trim(coalesce(p_prompt,'')))>5000 then raise exception 'Prompt terlalu panjang';end if;
 insert into public.wallets(user_id) values(p_user_id) on conflict(user_id) do nothing;
 select balance_idr,reserved_idr into v_balance,v_reserved from public.wallets where user_id=p_user_id for update;
 if v_balance-v_reserved<2000 then raise exception 'Saldo tidak cukup. Top up dahulu.';end if;
 insert into public.generation_jobs(user_id,provider,model,resolution,duration_seconds,aspect_ratio,prompt,reference_files,customer_price_idr,status)
 values(p_user_id,'relayrouter',p_model,p_resolution,p_duration_seconds,p_aspect_ratio,trim(coalesce(p_prompt,'')),'[]'::jsonb,2000,'queued') returning * into v_job;
 insert into public.wallet_holds(user_id,job_id,amount_idr,status) values(p_user_id,v_job.id,2000,'held');
 update public.wallets set reserved_idr=reserved_idr+2000,updated_at=now() where user_id=p_user_id;
 return to_jsonb(v_job);
end;$$;
revoke all on function public.clancy_create_seedance_job(uuid,text,text,integer,text,text,bigint) from public,anon,authenticated;
grant execute on function public.clancy_create_seedance_job(uuid,text,text,integer,text,text,bigint) to service_role;
