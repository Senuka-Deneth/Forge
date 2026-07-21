-- Trade journal: PostgREST-direct CRUD with DB-side validation and PnL computation
create table if not exists public.trade_journal (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  symbol text not null,
  side text not null,
  status text not null default 'open',
  entry numeric not null,
  size numeric not null,
  stop numeric,
  target numeric,
  exit_price numeric,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  fees numeric not null default 0,
  pnl numeric,
  r_multiple numeric,
  notes text,
  analysis_id uuid references public.ai_analysis_logs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trade_journal_symbol_format check (symbol ~ '^[A-Z0-9]{5,20}$'),
  constraint trade_journal_side_valid check (side in ('long', 'short')),
  constraint trade_journal_status_valid check (status in ('open', 'closed', 'cancelled')),
  constraint trade_journal_entry_positive check (entry > 0),
  constraint trade_journal_size_positive check (size > 0),
  constraint trade_journal_stop_positive check (stop is null or stop > 0),
  constraint trade_journal_target_positive check (target is null or target > 0),
  constraint trade_journal_exit_positive check (exit_price is null or exit_price > 0),
  constraint trade_journal_fees_non_negative check (fees >= 0),
  constraint trade_journal_notes_length check (notes is null or char_length(notes) <= 4000),
  constraint trade_journal_long_geometry check (
    side <> 'long'
    or (
      (stop is null or stop < entry)
      and (target is null or target > entry)
    )
  ),
  constraint trade_journal_short_geometry check (
    side <> 'short'
    or (
      (stop is null or stop > entry)
      and (target is null or target < entry)
    )
  ),
  constraint trade_journal_closed_requires_exit check (
    status <> 'closed'
    or (exit_price is not null and closed_at is not null)
  ),
  constraint trade_journal_open_no_exit check (
    status <> 'open'
    or (exit_price is null and closed_at is null)
  ),
  constraint trade_journal_cancelled_no_exit check (
    status <> 'cancelled'
    or (exit_price is null and pnl is null and r_multiple is null)
  )
);

create index if not exists idx_trade_journal_user_opened
  on public.trade_journal (user_id, opened_at desc);

create index if not exists idx_trade_journal_analysis_id
  on public.trade_journal (analysis_id)
  where analysis_id is not null;

create or replace function public.compute_trade_journal_close()
returns trigger
language plpgsql
as $$
declare
  risk_amount numeric;
  gross_pnl numeric;
begin
  if new.status = 'closed' and new.exit_price is not null then
    if new.side = 'long' then
      risk_amount := (new.entry - new.stop) * new.size;
      gross_pnl := (new.exit_price - new.entry) * new.size;
    else
      risk_amount := (new.stop - new.entry) * new.size;
      gross_pnl := (new.entry - new.exit_price) * new.size;
    end if;

    new.pnl := gross_pnl - coalesce(new.fees, 0);

    if new.stop is not null and risk_amount > 0 then
      new.r_multiple := new.pnl / risk_amount;
    else
      new.r_multiple := null;
    end if;

    if new.closed_at is null then
      new.closed_at := now();
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_trade_journal_compute_close on public.trade_journal;

create trigger trg_trade_journal_compute_close
before insert or update on public.trade_journal
for each row
execute function public.compute_trade_journal_close();

drop trigger if exists trg_trade_journal_updated_at on public.trade_journal;

create trigger trg_trade_journal_updated_at
before update on public.trade_journal
for each row
execute function public.set_updated_at();

alter table public.trade_journal enable row level security;

drop policy if exists "Users can read own journal" on public.trade_journal;
drop policy if exists "Users can insert own journal" on public.trade_journal;
drop policy if exists "Users can update own journal" on public.trade_journal;
drop policy if exists "Users can delete own journal" on public.trade_journal;

create policy "Users can read own journal"
on public.trade_journal
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can insert own journal"
on public.trade_journal
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can update own journal"
on public.trade_journal
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can delete own journal"
on public.trade_journal
for delete
to authenticated
using (user_id = auth.uid());

create or replace function public.get_journal_analysis_outcomes(journal_ids uuid[])
returns table (
  journal_id uuid,
  analysis_id uuid,
  outcome text,
  realized_r numeric,
  trade_plan jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    j.id as journal_id,
    j.analysis_id,
    l.outcome,
    l.realized_r,
    l.response_payload -> 'trade_plan' as trade_plan
  from public.trade_journal j
  join public.ai_analysis_logs l on l.id = j.analysis_id
  where j.user_id = auth.uid()
    and j.id = any(journal_ids)
    and j.analysis_id is not null;
$$;

revoke all on function public.get_journal_analysis_outcomes(uuid[]) from public;
grant execute on function public.get_journal_analysis_outcomes(uuid[]) to authenticated;
