-- Phase 4 risk settings + Phase 5 watchlist/alerts + Phase 6 baselines and journal edge columns.
-- Same RLS shape as trade_journal: users own their rows; service role used by edge functions.

-- ---------------------------------------------------------------------------
-- risk_settings (per-user guardrail limits + override log)
-- ---------------------------------------------------------------------------
create table if not exists public.risk_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  daily_loss_limit_r numeric not null default 3,
  max_open_r numeric not null default 5,
  cooldown_losses integer not null default 3,
  cooldown_minutes integer not null default 120,
  updated_at timestamptz not null default now(),
  constraint risk_settings_daily_loss_positive check (daily_loss_limit_r > 0),
  constraint risk_settings_max_open_positive check (max_open_r > 0),
  constraint risk_settings_cooldown_losses_positive check (cooldown_losses >= 1),
  constraint risk_settings_cooldown_minutes_positive check (cooldown_minutes >= 1)
);

create table if not exists public.risk_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  analysis_id uuid references public.ai_analysis_logs (id) on delete set null,
  guardrail_id text not null,
  reason text,
  created_at timestamptz not null default now(),
  constraint risk_overrides_guardrail_id_length check (char_length(guardrail_id) between 3 and 64),
  constraint risk_overrides_reason_length check (reason is null or char_length(reason) <= 1000)
);

create index if not exists idx_risk_overrides_user_created
  on public.risk_overrides (user_id, created_at desc);

alter table public.risk_settings enable row level security;
alter table public.risk_overrides enable row level security;

create policy risk_settings_select_own on public.risk_settings
  for select using (auth.uid() = user_id);
create policy risk_settings_upsert_own on public.risk_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy risk_overrides_select_own on public.risk_overrides
  for select using (auth.uid() = user_id);
create policy risk_overrides_insert_own on public.risk_overrides
  for insert with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- watchlist
-- ---------------------------------------------------------------------------
create table if not exists public.watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null,
  interval text not null default '4h',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint watchlist_symbol_format check (symbol ~ '^[A-Z0-9]{5,20}$'),
  constraint watchlist_interval_valid check (interval in ('1m','3m','5m','15m','30m','1h','2h','4h','6h','8h','12h','1d','3d','1w','1M')),
  constraint watchlist_user_symbol_interval unique (user_id, symbol, interval)
);

create index if not exists idx_watchlist_user_enabled
  on public.watchlist (user_id, enabled);

alter table public.watchlist enable row level security;

create policy watchlist_select_own on public.watchlist
  for select using (auth.uid() = user_id);
create policy watchlist_insert_own on public.watchlist
  for insert with check (auth.uid() = user_id);
create policy watchlist_update_own on public.watchlist
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy watchlist_delete_own on public.watchlist
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- price_alerts
-- ---------------------------------------------------------------------------
create table if not exists public.price_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null,
  level numeric not null,
  direction text not null,
  source text not null default 'manual',
  armed boolean not null default true,
  triggered_at timestamptz,
  analysis_id uuid references public.ai_analysis_logs (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint price_alerts_symbol_format check (symbol ~ '^[A-Z0-9]{5,20}$'),
  constraint price_alerts_direction_valid check (direction in ('above', 'below')),
  constraint price_alerts_source_valid check (source in (
    'manual', 'entry_zone', 'invalidation', 'confluence_cluster', 'sweep'
  )),
  constraint price_alerts_level_positive check (level > 0)
);

create index if not exists idx_price_alerts_armed
  on public.price_alerts (armed, symbol)
  where armed = true;

create index if not exists idx_price_alerts_user
  on public.price_alerts (user_id, created_at desc);

alter table public.price_alerts enable row level security;

create policy price_alerts_select_own on public.price_alerts
  for select using (auth.uid() = user_id);
create policy price_alerts_insert_own on public.price_alerts
  for insert with check (auth.uid() = user_id);
create policy price_alerts_update_own on public.price_alerts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy price_alerts_delete_own on public.price_alerts
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- setup_baselines (backtest-seeded priors for cold-start calibration)
-- ---------------------------------------------------------------------------
create table if not exists public.setup_baselines (
  id uuid primary key default gen_random_uuid(),
  setup_type text not null,
  regime text not null,
  symbol text not null,
  interval text not null,
  n integer not null,
  hit_rate numeric not null,
  avg_r numeric,
  generated_at timestamptz not null default now(),
  constraint setup_baselines_n_positive check (n >= 0),
  constraint setup_baselines_hit_rate_range check (hit_rate >= 0 and hit_rate <= 1),
  constraint setup_baselines_regime_valid check (regime in ('trending', 'ranging', 'volatile_chop')),
  constraint setup_baselines_unique unique (setup_type, regime, symbol, interval)
);

create index if not exists idx_setup_baselines_lookup
  on public.setup_baselines (setup_type, regime);

-- Readable by authenticated users (shared priors); writable only via service role.
alter table public.setup_baselines enable row level security;

create policy setup_baselines_select_authenticated on public.setup_baselines
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Journal edge columns (Phase 6 personal-edge analytics)
-- ---------------------------------------------------------------------------
alter table public.trade_journal
  add column if not exists plan_adherence text,
  add column if not exists behavioral_tags text[] not null default '{}',
  add column if not exists mae numeric,
  add column if not exists mfe numeric;

alter table public.trade_journal
  drop constraint if exists trade_journal_plan_adherence_valid;

alter table public.trade_journal
  add constraint trade_journal_plan_adherence_valid check (
    plan_adherence is null or plan_adherence in (
      'followed', 'deviated_entry', 'deviated_stop', 'deviated_exit'
    )
  );
