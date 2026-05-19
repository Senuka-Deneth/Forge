create extension if not exists pgcrypto;

create table if not exists public.user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_preferences_user_id_format check (user_id ~ '^[a-zA-Z0-9_.@-]{3,128}$'),
  constraint user_preferences_is_object check (jsonb_typeof(preferences) = 'object')
);

create index if not exists idx_user_preferences_user_id on public.user_preferences (user_id);

create table if not exists public.market_cache (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  interval text not null,
  limit_count integer not null,
  candles jsonb not null,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint market_cache_symbol_format check (symbol ~ '^[A-Z0-9]{5,20}$'),
  constraint market_cache_interval_valid check (interval in (
    '1m', '5m', '15m', '30m',
    '1h', '2h', '4h', '6h', '8h', '12h',
    '1d', '3d', '1w', '1M'
  )),
  constraint market_cache_limit_range check (limit_count between 50 and 10000),
  constraint market_cache_candles_is_array check (jsonb_typeof(candles) = 'array'),
  constraint market_cache_unique_request unique (symbol, interval, limit_count)
);

create index if not exists idx_market_cache_lookup
  on public.market_cache (symbol, interval, limit_count, expires_at);

create index if not exists idx_market_cache_expires_at
  on public.market_cache (expires_at);

create table if not exists public.ai_analysis_logs (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  symbol text,
  timeframe text,
  model text not null,
  request_payload jsonb,
  response_payload jsonb,
  status text not null default 'success',
  error_message text,
  latency_ms integer,
  created_at timestamptz not null default now(),
  constraint ai_analysis_logs_status_valid check (status in ('success', 'fallback', 'error', 'rate_limited')),
  constraint ai_analysis_logs_request_is_object check (request_payload is null or jsonb_typeof(request_payload) = 'object'),
  constraint ai_analysis_logs_response_is_object check (response_payload is null or jsonb_typeof(response_payload) = 'object')
);

create index if not exists idx_ai_analysis_logs_created_at
  on public.ai_analysis_logs (created_at desc);

create index if not exists idx_ai_analysis_logs_symbol_timeframe
  on public.ai_analysis_logs (symbol, timeframe, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_preferences_updated_at on public.user_preferences;

create trigger trg_user_preferences_updated_at
before update on public.user_preferences
for each row
execute function public.set_updated_at();

alter table public.user_preferences enable row level security;
alter table public.market_cache enable row level security;
alter table public.ai_analysis_logs enable row level security;

drop policy if exists "No direct anon read user preferences" on public.user_preferences;
drop policy if exists "No direct anon write user preferences" on public.user_preferences;
drop policy if exists "No direct anon read market cache" on public.market_cache;
drop policy if exists "No direct anon write market cache" on public.market_cache;
drop policy if exists "No direct anon read ai logs" on public.ai_analysis_logs;
drop policy if exists "No direct anon write ai logs" on public.ai_analysis_logs;
