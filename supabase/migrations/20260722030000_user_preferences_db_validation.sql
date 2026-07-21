-- Drop direct write policies on user_preferences; writes go through edge function only.
drop policy if exists "Users can insert own preferences" on public.user_preferences;
drop policy if exists "Users can update own preferences" on public.user_preferences;
drop policy if exists "Users can delete own preferences" on public.user_preferences;

-- Defense-in-depth validation trigger (mirrors sanitizePreferences allowlist)
create or replace function public.validate_user_preferences()
returns trigger
language plpgsql
as $$
declare
  allowed_keys text[] := array[
    'showCandles', 'showEma20', 'showEma50', 'showRsi', 'showMacd',
    'showSupport', 'showResistance', 'showPivots', 'showStandardPivots',
    'showHistoricalPivots', 'pivotType', 'pivotTimeframe', 'pivotsBack'
  ];
  k text;
begin
  if pg_column_size(new.preferences) >= 16384 then
    raise exception 'preferences payload too large';
  end if;

  for k in select jsonb_object_keys(new.preferences)
  loop
    if not (k = any(allowed_keys)) then
      raise exception 'invalid preferences key: %', k;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists validate_user_preferences_trigger on public.user_preferences;

create trigger validate_user_preferences_trigger
before insert or update on public.user_preferences
for each row
execute function public.validate_user_preferences();
