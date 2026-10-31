-- These primitives are still called by the reviewed/idempotent SECURITY DEFINER
-- wrappers, but browser roles must not bypass those wrappers through Data API.
revoke execute on function public.create_sale(uuid,uuid,jsonb,text,uuid),
  public.cancel_sale(uuid,uuid,text),
  public.save_product(uuid,text,text,text,text,jsonb,bigint,bigint,boolean,uuid),
  public.record_inventory_count(uuid,uuid,jsonb,text)
  from public, anon, authenticated;
