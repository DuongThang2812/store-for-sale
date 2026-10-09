-- Keep supplier quotations separate from selling prices and inventory movements.
create table public.catalog_import_batches (
  store_id uuid not null references public.stores(id) on delete cascade,
  request_id uuid not null,
  imported_by uuid not null references auth.users(id),
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (store_id, request_id)
);

create table public.product_source_quotes (
  store_id uuid not null,
  source_id text not null check (char_length(source_id) between 1 and 40),
  product_id uuid not null,
  source_name text not null,
  original_price text,
  reference_cost bigint check (reference_cost between 0 and 999999999),
  purchase_unit text,
  tiers text,
  availability text,
  review_note text,
  original_line text,
  imported_by uuid not null references auth.users(id),
  imported_at timestamptz not null default now(),
  primary key (store_id, source_id),
  foreign key (store_id, product_id) references public.products(store_id, id) on delete restrict
);
create index product_source_quotes_product_idx on public.product_source_quotes (store_id, product_id);

alter table public.catalog_import_batches enable row level security;
alter table public.product_source_quotes enable row level security;
create policy catalog_batches_select_member on public.catalog_import_batches for select to authenticated
  using ((select public.is_store_member(store_id)));
create policy product_quotes_select_member on public.product_source_quotes for select to authenticated
  using ((select public.is_store_member(store_id)));
revoke all on public.catalog_import_batches, public.product_source_quotes from anon, authenticated;
grant select on public.catalog_import_batches, public.product_source_quotes to authenticated;

-- An imported row has a base unit, but cannot be sold until its real retail price is entered.
create or replace function public.guard_draft_activation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (select p.is_active from public.products p where p.id = new.id and p.store_id = new.store_id)
    and not exists (
    select 1 from public.product_units u
    where u.store_id = new.store_id and u.product_id = new.id and u.unit_key = 'base'
      and u.can_sell and u.sale_price > 0
  ) then
    raise exception 'Hãy nhập giá bán lẻ trước khi bật bán mặt hàng nháp.';
  end if;
  return null;
end;
$$;
create constraint trigger products_guard_draft_activation after update on public.products
  deferrable initially deferred for each row execute function public.guard_draft_activation();

