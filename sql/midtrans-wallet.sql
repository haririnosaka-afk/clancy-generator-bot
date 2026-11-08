-- CLANCY: Midtrans QRIS wallet top-up
-- Run after sql/wallet-sales.sql in Supabase SQL Editor.
create table if not exists public.wallet_topups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id text not null unique,
  amount_idr bigint not null check (amount_idr in (10000,20000,50000,100000,200000)),
  status text not null default 'pending' check (status in ('pending','paid','failed')),
  snap_token text,
  redirect_url text,
  midtrans_transaction_id text unique,
  failure_reason text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists wallet_topups_user_created_idx on public.wallet_topups(user_id, created_at desc);
alter table public.wallet_topups enable row level security;
drop policy if exists "topups own read" on public.wallet_topups;
create policy "topups own read" on public.wallet_topups for select using (user_id=auth.uid() or public.clancy_is_admin());

create or replace function public.clancy_midtrans_settle(p_order_id text, p_transaction_id text, p_paid_amount bigint)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare t public.wallet_topups%rowtype;
begin
  select * into t from public.wallet_topups where order_id=p_order_id for update;
  if not found then raise exception 'Top up tidak ditemukan'; end if;
  if t.status='paid' then return jsonb_build_object('ok',true,'credited',false,'reason','already_paid'); end if;
  if t.status<>'pending' then raise exception 'Top up bukan pending'; end if;
  if t.amount_idr<>p_paid_amount then raise exception 'Nominal pembayaran tidak cocok'; end if;
  insert into public.wallets(user_id) values(t.user_id) on conflict do nothing;
  update public.wallets set balance_idr=balance_idr+t.amount_idr,updated_at=now() where user_id=t.user_id;
  insert into public.wallet_ledger(user_id,amount_idr,entry_type,reference_id,note)
    values(t.user_id,t.amount_idr,'topup',t.id,'Midtrans QRIS settlement '||p_order_id)
    on conflict(entry_type,reference_id) do nothing;
  update public.wallet_topups set status='paid',midtrans_transaction_id=p_transaction_id,paid_at=now() where id=t.id;
  return jsonb_build_object('ok',true,'credited',true,'amount_idr',t.amount_idr);
end; $$;

create or replace function public.clancy_midtrans_fail(p_order_id text, p_status text)
returns jsonb language plpgsql security definer set search_path=public
as $$
begin
  update public.wallet_topups set status='failed',failure_reason='Midtrans: '||left(p_status,40)
  where order_id=p_order_id and status='pending';
  return jsonb_build_object('ok',true);
end; $$;
revoke all on function public.clancy_midtrans_settle(text,text,bigint) from public, anon, authenticated;
revoke all on function public.clancy_midtrans_fail(text,text) from public, anon, authenticated;
grant execute on function public.clancy_midtrans_settle(text,text,bigint) to service_role;
grant execute on function public.clancy_midtrans_fail(text,text) to service_role;
