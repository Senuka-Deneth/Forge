-- Atomic per-user rate limiting, pg_cron housekeeping, and prediction scoring schema.

create table if not exists public.ai_rate_limit_events (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  event_type text not null default 'ai_analysis',
  created_at timestamptz not null default now(),
  constraint ai_rate_limit_events_user_id_format check (user_id ~ '^[a-zA-Z0-9_.@-]{3,128}$')
);

create index if not exists idx_ai_rate_limit_events_lookup
  on public.ai_rate_limit_events (user_id, event_type, created_at desc);

create index if not exists idx_ai_rate_limit_events_created_at
  on public.ai_rate_limit_events (created_at);

alter table public.ai_rate_limit_events enable row level security;

create or replace function public.consume_ai_analysis_quota(
  p_user_id text,
  p_window interval,
  p_max int,
  p_event_type text default 'ai_analysis'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if p_max < 1 then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id || ':' || coalesce(p_event_type, 'ai_analysis')));

  select count(*)::int into v_count
  from public.ai_rate_limit_events
  where user_id = p_user_id
    and event_type = coalesce(p_event_type, 'ai_analysis')
    and created_at > now() - p_window;

  if v_count >= p_max then
    return false;
  end if;

  insert into public.ai_rate_limit_events (user_id, event_type)
  values (p_user_id, coalesce(p_event_type, 'ai_analysis'));

  return true;
end;
$$;

revoke all on function public.consume_ai_analysis_quota(text, interval, int, text) from public;
grant execute on function public.consume_ai_analysis_quota(text, interval, int, text) to service_role;

-- Outcome scoring columns (Phase 3.1)
alter table public.ai_analysis_logs
  add column if not exists evaluated_at timestamptz,
  add column if not exists outcome text,
  add column if not exists bars_to_outcome integer,
  add column if not exists mfe numeric,
  add column if not exists mae numeric,
  add column if not exists realized_r numeric;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ai_analysis_logs_outcome_valid'
  ) then
    alter table public.ai_analysis_logs
      add constraint ai_analysis_logs_outcome_valid check (
        outcome is null or outcome in ('target_hit', 'stop_hit', 'expired', 'invalid', 'pending')
      );
  end if;
end $$;

create index if not exists idx_ai_analysis_logs_pending_eval
  on public.ai_analysis_logs (created_at)
  where status = 'success' and evaluated_at is null;

-- Short-TTL analysis response cache (Phase 3.5)
create table if not exists public.ai_analysis_cache (
  cache_key text primary key,
  response_payload jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint ai_analysis_cache_payload_is_object check (jsonb_typeof(response_payload) = 'object')
);

create index if not exists idx_ai_analysis_cache_expires
  on public.ai_analysis_cache (expires_at);

alter table public.ai_analysis_cache enable row level security;

-- pg_cron + pg_net (reused by cache GC and scoring cron)
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Hourly purge of expired market_cache rows (Phase 1.7 S5)
select cron.unschedule(jobid)
from cron.job
where jobname = 'purge-expired-market-cache';

select cron.schedule(
  'purge-expired-market-cache',
  '0 * * * *',
  $$delete from public.market_cache where expires_at < now()$$
);

-- Hourly prediction scoring via edge function (Phase 3.1)
select cron.unschedule(jobid)
from cron.job
where jobname = 'score-ai-predictions-hourly';

select cron.schedule(
  'score-ai-predictions-hourly',
  '15 * * * *',
  $$
  select net.http_post(
    url := coalesce(
      nullif(current_setting('app.settings.functions_base_url', true), ''),
      'http://host.docker.internal:54321/functions/v1'
    ) || '/score-predictions',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', coalesce(nullif(current_setting('app.settings.cron_secret', true), ''), 'local-dev-cron-secret')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- Prune old rate-limit events (keep 7 days)
select cron.unschedule(jobid)
from cron.job
where jobname = 'prune-ai-rate-limit-events';

select cron.schedule(
  'prune-ai-rate-limit-events',
  '30 3 * * *',
  $$delete from public.ai_rate_limit_events where created_at < now() - interval '7 days'$$
);
