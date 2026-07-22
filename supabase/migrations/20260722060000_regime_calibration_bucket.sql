-- Calibrate by setup_type x regime rather than setup_type alone.
--
-- The same setup behaves very differently across regimes: a trend_continuation_long in a trending
-- market and the same setup in volatile chop are not the same bet, so pooling their outcomes into
-- one hit rate produces a base rate that describes neither. scripts/backtest.ts has always bucketed
-- by `${setupType}|${regime}`; this brings the live calibration path in line with it.
alter table public.ai_analysis_logs
  add column if not exists regime text;

alter table public.ai_analysis_logs
  drop constraint if exists ai_analysis_logs_regime_valid;

alter table public.ai_analysis_logs
  add constraint ai_analysis_logs_regime_valid check (
    regime is null or regime in ('trending', 'ranging', 'volatile_chop')
  );

-- Calibration reads are always (setup_type, regime, outcome) over evaluated rows.
create index if not exists ai_analysis_logs_setup_regime_outcome_idx
  on public.ai_analysis_logs (setup_type, regime, outcome);

-- Backfill from the stored payload so existing scored history is usable immediately rather than
-- restarting the 20-sample calibration threshold from zero.
update public.ai_analysis_logs
set regime = response_payload->'market_regime'->>'regime'
where regime is null
  and response_payload->'market_regime'->>'regime' in ('trending', 'ranging', 'volatile_chop');
