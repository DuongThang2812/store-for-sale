begin;
create extension if not exists pgtap with schema extensions;
select plan(4);
select ok(not has_function_privilege('authenticated','public.create_sale(uuid,uuid,jsonb,text,uuid)','execute'),
  'Browser role cannot bypass reviewed sale');
select ok(not has_function_privilege('authenticated','public.cancel_sale(uuid,uuid,text)','execute'),
  'Browser role cannot bypass confirmed cancellation');
select ok(not has_function_privilege('authenticated','public.save_product(uuid,text,text,text,text,jsonb,bigint,bigint,boolean,uuid)','execute'),
  'Browser role cannot bypass idempotent product save');
select ok(not has_function_privilege('authenticated','public.record_inventory_count(uuid,uuid,jsonb,text)','execute'),
  'Browser role cannot bypass reviewed inventory count');
select * from finish();
rollback;
