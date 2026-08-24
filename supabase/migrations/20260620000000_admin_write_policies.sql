-- Admin write access via Supabase Auth.
--
-- Until now the only policies were PUBLIC READ (non-draft paintings + the
-- paintings storage bucket). Writes were impossible from the browser, which is
-- correct for visitors but blocks the admin panel.
--
-- Decision (CLAUDE.md, admin build step): use Supabase Auth. Pablo gets one
-- real login; any AUTHENTICATED user may read/write everything. The public
-- anon role keeps its read-only access. No service-role key is shipped to the
-- browser — the logged-in user's JWT carries the permission.
--
-- After applying this, create Pablo's user in:
--   Supabase dashboard -> Authentication -> Users -> Add user
-- (set "Auto Confirm" so he can log in immediately).

-- ----------------------------------------------------------------------------
-- paintings: authenticated admin can see drafts + do all writes
-- ----------------------------------------------------------------------------
-- The existing public_read_paintings policy hides drafts (status <> 'draft').
-- This extra SELECT policy lets a logged-in admin see EVERY row, including
-- drafts. (Multiple permissive SELECT policies are OR'd together.)
drop policy if exists admin_read_paintings on public.paintings;
create policy admin_read_paintings on public.paintings
  for select to authenticated using (true);

drop policy if exists admin_insert_paintings on public.paintings;
create policy admin_insert_paintings on public.paintings
  for insert to authenticated with check (true);

drop policy if exists admin_update_paintings on public.paintings;
create policy admin_update_paintings on public.paintings
  for update to authenticated using (true) with check (true);

drop policy if exists admin_delete_paintings on public.paintings;
create policy admin_delete_paintings on public.paintings
  for delete to authenticated using (true);

-- ----------------------------------------------------------------------------
-- orders: authenticated admin can read the sales log (no public access at all)
-- Inserts still happen server-side via the service-role key in webhooks.
-- ----------------------------------------------------------------------------
drop policy if exists admin_read_orders on public.orders;
create policy admin_read_orders on public.orders
  for select to authenticated using (true);

-- ----------------------------------------------------------------------------
-- storage: authenticated admin can upload / replace / remove painting images.
-- Public read on the bucket already exists (public_read_paintings_bucket).
-- ----------------------------------------------------------------------------
drop policy if exists admin_insert_paintings_bucket on storage.objects;
create policy admin_insert_paintings_bucket on storage.objects
  for insert to authenticated with check (bucket_id = 'paintings');

drop policy if exists admin_update_paintings_bucket on storage.objects;
create policy admin_update_paintings_bucket on storage.objects
  for update to authenticated using (bucket_id = 'paintings') with check (bucket_id = 'paintings');

drop policy if exists admin_delete_paintings_bucket on storage.objects;
create policy admin_delete_paintings_bucket on storage.objects
  for delete to authenticated using (bucket_id = 'paintings');
