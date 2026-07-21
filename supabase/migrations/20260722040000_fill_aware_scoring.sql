-- Fill-aware scoring: no_fill outcome, fill bar tracking, scoring version
alter table public.ai_analysis_logs
  drop constraint if exists ai_analysis_logs_outcome_valid;

alter table public.ai_analysis_logs
  add constraint ai_analysis_logs_outcome_valid check (
    outcome is null or outcome in ('target_hit', 'stop_hit', 'expired', 'no_fill', 'invalid', 'pending')
  );

alter table public.ai_analysis_logs
  add column if not exists filled_at_bar integer,
  add column if not exists scoring_version integer;
