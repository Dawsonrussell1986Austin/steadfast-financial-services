-- Private Supabase Storage buckets for compliance archiving.
-- Both buckets are private (public = false); the admin serves signed URLs
-- to view individual files. Only authenticated users can read/write.

insert into storage.buckets (id, name, public)
values ('compliance-screenshots', 'compliance-screenshots', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('compliance-approvals', 'compliance-approvals', false)
on conflict (id) do nothing;

drop policy if exists "compliance_screenshots_auth_read"   on storage.objects;
drop policy if exists "compliance_screenshots_auth_write"  on storage.objects;
drop policy if exists "compliance_screenshots_auth_update" on storage.objects;
drop policy if exists "compliance_screenshots_auth_delete" on storage.objects;
drop policy if exists "compliance_approvals_auth_read"     on storage.objects;
drop policy if exists "compliance_approvals_auth_write"    on storage.objects;
drop policy if exists "compliance_approvals_auth_update"   on storage.objects;
drop policy if exists "compliance_approvals_auth_delete"   on storage.objects;

create policy "compliance_screenshots_auth_read"
  on storage.objects for select to authenticated
  using (bucket_id = 'compliance-screenshots');

create policy "compliance_screenshots_auth_write"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'compliance-screenshots');

create policy "compliance_screenshots_auth_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'compliance-screenshots') with check (bucket_id = 'compliance-screenshots');

create policy "compliance_screenshots_auth_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'compliance-screenshots');

create policy "compliance_approvals_auth_read"
  on storage.objects for select to authenticated
  using (bucket_id = 'compliance-approvals');

create policy "compliance_approvals_auth_write"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'compliance-approvals');

create policy "compliance_approvals_auth_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'compliance-approvals') with check (bucket_id = 'compliance-approvals');

create policy "compliance_approvals_auth_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'compliance-approvals');
