-- ============================================================================
-- PENZO PARTS POS — PHASE 3 (Purchases & Inventory)
-- Run in the Supabase SQL editor AFTER schema.sql and seed.sql.
-- Idempotent: safe to re-run.
--
-- These views are SECURITY INVOKER, so the underlying table RLS applies
-- through them: stock_movements / purchases / purchase_items / products are
-- all staff-only, therefore cashiers get "permission denied" — not silent
-- empty rows, and never cost data.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- v_stock_movements_detail — human-readable stock ledger
-- ----------------------------------------------------------------------------
create or replace view public.v_stock_movements_detail
with (security_invoker = on) as
select
  m.id,
  m.created_at,
  m.product_id,
  p.sku,
  p.name                       as product_name,
  p.unit,
  p.rack_location,
  m.quantity_delta,
  m.movement_type,
  m.reference_table,
  m.reference_id,
  m.reason,
  m.note,
  m.recorded_by,
  coalesce(pr.full_name, 'System') as recorder_name,
  coalesce(
    (select s.purchase_no from public.purchases s
       where s.id = m.reference_id and m.reference_table = 'purchases'),
    (select sa.bill_no    from public.sales sa
       where sa.id = m.reference_id and m.reference_table = 'sales'),
    (select rt.return_no  from public.returns rt
       where rt.id = m.reference_id and m.reference_table = 'returns'),
    nullif(m.reference_id::text, ''),
    case m.reference_table
      when 'stock_take' then 'Stock-take'
      when 'seed'       then 'Opening balance'
      when 'opening'    then 'Opening balance'
      else m.reference_table
    end,
    '—'
  )                            as reference_label
from public.stock_movements m
join public.products p on p.id = m.product_id
left join public.profiles pr on pr.id = m.recorded_by;

-- ----------------------------------------------------------------------------
-- v_purchase_items_detail — goods-receipt lines with product identity
-- ----------------------------------------------------------------------------
create or replace view public.v_purchase_items_detail
with (security_invoker = on) as
select
  pi.id,
  pi.purchase_id,
  pi.product_id,
  p.sku,
  p.name              as product_name,
  p.unit,
  p.barcode,
  p.rack_location,
  pi.quantity,
  pi.unit_cost,
  pi.line_total
from public.purchase_items pi
join public.products p on p.id = pi.product_id
where pi.is_deleted = false;

-- ----------------------------------------------------------------------------
-- v_inventory_valuation — one row per live product with stock + value
-- ----------------------------------------------------------------------------
create or replace view public.v_inventory_valuation
with (security_invoker = on) as
select
  p.id,
  p.sku,
  p.name,
  p.unit,
  p.brand,
  p.rack_location,
  p.reorder_level,
  p.cost_price,
  p.selling_price,
  p.is_active,
  p.category_id,
  c.name as category_name,
  coalesce(s.qty_on_hand, 0)                      as qty_on_hand,
  coalesce(s.qty_on_hand, 0) * p.cost_price       as value_at_cost,
  coalesce(s.qty_on_hand, 0) * p.selling_price    as value_at_sale,
  (coalesce(s.qty_on_hand, 0) = 0)                as is_out_of_stock,
  (coalesce(s.qty_on_hand, 0) <= p.reorder_level) as is_low_stock
from public.products p
left join public.categories c on c.id = p.category_id
left join public.v_stock_levels s on s.product_id = p.id
where p.is_deleted = false;

-- ----------------------------------------------------------------------------
-- v_last_purchase_costs — prefills the goods-receipt unit cost
-- ----------------------------------------------------------------------------
create or replace view public.v_last_purchase_costs
with (security_invoker = on) as
select distinct on (pi.product_id)
  pi.product_id,
  pi.unit_cost        as last_unit_cost,
  pu.purchase_date    as last_purchase_date,
  pu.supplier_id      as last_supplier_id
from public.purchase_items pi
join public.purchases pu on pu.id = pi.purchase_id and pu.is_deleted = false
where pi.is_deleted = false
order by pi.product_id, pu.purchase_date desc, pi.created_at desc;

