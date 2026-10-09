-- Every active shop member must detect that the shop migrated, even when the
-- owner performed the import on a different device.
drop policy legacy_import_batches_owner_read on public.legacy_import_batches;
create policy legacy_import_batches_member_read on public.legacy_import_batches
  for select to authenticated using ((select public.is_store_member(store_id)));
