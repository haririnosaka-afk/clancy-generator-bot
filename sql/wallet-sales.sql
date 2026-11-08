-- CLANCY wallet & sales foundation
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance_idr bigint not null default 0 check (balance_idr >= 0),
  reserved_idr bigint not null default 0 check (reserved_idr >= 0),
  updated_at timestamptz not null default now(),
  check (reserved_idr <= balance_idr)
);
create table if not exists public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  amount_idr bigint not null,
  entry_type text not null check (entry_type in ('topup','generate_charge','refund','admin_adjustment')),
  reference_id uuid,
  note text,
  created_at timestamptz not null default now(),
  unique(entry_type, reference_id)
);
create table if not exists public.topup_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  amount_idr bigint not null check (amount_idr >= 2000),
  payment_method text not null default 'manual',
  proof_url text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  admin_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create table if not exists public.wallet_holds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  job_id uuid not null unique,
  amount_idr bigint not null check (amount_idr > 0),
  status text not null default 'held' check (status in ('held','captured','released')),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
alter table public.generation_jobs add column if not exists user_id uuid references auth.users(id);
alter table public.generation_jobs add column if not exists customer_price_idr bigint not null default 2000;
alter table public.generation_jobs add column if not exists wallet_settled_at timestamptz;

create or replace function public.clancy_is_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.profiles where user_id=auth.uid() and is_admin=true); $$;

create or replace function public.clancy_wallet_hold(p_job_id uuid, p_amount_idr bigint default 2000)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare v_user uuid := auth.uid(); v_balance bigint; v_reserved bigint;
begin
 if v_user is null then raise exception 'Login wajib'; end if;
 if p_amount_idr <> 2000 then raise exception 'Harga generate tidak valid'; end if;
 insert into public.wallets(user_id) values(v_user) on conflict do nothing;
 select balance_idr,reserved_idr into v_balance,v_reserved from public.wallets where user_id=v_user for update;
 if v_balance-v_reserved < p_amount_idr then raise exception 'Saldo tidak cukup'; end if;
 insert into public.wallet_holds(user_id,job_id,amount_idr) values(v_user,p_job_id,p_amount_idr);
 update public.wallets set reserved_idr=reserved_idr+p_amount_idr,updated_at=now() where user_id=v_user;
 return jsonb_build_object('ok',true,'held_idr',p_amount_idr);
end; $$;

create or replace function public.clancy_settle_wallet(p_job_id uuid, p_success boolean)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare h public.wallet_holds%rowtype;
begin
 select * into h from public.wallet_holds where job_id=p_job_id for update;
 if not found then return jsonb_build_object('ok',true,'settled',false,'reason','no_hold'); end if;
 if h.status <> 'held' then return jsonb_build_object('ok',true,'settled',false,'reason','already_settled'); end if;
 if p_success then
   update public.wallets set balance_idr=balance_idr-h.amount_idr,reserved_idr=reserved_idr-h.amount_idr,updated_at=now() where user_id=h.user_id;
   insert into public.wallet_ledger(user_id,amount_idr,entry_type,reference_id,note)
   values(h.user_id,-h.amount_idr,'generate_charge',h.job_id,'Omni 1.2 berhasil');
   update public.wallet_holds set status='captured',settled_at=now() where id=h.id;
 else
   update public.wallets set reserved_idr=reserved_idr-h.amount_idr,updated_at=now() where user_id=h.user_id;
   update public.wallet_holds set status='released',settled_at=now() where id=h.id;
 end if;
 return jsonb_build_object('ok',true,'settled',true,'charged',p_success,'amount_idr',h.amount_idr);
end; $$;

create or replace function public.clancy_request_topup(p_amount_idr bigint, p_method text default 'manual', p_proof_url text default null)
returns uuid language plpgsql security definer set search_path=public
as $$
declare v_id uuid;
begin
 if auth.uid() is null then raise exception 'Login wajib'; end if;
 if p_amount_idr < 2000 then raise exception 'Minimal top up Rp2.000'; end if;
 insert into public.topup_requests(user_id,amount_idr,payment_method,proof_url)
 values(auth.uid(),p_amount_idr,p_method,p_proof_url) returning id into v_id;
 return v_id;
end; $$;

create or replace function public.clancy_review_topup(p_topup_id uuid, p_approve boolean, p_note text default null)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare t public.topup_requests%rowtype;
begin
 if not public.clancy_is_admin() then raise exception 'Admin only'; end if;
 select * into t from public.topup_requests where id=p_topup_id for update;
 if not found or t.status <> 'pending' then raise exception 'Top up tidak ditemukan atau sudah diproses'; end if;
 update public.topup_requests set status=case when p_approve then 'approved' else 'rejected' end,admin_note=p_note,reviewed_at=now() where id=t.id;
 if p_approve then
   insert into public.wallets(user_id) values(t.user_id) on conflict do nothing;
   update public.wallets set balance_idr=balance_idr+t.amount_idr,updated_at=now() where user_id=t.user_id;
   insert into public.wallet_ledger(user_id,amount_idr,entry_type,reference_id,note)
   values(t.user_id,t.amount_idr,'topup',t.id,'Top up disetujui admin');
 end if;
 return jsonb_build_object('ok',true,'status',case when p_approve then 'approved' else 'rejected' end);
end; $$;

alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.wallet_ledger enable row level security;
alter table public.topup_requests enable row level security;
alter table public.wallet_holds enable row level security;
create policy "profiles own or admin read" on public.profiles for select using (user_id=auth.uid() or public.clancy_is_admin());
create policy "wallet own or admin read" on public.wallets for select using (user_id=auth.uid() or public.clancy_is_admin());
create policy "ledger own or admin read" on public.wallet_ledger for select using (user_id=auth.uid() or public.clancy_is_admin());
create policy "topup own or admin read" on public.topup_requests for select using (user_id=auth.uid() or public.clancy_is_admin());
create policy "holds own or admin read" on public.wallet_holds for select using (user_id=auth.uid() or public.clancy_is_admin());
revoke all on function public.clancy_wallet_hold(uuid,bigint) from public;
revoke all on function public.clancy_settle_wallet(uuid,boolean) from public;
revoke all on function public.clancy_review_topup(uuid,boolean,text) from public;
grant execute on function public.clancy_wallet_hold(uuid,bigint) to authenticated;
grant execute on function public.clancy_settle_wallet(uuid,boolean) to service_role;
grant execute on function public.clancy_request_topup(bigint,text,text) to authenticated;
grant execute on function public.clancy_review_topup(uuid,boolean,text) to authenticated;
