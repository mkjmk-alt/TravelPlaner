alter table public.shared_trips
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

create index if not exists shared_trips_owner_id_idx
  on public.shared_trips(owner_id);

create or replace function public.assign_shared_trip_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if auth.role() = 'service_role' then
      return new;
    end if;

    if new.owner_id is distinct from auth.uid() then
      raise exception 'shared trip owner must match the authenticated user';
    end if;
  elsif new.owner_id is distinct from old.owner_id and auth.role() <> 'service_role' then
    raise exception 'shared trip owner cannot be changed';
  end if;

  return new;
end;
$$;

drop trigger if exists shared_trips_assign_owner on public.shared_trips;
create trigger shared_trips_assign_owner
before insert or update of owner_id on public.shared_trips
for each row execute function public.assign_shared_trip_owner();

alter table public.shared_trips enable row level security;
revoke all on table public.shared_trips from anon, authenticated;

alter table public.user_state enable row level security;

drop policy if exists "users manage own state" on public.user_state;
create policy "users manage own state"
on public.user_state
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

comment on column public.shared_trips.owner_id is
  'Authenticated owner of a shared trip. Null means it was shared anonymously.';
