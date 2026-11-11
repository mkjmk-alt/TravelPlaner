begin;

insert into storage.buckets (id, name, public)
values ('trip-media', 'trip-media', false)
on conflict (id) do update set public = false;

drop policy if exists "trip media owner read" on storage.objects;
create policy "trip media owner read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'trip-media'
    and position('/' in name) > 1
    and split_part(name, '/', 1) = (select auth.uid())::text
  );

drop policy if exists "trip media owner insert" on storage.objects;
create policy "trip media owner insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'trip-media'
    and position('/' in name) > 1
    and split_part(name, '/', 1) = (select auth.uid())::text
  );

drop policy if exists "trip media owner update" on storage.objects;
create policy "trip media owner update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'trip-media'
    and position('/' in name) > 1
    and split_part(name, '/', 1) = (select auth.uid())::text
  )
  with check (
    bucket_id = 'trip-media'
    and position('/' in name) > 1
    and split_part(name, '/', 1) = (select auth.uid())::text
  );

drop policy if exists "trip media owner delete" on storage.objects;
create policy "trip media owner delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'trip-media'
    and position('/' in name) > 1
    and split_part(name, '/', 1) = (select auth.uid())::text
  );

commit;
