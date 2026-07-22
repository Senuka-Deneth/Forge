-- Account-level sizing inputs.
--
-- R-multiples are the unit for everything downstream (calibration, EV, expectancy, risk of ruin),
-- and they only mean something once 1R is a real amount of money. Until now the journal took a
-- hand-typed `size`, so every R in the system was self-reported. These columns let the sizer derive
-- quantity from the account instead.
--
-- Equity is nullable on purpose: a user who does not want their balance in the database still gets
-- every other feature, and the sizer simply asks for equity per session instead.

alter table public.risk_settings
  add column if not exists account_equity numeric,
  add column if not exists risk_per_trade_pct numeric not null default 1,
  add column if not exists max_leverage numeric not null default 1,
  add column if not exists exchange_leverage numeric,
  add column if not exists ruin_tolerance_pct numeric not null default 1;

do $$
begin
  -- Guard rails on the guard rails. A negative or absurd risk percentage is a typo, not a strategy;
  -- 25% per trade ruins a positive-expectancy account with near certainty.
  if not exists (
    select 1 from pg_constraint where conname = 'risk_settings_equity_positive'
  ) then
    alter table public.risk_settings
      add constraint risk_settings_equity_positive
      check (account_equity is null or account_equity > 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'risk_settings_risk_pct_sane'
  ) then
    alter table public.risk_settings
      add constraint risk_settings_risk_pct_sane
      check (risk_per_trade_pct > 0 and risk_per_trade_pct <= 25);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'risk_settings_leverage_sane'
  ) then
    alter table public.risk_settings
      add constraint risk_settings_leverage_sane
      check (max_leverage >= 1 and max_leverage <= 125);
  end if;

  -- Nullable because "I have not told Forge what my exchange is set to" is a real state, and it is
  -- not the same as 1×. Null means the liquidation estimate assumes the whole account backs the
  -- position; a number means the trader posted isolated margin at that leverage.
  if not exists (
    select 1 from pg_constraint where conname = 'risk_settings_exchange_leverage_sane'
  ) then
    alter table public.risk_settings
      add constraint risk_settings_exchange_leverage_sane
      check (exchange_leverage is null or (exchange_leverage >= 1 and exchange_leverage <= 125));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'risk_settings_ruin_tolerance_sane'
  ) then
    alter table public.risk_settings
      add constraint risk_settings_ruin_tolerance_sane
      check (ruin_tolerance_pct > 0 and ruin_tolerance_pct <= 50);
  end if;
end
$$;

comment on column public.risk_settings.account_equity is
  'Quote-currency account equity used to size positions. Null means the sizer asks per session.';
comment on column public.risk_settings.risk_per_trade_pct is
  'Percent of equity risked per trade. The fractional-Kelly suggestion is advisory; this is the number actually used.';
comment on column public.risk_settings.max_leverage is
  'Hard leverage ceiling. 1 means spot — the sizer will shrink a position rather than exceed this.';
comment on column public.risk_settings.exchange_leverage is
  'Leverage actually selected on the exchange, which decides where liquidation sits. Not the same as max_leverage, which is the ceiling the sizer respects. Null means unknown.';
comment on column public.risk_settings.ruin_tolerance_pct is
  'Acceptable probability of ruin, in percent, that solveMaxRiskPct targets when suggesting a maximum size.';