create or replace function public.import_catalog_drafts(
  p_store_id uuid,
  p_request_id uuid,
  p_rows jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_row jsonb;
  v_source text;
  v_name text;
  v_category text;
  v_group text;
  v_unit text;
  v_cost bigint;
  v_sale bigint;
  v_product uuid;
  v_result jsonb;
  v_created integer := 0;
  v_existing integer := 0;
  v_quoted integer := 0;
  v_skipped integer := 0;
begin
  if v_user is null or not public.is_store_owner(p_store_id) then
    raise exception 'Chỉ chủ cửa hàng được nhập danh mục vào DB.';
  end if;
  if p_request_id is null then raise exception 'Thiếu mã lần nhập.'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) not between 1 and 2000 then
    raise exception 'File cần từ 1 đến 2.000 dòng mặt hàng.';
  end if;
  if (select count(distinct value ->> 'source_id') from jsonb_array_elements(p_rows)) <> jsonb_array_length(p_rows) then
    raise exception 'Mã nguồn trong file bị thiếu hoặc trùng.';
  end if;

  -- Serialize imports in the same store. A retry with the same request ID returns the first result.
  perform 1 from public.stores where id = p_store_id for update;
  select result into v_result from public.catalog_import_batches
    where store_id = p_store_id and request_id = p_request_id;
  if found then return v_result; end if;
  insert into public.catalog_import_batches (store_id, request_id, imported_by)
  values (p_store_id, p_request_id, v_user);

  for v_row in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(v_row) <> 'object' then raise exception 'Một dòng hàng trong file chưa hợp lệ.'; end if;
    v_source := btrim(coalesce(v_row ->> 'source_id', ''));
    v_name := btrim(coalesce(v_row ->> 'name', ''));
    v_category := btrim(coalesce(v_row ->> 'category', ''));
    v_group := v_row ->> 'product_group';
    v_unit := v_row ->> 'base_unit';
    if v_source !~ '^[A-Za-z0-9_-]{1,40}$' or char_length(v_name) not between 1 and 120
      or char_length(v_category) not between 1 and 80
      or v_group not in ('snacks', 'drinks', 'beer', 'spices', 'seeds', 'tobacco', 'other')
      or v_unit not in ('cái', 'gói', 'chai', 'lon', 'hộp', 'bịch', 'thùng', 'kg', 'lạng', 'cây', 'viên') then
      raise exception 'Mã nguồn, tên, nhóm hoặc đơn vị mặt hàng chưa hợp lệ: %.', v_source;
    end if;
    if v_row ->> 'purchase_price' is not null and (v_row ->> 'purchase_price') !~ '^[0-9]{1,9}$' then
      raise exception 'Giá nhập tham khảo chưa hợp lệ: %.', v_source;
    end if;
    if v_row ->> 'sale_price' is not null and (v_row ->> 'sale_price') !~ '^[0-9]{1,9}$' then
      raise exception 'Giá bán lẻ chưa hợp lệ: %.', v_source;
    end if;
    v_cost := (v_row ->> 'purchase_price')::bigint;
    v_sale := (v_row ->> 'sale_price')::bigint;
    if char_length(coalesce(v_row ->> 'original_price', '')) > 500
      or char_length(coalesce(v_row ->> 'purchase_unit', '')) > 40
      or char_length(coalesce(v_row ->> 'tiers', '')) > 1000
      or char_length(coalesce(v_row ->> 'availability', '')) > 100
      or char_length(coalesce(v_row ->> 'review_note', '')) > 1000
      or char_length(coalesce(v_row ->> 'original_line', '')) > 2000 then
      raise exception 'Dòng nguồn quá dài: %.', v_source;
    end if;

    if exists (select 1 from public.product_source_quotes where store_id = p_store_id and source_id = v_source) then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    select id into v_product from public.products
      where store_id = p_store_id
        and lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) = lower(regexp_replace(v_name, '\s+', ' ', 'g'))
      order by is_active desc, id limit 1;
    if v_product is null then
      insert into public.products (store_id, name, category, product_group, base_unit, stock_base, is_active)
      values (p_store_id, v_name, v_category, v_group, v_unit, 0, false)
      returning id into v_product;
      -- Zero is an inactive placeholder, never the supplier quote or a usable selling price.
      insert into public.product_units (store_id, product_id, unit_key, unit_name, factor_to_base,
        purchase_price, sale_price, can_purchase, can_sell)
      values (p_store_id, v_product, 'base', v_unit, 1, null, coalesce(v_sale, 0), false, true);
      v_created := v_created + 1;
    else
      v_existing := v_existing + 1;
    end if;
    insert into public.product_source_quotes (store_id, source_id, product_id, source_name,
      original_price, reference_cost, purchase_unit, tiers, availability, review_note, original_line, imported_by)
    values (p_store_id, v_source, v_product, v_name, v_row ->> 'original_price', v_cost,
      v_row ->> 'purchase_unit', v_row ->> 'tiers', v_row ->> 'availability',
      v_row ->> 'review_note', v_row ->> 'original_line', v_user);
    v_quoted := v_quoted + 1;
    v_product := null;
  end loop;

  v_result := jsonb_build_object('created', v_created, 'matched', v_existing,
    'quoted', v_quoted, 'skipped_source', v_skipped);
  update public.catalog_import_batches set result = v_result
    where store_id = p_store_id and request_id = p_request_id;
  insert into public.audit_logs (store_id, actor_id, action, entity_type, details)
  values (p_store_id, v_user, 'catalog.imported', 'catalog_import', v_result);
  return v_result;
end;
$$;

revoke all on function public.import_catalog_drafts(uuid, uuid, jsonb) from public, anon;
grant execute on function public.import_catalog_drafts(uuid, uuid, jsonb) to authenticated;
