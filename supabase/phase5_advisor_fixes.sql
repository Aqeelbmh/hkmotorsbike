-- ============================================================================
-- H.K MOTORS BIKE POS — Supabase Advisor remediation: SECURITY DEFINER views
-- Run in the Supabase SQL Editor. Fully idempotent: each view is re-created
-- with security_invoker = true, so it works whether or not the live DB already
-- has the view. Safe to re-run.
--
-- Background: a view executes with its OWNER's privileges. The owner here is
-- `postgres` (BYPASSRLS), so callers get the owner's RLS, not their own — the
-- "Security Definer View" lint. Postgres 15+ fixes this with security_invoker.
--
-- Definitions below are kept byte-for-byte in sync with schema.sql / phase2.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) SAFE to convert — every caller already has SELECT on the base tables, so
--    switching to the caller's RLS changes nothing for staff. (See phase2.sql /
--    schema.sql for the rationale of each.)
-- ---------------------------------------------------------------------------

-- Products per category — read only by staff (Categories = staff route).
create or replace view public.v_category_product_counts with (security_invoker = true) as
select c.id as category_id, count(p.id) as product_count
from public.categories c
left join public.products p on p.category_id = c.id and p.is_deleted = false
group by c.id;

-- Stock on hand — staff read directly; cashiers reach it via definer v_products_pos.
create or replace view public.v_stock_levels with (security_invoker = true) as
select p.id as product_id,
       coalesce(sum(m.quantity_delta), 0) as qty_on_hand
from public.products p
left join public.stock_movements m on m.product_id = p.id
where p.is_deleted = false
group by p.id;

-- Supplier balances — read only by staff (Suppliers/Purchases; dashboard `staff` guard).
create or replace view public.v_supplier_balances with (security_invoker = true) as
select su.id, su.name,
       su.opening_balance
         + coalesce(un.total_unpaid, 0)
         - coalesce(pa.total_on_account, 0)
         + coalesce(rt.total_returns_paid, 0) as balance
from public.suppliers su
left join (
  select supplier_id, sum(total - paid_amount) as total_unpaid
  from public.purchases
  where is_deleted = false and supplier_id is not null
  group by supplier_id
) un on un.supplier_id = su.id
left join (
  select supplier_id, sum(amount) as total_on_account
  from public.payments
  where direction = 'out' and is_deleted = false and supplier_id is not null and purchase_id is null
  group by supplier_id
) pa on pa.supplier_id = su.id
left join (
  select pu.supplier_id, sum(r.total) as total_returns_paid
  from public.returns r
  join public.purchases pu on pu.id = r.original_id
  where r.kind = 'purchase' and r.refund_method is not null and r.is_deleted = false
  group by pu.supplier_id
) rt on rt.supplier_id = su.id
where su.is_deleted = false;

-- Daily sales — staff see all; cashiers get their own daily totals (no error).
create or replace view public.v_sales_daily with (security_invoker = true) as
select s.sale_date,
       sum(s.grand_total)    as total_sales,
       sum(s.paid_amount)    as total_paid,
       sum(s.balance_amount) as total_credit,
       count(*)              as bill_count
from public.sales s
where s.is_deleted = false and s.status <> 'void'
group by s.sale_date;

-- Daily profit — depends on sale_items (is_staff-only); fetched only for staff.
create or replace view public.v_profit_daily with (security_invoker = true) as
select s.sale_date,
       sum(si.line_total)                                        as revenue,
       sum(si.quantity * si.cost_price)                          as cogs,
       sum(si.line_total - si.quantity * si.cost_price)          as gross_profit
from public.sales s
join public.sale_items si on si.sale_id = s.id and si.is_deleted = false
where s.is_deleted = false and s.status <> 'void'
group by s.sale_date;

-- ---------------------------------------------------------------------------
-- 2) INTENTIONAL definer views — DO NOT convert. Converting breaks the POS for
--    cashiers; it is not a security improvement here. In Supabase Advisor, mark
--    these two as "Resolved"/ignored with this rationale:
--    • v_products_pos      : cashiers have NO SELECT on `products` (RLS is_staff()).
--                            This owner-run view is the controlled, cost-free
--                            projection the POS / labels / dashboard rely on.
--    • v_customer_balances : cashiers can only read their OWN sales/payments under
--                            RLS; a security-invoker version would understate every
--                            customer's balance. Definer keeps totals correct
--                            (single-tenant, trusted-staff shop).
-- (Left untouched on purpose — schema.sql keeps them definer.)

-- ---------------------------------------------------------------------------
-- 3) OPTIONAL (only if you require a fully green advisor board AND accept that
--    cashiers get a limited, cost-free direct read of `products`):
--    Grants cashiers column-restricted access + an active-only row policy, then
--    converts v_products_pos to invoker. NOTE: v_products_pos also reads
--    v_stock_levels (now invoker), which would additionally require granting
--    cashiers read on `stock_movements`. Weigh against simply keeping (2).
--
-- grant select (id, sku, barcode, name, category_id, brand, unit, vehicle_make,
--   vehicle_model, vehicle_year_from, vehicle_year_to, rack_location,
--   selling_price, wholesale_price, reorder_level, image_url, is_active, is_deleted)
--   on public.products to authenticated;
-- create policy products_pos_select on public.products for select to authenticated
--   using (is_deleted = false and is_active);
-- grant select on public.stock_movements to authenticated;
-- create policy stock_movements_pos on public.stock_movements for select to authenticated
--   using (true);
-- alter view public.v_products_pos set (security_invoker = true);

-- ---------------------------------------------------------------------------
-- Verify (reloptions contains 'security_invoker=true' for the 5 converted views;
-- the 2 intentional definer views show '(definer/none)'):
-- select c.relname, coalesce(array_to_string(c.reloptions, ','), '(definer/none)') as options
-- from pg_class c
-- join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public'
--    and c.relname in ('v_category_product_counts','v_stock_levels','v_supplier_balances','v_profit_daily','v_sales_daily','v_products_pos','v_customer_balances')
-- order by c.relname;
