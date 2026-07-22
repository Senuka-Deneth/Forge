-- Extend validate_user_preferences allowlist with Phase 3 chart overlays + pivot chart prefs.
-- Recreate the function; the existing trigger stays attached.

create or replace function public.validate_user_preferences()
returns trigger
language plpgsql
as $$
declare
  allowed_keys text[] := array[
    'showCandles', 'showEma20', 'showEma50', 'showRsi', 'showMacd',
    'showSupport', 'showResistance', 'showPivots', 'showStandardPivots',
    'showHistoricalPivots', 'pivotType', 'pivotTimeframe', 'pivotsBack',
    'showKeltner', 'showSqueeze', 'showStochRsi', 'showSupertrend',
    'showChandelier', 'showDonchian', 'showIchimoku', 'showAnchoredVwap',
    'showVwapBands', 'showFvg', 'showOrderBlocks', 'showVolumeProfile',
    'showLiquidityPools', 'showSweeps', 'showConfluence',
    'showPivotLabels', 'showPivotPrices', 'pivotLabelsPosition',
    'pivotLineWidth', 'pivotLevelOptions'
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
