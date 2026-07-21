alter table public.ai_analysis_logs
  add column if not exists setup_type text;

create index if not exists ai_analysis_logs_setup_type_outcome_idx
  on public.ai_analysis_logs (setup_type, outcome);

update public.ai_analysis_logs
set setup_type = response_payload->'_meta'->>'setup_type'
where setup_type is null
  and response_payload->'_meta'->>'setup_type' is not null;
