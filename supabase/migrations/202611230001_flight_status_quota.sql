begin;

create table public.tripplot_flight_status_counters (
  month date not null,
  scope text not null,
  used integer not null check (used > 0),
  primary key (month, scope)
);

create table public.tripplot_flight_status_cooldowns (
  number text not null,
  departure_date date not null,
  expires_at timestamptz not null,
  primary key (number, departure_date)
);

create index tripplot_flight_status_cooldowns_expiry_idx
  on public.tripplot_flight_status_cooldowns (expires_at);

alter table public.tripplot_flight_status_counters enable row level security;
alter table public.tripplot_flight_status_cooldowns enable row level security;
revoke all on public.tripplot_flight_status_counters, public.tripplot_flight_status_cooldowns
  from public, anon, authenticated, service_role;

create function public.tripplot_reserve_flight_status(
  p_user_id uuid, p_number text, p_date date, p_account_limit integer, p_global_limit integer
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  reserved_at timestamptz;
  period date;
begin
  if p_user_id is null or p_number is null or p_date is null or not isfinite(p_date)
      or p_number !~ '^(?:[A-Z]{3}|[A-Z][A-Z0-9]|[0-9][A-Z])[0-9]{1,4}[A-Z]?$'
      or p_account_limit is null or p_global_limit is null
      or p_account_limit not between 1 and 9999999 or p_global_limit not between 1 and 9999999 then
    raise exception 'Invalid flight status reservation';
  end if;

  -- Serialize the duplicate check and both counters across all Pages isolates.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tripplot-flight-status', 0));
  reserved_at := pg_catalog.clock_timestamp();
  period := date_trunc('month', reserved_at at time zone 'UTC')::date;

  if exists (
    select 1 from public.tripplot_flight_status_cooldowns
    where number = p_number and departure_date = p_date and expires_at > reserved_at
  ) then
    return jsonb_build_object('allowed', false, 'reason', 'DUPLICATE');
  end if;

  if exists (
    select 1 from public.tripplot_flight_status_counters
    where month = period and scope = p_user_id::text and used >= p_account_limit
  ) then
    return jsonb_build_object('allowed', false, 'reason', 'ACCOUNT_LIMIT');
  end if;

  if exists (
    select 1 from public.tripplot_flight_status_counters
    where month = period and scope = 'global' and used >= p_global_limit
  ) then
    return jsonb_build_object('allowed', false, 'reason', 'GLOBAL_LIMIT');
  end if;

  delete from public.tripplot_flight_status_cooldowns where expires_at <= reserved_at;
  insert into public.tripplot_flight_status_cooldowns (number, departure_date, expires_at)
    values (p_number, p_date, reserved_at + interval '30 seconds');

  insert into public.tripplot_flight_status_counters as counters (month, scope, used)
    values (period, p_user_id::text, 1), (period, 'global', 1)
    on conflict (month, scope) do update set used = counters.used + 1;

  return jsonb_build_object('allowed', true);
end;
$$;

revoke all on function public.tripplot_reserve_flight_status(uuid, text, date, integer, integer)
  from public, anon, authenticated;
grant execute on function public.tripplot_reserve_flight_status(uuid, text, date, integer, integer)
  to service_role;

commit;
