-- CLANCY secure paid-generation flow
-- Run AFTER sql/wallet-sales.sql and sql/midtrans-wallet.sql.
create or replace function public.clancy_create_paid_job(
  p_user_id uuid,
  p_prompt text,
  p_resolution text,
  p_aspect_ratio text,
  p_reference_files jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_balance bigint;
  v_reserved bigint;
  v_job public.generation_jobs%rowtype;
begin
  if p_user_id is null then raise exception 'Login wajib'; end if;
  if length(trim(coalesce(p_prompt,''))) > 5000 then raise exception 'Prompt terlalu panjang'; end if;
  if p_resolution not in ('720p','1080p') then raise exception 'Resolusi tidak valid'; end if;
  if p_aspect_ratio not in ('16:9','9:16') then raise exception 'Rasio tidak valid'; end if;
  if jsonb_typeof(coalesce(p_reference_files,'[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_reference_files,'[]'::jsonb)) > 1 then
    raise exception 'Referensi tidak valid';
  end if;

  insert into public.wallets(user_id) values(p_user_id) on conflict(user_id) do nothing;
  select balance_idr,reserved_idr into v_balance,v_reserved
  from public.wallets where user_id=p_user_id for update;
  if v_balance-v_reserved < 2000 then raise exception 'Saldo tidak cukup. Top up dahulu.'; end if;

  insert into public.generation_jobs(
    user_id,provider,model,resolution,duration_seconds,aspect_ratio,prompt,
    reference_files,customer_price_idr,status
  ) values (
    p_user_id,'nexabot','omni',p_resolution,10,p_aspect_ratio,trim(p_prompt),
    coalesce(p_reference_files,'[]'::jsonb),2000,'queued'
  ) returning * into v_job;

  insert into public.wallet_holds(user_id,job_id,amount_idr,status)
  values(p_user_id,v_job.id,2000,'held');
  update public.wallets set reserved_idr=reserved_idr+2000,updated_at=now()
  where user_id=p_user_id;

  return to_jsonb(v_job);
end;
$$;

revoke all on function public.clancy_create_paid_job(uuid,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.clancy_create_paid_job(uuid,text,text,text,jsonb) to service_role;

-- A profile and empty wallet are created automatically for every new signup.
create or replace function public.clancy_on_auth_user_created()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  insert into public.profiles(user_id,display_name)
  values(new.id,coalesce(new.raw_user_meta_data->>'full_name',split_part(coalesce(new.email,''),'@',1)))
  on conflict(user_id) do nothing;
  insert into public.wallets(user_id) values(new.id) on conflict(user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists clancy_auth_user_created on auth.users;
create trigger clancy_auth_user_created
after insert on auth.users
for each row execute procedure public.clancy_on_auth_user_created();

-- Backfill existing accounts.
insert into public.profiles(user_id,display_name)
select id,coalesce(raw_user_meta_data->>'full_name',split_part(coalesce(email,''),'@',1))
from auth.users on conflict(user_id) do nothing;
insert into public.wallets(user_id)
select id from auth.users on conflict(user_id) do nothing;

-- Never allow browser-side writes to wallet accounting tables.
revoke insert,update,delete on public.wallets,public.wallet_ledger,public.wallet_holds,public.wallet_topups from anon,authenticated;