-- ----------------------------------------------------------------------------
-- HARDENING: v_products_full was created as an owner (definer) view in
-- schema.sql, which would let a cashier read cost_price straight through the
-- PostgREST API. Recreate it as SECURITY INVOKER so products' staff-only RLS
-- applies. The cashier-safe path remains v_products_pos (intentionally definer).
-- ----------------------------------------------------------------------------
create or replace view public.v_products_full
with (security_invoker = on) as
select pr.*, c.name as category_name,
       coalesce(s.qty_on_hand, 0) as qty_on_hand,
       (coalesce(s.qty_on_hand, 0) <= pr.reorder_level) as is_low_stock,
       (coalesce(s.qty_on_hand, 0) = 0) as is_out_of_stock,
       (coalesce(s.qty_on_hand, 0) * pr.cost_price) as stock_value_at_cost,
       (coalesce(s.qty_on_hand, 0) * pr.selling_price) as stock_value_at_sale
from public.products pr
left join public.categories c on c.id = pr.category_id
left join public.v_stock_levels s on s.product_id = pr.id
where pr.is_deleted = false;

-- ----------------------------------------------------------------------------
-- CORRECTION to fn_record_purchase (schema.sql): the weighted-average cost
-- must be applied BEFORE the incoming stock movement is inserted, otherwise
-- the new batch is counted twice in the weighting denominator.
-- ----------------------------------------------------------------------------
create or replace function public.fn_record_purchase(
  p_supplier_id         uuid,
  p_supplier_invoice_no text,
  p_purchase_date       date,
  p_items               jsonb,
  p_discount            numeric,
  p_payments            jsonb,
  p_notes               text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_purchase_id uuid;
  v_purchase_no text;
  v_item  record;
  v_pay   record;
  v_subtotal numeric := 0;
  v_total    numeric;
  v_paid     numeric := 0;
  v_cheque_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_staff() then raise exception 'Not allowed'; end if;
  if coalesce(jsonb_array_length(p_items), 0) = 0 then raise exception 'Purchase has no items'; end if;

  insert into public.purchases (supplier_id, supplier_invoice_no, purchase_date, discount, notes, created_by)
  values (p_supplier_id, p_supplier_invoice_no, coalesce(p_purchase_date, current_date),
          coalesce(p_discount, 0), p_notes, auth.uid())
  returning id, purchase_no into v_purchase_id, v_purchase_no;

  for v_item in
    select (e)->>'product_id' as pid, ((e)->>'quantity')::numeric as qty,
           ((e)->>'unit_cost')::numeric as cost
    from jsonb_array_elements(p_items) e
  loop
    if v_item.qty <= 0 or v_item.cost < 0 then raise exception 'Invalid purchase line'; end if;

    -- 1) re-weight cost against the stock already on the shelf
    perform public.fn_apply_weighted_cost(v_item.pid::uuid, v_item.qty, v_item.cost);
    -- 2) then raise the stock level (ledger-only, never a direct product update)
    insert into public.purchase_items (purchase_id, product_id, quantity, unit_cost, line_total)
    values (v_purchase_id, v_item.pid::uuid, v_item.qty, v_item.cost, round(v_item.qty * v_item.cost, 2));
    insert into public.stock_movements (product_id, quantity_delta, movement_type, reference_table, reference_id, recorded_by)
    values (v_item.pid::uuid, v_item.qty, 'purchase', 'purchases', v_purchase_id, auth.uid());

    v_subtotal := v_subtotal + round(v_item.qty * v_item.cost, 2);
  end loop;

  v_total := greatest(v_subtotal - coalesce(p_discount, 0), 0);
  update public.purchases set subtotal = v_subtotal, total = v_total where id = v_purchase_id;

  if p_payments is not null then
    for v_pay in
      select (e)->>'method' as method, ((e)->>'amount')::numeric as amount,
             (e)->>'cheque_no' as cheque_no, (e)->>'bank' as bank,
             (e)->>'cheque_date' as cheque_date, (e)->>'reference_no' as reference_no
      from jsonb_array_elements(p_payments) e
    loop
      v_cheque_id := null;
      if v_pay.amount <= 0 then continue; end if;
      if v_pay.amount > v_total - v_paid then
        raise exception 'Payment exceeds the amount payable (%)', v_total - v_paid;
      end if;
      if v_pay.method = 'cheque' then
        if coalesce(v_pay.cheque_no, '') = '' or coalesce(v_pay.bank, '') = '' then
          raise exception 'Cheque number and bank are required';
        end if;
        insert into public.cheques (direction, status, cheque_no, bank, amount, cheque_date,
                                    party_name, supplier_id, purchase_id, recorded_by)
        values ('issued', 'pending', v_pay.cheque_no, v_pay.bank,
                v_pay.amount, coalesce(v_pay.cheque_date::date, current_date),
                (select name from public.suppliers where id = p_supplier_id),
                p_supplier_id, v_purchase_id, auth.uid())
        returning id into v_cheque_id;
      end if;
      insert into public.payments (direction, method, amount, supplier_id, purchase_id, cheque_id, reference_no, recorded_by)
      values ('out', v_pay.method::public.payment_method, v_pay.amount,
              p_supplier_id, v_purchase_id, v_cheque_id, v_pay.reference_no, auth.uid());
      v_paid := v_paid + v_pay.amount;
    end loop;
  end if;

  return jsonb_build_object('purchase_id', v_purchase_id, 'purchase_no', v_purchase_no,
                            'total', v_total, 'paid', v_paid, 'balance', v_total - v_paid);
