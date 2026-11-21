begin;

create table public.tripplot_road_route_counters (
  month date not null,
  scope text not null,
  used integer not null default 0 check (used >= 0),
  test_plan text not null default 'free' check (test_plan in ('free', 'pro')),
  primary key (month, scope)
);

alter table public.tripplot_road_route_counters enable row level security;
revoke all on table public.tripplot_road_route_counters from public, anon, authenticated;

create function public.tripplot_road_route_usage(
  p_user_id uuid, p_can_test boolean, p_test_plan text, p_consume boolean,
  p_free_limit integer, p_test_pro_limit integer, p_service_limit integer
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  period date := date_trunc('month', statement_timestamp() at time zone 'Asia/Seoul')::date;
  account_count integer := 0;
  service_count integer := 0;
  plan text := 'free';
  account_limit integer;
  denial text;
begin
  if p_user_id is null or p_can_test is null or p_consume is null
      or p_free_limit is null or p_test_pro_limit is null or p_service_limit is null
      or least(p_free_limit, p_test_pro_limit, p_service_limit) < 0 then
    raise exception 'Invalid route quota policy';
  end if;

  if p_test_plan is not null and (not p_can_test or p_consume or p_test_plan not in ('free', 'pro')) then
    raise exception 'Purchase simulation unavailable';
  end if;

  if p_consume or p_test_plan is not null then
    insert into public.tripplot_road_route_counters (month, scope)
    values (period, p_user_id::text) on conflict do nothing;

    -- Lock the account before checking the allowance or changing its test state.
    select used, test_plan into account_count, plan
    from public.tripplot_road_route_counters
    where month = period and scope = p_user_id::text for update;
  else
    select used, test_plan into account_count, plan
    from public.tripplot_road_route_counters
    where month = period and scope = p_user_id::text;
    account_count := coalesce(account_count, 0);
    plan := coalesce(plan, 'free');
  end if;

  if p_test_plan is not null then
    update public.tripplot_road_route_counters set test_plan = p_test_plan
    where month = period and scope = p_user_id::text;
    plan := p_test_plan;
  end if;

  if not p_can_test then plan := 'free'; end if;
  account_limit := case when plan = 'pro' then p_test_pro_limit else p_free_limit end;

  if p_consume then
    if account_count >= account_limit then
      denial := 'ACCOUNT_LIMIT';
    else
      insert into public.tripplot_road_route_counters (month, scope)
      values (period, 'service') on conflict do nothing;

      -- A conditional update reserves the global slot under a row lock.
      update public.tripplot_road_route_counters set used = used + 1
      where month = period and scope = 'service' and used < p_service_limit
      returning used into service_count;

      if not found then
        denial := 'SERVICE_LIMIT';
      else
        account_count := account_count + 1;
        update public.tripplot_road_route_counters set used = account_count
        where month = period and scope = p_user_id::text;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'allowed', denial is null, 'code', denial, 'plan', plan, 'canTest', p_can_test,
    'limit', account_limit, 'remaining', greatest(0, account_limit - account_count),
    'resetsOn', (period + interval '1 month')::date
  );
end;
$$;

revoke all on function public.tripplot_road_route_usage(uuid, boolean, text, boolean, integer, integer, integer)
from public, anon, authenticated;
grant execute on function public.tripplot_road_route_usage(uuid, boolean, text, boolean, integer, integer, integer)
to service_role;

commit;