end $$;

-- ----------------------------------------------------------------------------
-- fn_receive_payment gains cheque fields. In schema.sql a cheque payment only
-- wrote a payments row, so it could never be deposited, cleared or bounced.
-- Now the matching cheques row is created and linked, which is what
-- trg_cheque_status needs to reverse the payment on a bounce.
-- The signature changed, so the old 9-argument function must be dropped first.
-- ----------------------------------------------------------------------------
drop function if exists public.fn_receive_payment(
  text, public.payment_method, numeric, uuid, uuid, uuid, uuid, text, text
);

create or replace function public.fn_receive_payment(
  p_direction   text,
  p_method      public.payment_method,
  p_amount      numeric,
  p_customer_id uuid,
  p_supplier_id uuid,
  p_sale_id     uuid,
  p_purchase_id uuid,
  p_reference_no text,
  p_note        text,
  p_cheque_no   text default null,
  p_cheque_bank text default null,
  p_cheque_date date default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_cheque_id uuid; v_party text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  if p_direction = 'in'  and p_customer_id is null then raise exception 'Customer required'; end if;
  if p_direction = 'out' and p_supplier_id is null then raise exception 'Supplier required'; end if;

  if p_method = 'cheque' then
    if coalesce(p_cheque_no, '') = '' or coalesce(p_cheque_bank, '') = '' then
      raise exception 'Cheque number and bank are required';
    end if;
    v_party := case when p_direction = 'in'
                    then (select name from public.customers where id = p_customer_id)
                    else (select name from public.suppliers where id = p_supplier_id) end;
    insert into public.cheques (direction, status, cheque_no, bank, amount, cheque_date,
                                party_name, customer_id, supplier_id, sale_id, purchase_id, recorded_by)
    values (case when p_direction = 'in' then 'received' else 'issued' end,
            'pending', p_cheque_no, p_cheque_bank, p_amount,
            coalesce(p_cheque_date, current_date), v_party,
            p_customer_id, p_supplier_id, p_sale_id, p_purchase_id, auth.uid())
    returning id into v_cheque_id;
  end if;

  insert into public.payments (direction, method, amount, customer_id, supplier_id,
                               sale_id, purchase_id, cheque_id, reference_no, note, recorded_by)
  values (p_direction, p_method, p_amount, p_customer_id, p_supplier_id,
          p_sale_id, p_purchase_id, v_cheque_id, p_reference_no, p_note, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

grant usage on schema public to authenticated;
grant select on
  public.v_stock_movements_detail,
  public.v_purchase_items_detail,
  public.v_inventory_valuation,
  public.v_last_purchase_costs,
  public.v_products_full
to authenticated;

grant execute on function public.fn_receive_payment(
  text, public.payment_method, numeric, uuid, uuid, uuid, uuid, text, text, text, text, date
) to authenticated;

-- Ledger screen default ordering (created_at desc, id desc) over recent rows.
create index if not exists stock_movements_created_idx
  on public.stock_movements (created_at desc, id desc);
