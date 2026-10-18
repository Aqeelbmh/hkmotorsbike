-- ============================================================================
-- PENZO PARTS POS — PHASE 4-7 (POS, Sales, Money, Reports, Settings)
-- Run in the Supabase SQL editor AFTER schema.sql, seed.sql, phase2.sql, phase3.sql.
-- Idempotent: safe to re-run.
--
-- All views are SECURITY INVOKER, so the base-table RLS applies through them.
-- In particular v_sale_items_detail / v_profit_* read sale_items (staff-only),
-- so a cashier calling them gets "permission denied" rather than cost data.
-- The cashier-safe bill reprint path is the fn_get_bill() RPC in schema.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- v_sales_list — bill header with customer + cashier labels (no cost data)
-- ----------------------------------------------------------------------------
create or replace view public.v_sales_list
with (security_invoker = on) as
select
  s.id,
  s.bill_no,
  s.customer_id,
  coalesce(c.name, 'Walk-in')    as customer_name,
  c.phone                        as customer_phone,
  c.type                         as customer_type,
  s.sold_at,
  s.sale_date,
  s.status,
  s.subtotal,
  s.line_discounts,
  s.bill_discount,
  s.tax_amount,
  s.grand_total,
  s.paid_amount,
  s.balance_amount,
  s.change_amount,
  s.note,
  s.created_by,
  coalesce(p.full_name, 'System') as cashier_name,
  (s.balance_amount > 0)          as is_credit,
  (select count(*)::int from public.sale_items si
     where si.sale_id = s.id and si.is_deleted = false) as line_count,
  (select coalesce(sum(si.quantity), 0)::numeric(12,3) from public.sale_items si
     where si.sale_id = s.id and si.is_deleted = false) as total_qty
from public.sales s
left join public.customers c on c.id = s.customer_id
left join public.profiles  p on p.id = s.created_by
where s.is_deleted = false;

-- ----------------------------------------------------------------------------
-- v_sale_items_detail — line items with product labels + margin (STAFF ONLY)
-- ----------------------------------------------------------------------------
create or replace view public.v_sale_items_detail
with (security_invoker = on) as
select
  si.id,
  si.sale_id,
  s.bill_no,
  s.sale_date,
  si.product_id,
  pr.sku,
  pr.name                       as product_name,
  pr.unit,
  pr.rack_location,
  pr.barcode,
  si.quantity,
  si.unit_price,
  si.cost_price,
  si.discount,
  si.line_total,
  round(si.line_total - si.quantity * si.cost_price, 2) as line_profit,
  case when si.line_total > 0
    then round((si.line_total - si.quantity * si.cost_price) / si.line_total * 100, 1)
    else 0 end                  as margin_pct
from public.sale_items si
join public.products  pr on pr.id = si.product_id
join public.sales     s  on s.id  = si.sale_id
where si.is_deleted = false and s.is_deleted = false;

-- ----------------------------------------------------------------------------
-- v_returns_list — both sales and purchase returns with the original document
-- ----------------------------------------------------------------------------
create or replace view public.v_returns_list
with (security_invoker = on) as
select
  r.id,
  r.return_no,
  r.kind,
  r.original_id,
  case r.kind
    when 'sale'     then (select s.bill_no     from public.sales s     where s.id = r.original_id)
    when 'purchase' then (select p.purchase_no from public.purchases p where p.id = r.original_id)
  end                          as original_no,
  case r.kind
    when 'sale'     then coalesce((select c.name from public.sales s
              join public.customers c on c.id = s.customer_id where s.id = r.original_id), 'Walk-in')
    when 'purchase' then (select su.name from public.purchases p
              join public.suppliers su on su.id = p.supplier_id where p.id = r.original_id)
  end                          as party_name,
  r.return_date,
  r.subtotal,
  r.tax_amount,
  r.total,
  r.restock,
  r.refund_method,
  r.credit_note,
  r.reason,
  r.notes,
  r.created_by,
  coalesce(p.full_name, 'System') as recorder_name,
  (select count(*)::int from public.return_items ri where ri.return_id = r.id) as line_count
from public.returns r
left join public.profiles p on p.id = r.created_by
where r.is_deleted = false;

create or replace view public.v_return_items_detail
with (security_invoker = on) as
select
  ri.id,
  ri.return_id,
  r.return_no,
  r.kind,
  ri.product_id,
  p.sku,
  p.name                         as product_name,
  p.unit,
  ri.original_item_id,
  ri.quantity,
  ri.unit_price,
  ri.cost_price,
  ri.line_total,
  ri.restocked
from public.return_items ri
join public.returns    r on r.id = ri.return_id
join public.products   p on p.id = ri.product_id;

-- ----------------------------------------------------------------------------
-- v_payments_detail — every receipt and disbursement with its document
-- ----------------------------------------------------------------------------
create or replace view public.v_payments_detail
with (security_invoker = on) as
select
  pm.id,
  pm.paid_at,
  pm.direction,
  pm.method,
  pm.amount,
  pm.customer_id,
  pm.supplier_id,
  coalesce(c.name, s2.name, '—') as party_name,
  pm.sale_id,
  (select s.bill_no from public.sales s where s.id = pm.sale_id)          as bill_no,
  pm.purchase_id,
  (select p.purchase_no from public.purchases p where p.id = pm.purchase_id) as purchase_no,
  pm.cheque_id,
  ch.cheque_no,
  ch.bank,
  ch.status                as cheque_status,
  ch.cheque_date,
  pm.reference_no,
  pm.note,
  pm.recorded_by,
  coalesce(pr.full_name, 'System') as recorder_name
from public.payments pm
left join public.customers  c  on c.id  = pm.customer_id
left join public.suppliers  s2 on s2.id = pm.supplier_id
left join public.cheques    ch on ch.id = pm.cheque_id
left join public.profiles   pr on pr.id = pm.recorded_by
where pm.is_deleted = false;

-- ----------------------------------------------------------------------------
-- v_cheques_detail — register with ageing for the PDC calendar
-- ----------------------------------------------------------------------------
create or replace view public.v_cheques_detail
with (security_invoker = on) as
select
  ch.id,
  ch.direction,
  ch.status,
  ch.cheque_no,
  ch.bank,
  ch.branch,
  ch.amount,
  ch.cheque_date,
  ch.party_name,
  ch.customer_id,
  ch.supplier_id,
  ch.sale_id,
  (select s.bill_no from public.sales s where s.id = ch.sale_id) as bill_no,
  ch.purchase_id,
  (select p.purchase_no from public.purchases p where p.id = ch.purchase_id) as purchase_no,
  ch.cleared_date,
  ch.bounced_reason,
  ch.notes,
  ch.recorded_by,
  coalesce(pr.full_name, 'System') as recorder_name,
  ch.created_at,
  (ch.cheque_date - current_date)  as days_to_maturity,
  (ch.cheque_date <= current_date and ch.status = 'pending') as is_due
from public.cheques ch
left join public.profiles pr on pr.id = ch.recorded_by
where ch.is_deleted = false;

-- ----------------------------------------------------------------------------
-- v_expenses_detail / v_income_list
-- ----------------------------------------------------------------------------
create or replace view public.v_expenses_detail
with (security_invoker = on) as
select
  e.id,
  e.title,
  e.amount,
  e.expense_date,
  e.category_id,
  coalesce(ec.name, 'Uncategorised') as category_name,
  e.payment_method,
  e.reference_no,
  e.description,
  e.attachment_url,
  e.is_recurring,
  e.recurring_interval,
  e.next_due_date,
  e.created_by,
  coalesce(pr.full_name, 'System') as recorder_name
from public.expenses e
left join public.expense_categories ec on ec.id = e.category_id
left join public.profiles           pr on pr.id = e.created_by
where e.is_deleted = false;

create or replace view public.v_income_list
with (security_invoker = on) as
select
  i.id,
  i.source,
  i.amount,
  i.income_date,
  i.payment_method,
  i.description,
  i.created_by,
  coalesce(pr.full_name, 'System') as recorder_name
from public.income i
left join public.profiles pr on pr.id = i.created_by
where i.is_deleted = false;

-- ----------------------------------------------------------------------------
-- v_cash_up — tender-wise daily takings for the end-of-day Z report
-- Only cleared/settled money counts; bounced cheque payments are already
-- soft-deleted by trg_cheque_status.
-- ----------------------------------------------------------------------------
create or replace view public.v_cash_up
with (security_invoker = on) as
select
  s.sale_date,
  pm.method,
  count(*)                    as payment_count,
  sum(pm.amount)              as amount
from public.payments pm
join public.sales s on s.id = pm.sale_id
where pm.is_deleted = false
  and pm.direction = 'in'
  and s.is_deleted = false
  and s.status <> 'void'
group by s.sale_date, pm.method;

-- ----------------------------------------------------------------------------
-- Daily reporting series (filters applied by the app on the date columns)
-- ----------------------------------------------------------------------------
create or replace view public.v_sales_returns_daily
with (security_invoker = on) as
select
  r.return_date              as day,
  r.kind,
  r.credit_note,
  sum(r.total)               as total,
  count(*)                   as return_count
from public.returns r
where r.is_deleted = false
group by r.return_date, r.kind, r.credit_note;

create or replace view public.v_expense_daily
with (security_invoker = on) as
select expense_date as day, sum(amount) as total, count(*) as entry_count
from public.expenses
where is_deleted = false
group by expense_date;

create or replace view public.v_income_daily
with (security_invoker = on) as
select income_date as day, sum(amount) as total, count(*) as entry_count
from public.income
where is_deleted = false
group by income_date;

-- Per-product sales performance (staff only — reads sale_items)
create or replace view public.v_product_sales_summary
with (security_invoker = on) as
select
  si.product_id,
  p.sku,
  p.name                        as product_name,
  cat.name                      as category_name,
  p.unit,
  p.rack_location,
  p.reorder_level,
  sum(si.quantity)              as qty_sold,
  sum(si.line_total)            as revenue,
  sum(si.quantity * si.cost_price) as cogs,
  sum(si.line_total - si.quantity * si.cost_price) as gross_profit,
  max(s.sale_date)              as last_sold_date
from public.sale_items si
join public.sales     s   on s.id = si.sale_id
join public.products  p   on p.id = si.product_id
left join public.categories cat on cat.id = p.category_id
where si.is_deleted = false and s.is_deleted = false and s.status <> 'void'
group by si.product_id, p.sku, p.name, cat.name, p.unit, p.rack_location, p.reorder_level;

-- Movement counts per product for the stock report (staff only)
create or replace view public.v_stock_report
with (security_invoker = on) as
select
  p.id                          as product_id,
  p.sku,
  p.name,
  p.unit,
  p.brand,
  cat.name                      as category_name,
  p.rack_location,
  p.reorder_level,
  p.cost_price,
  p.selling_price,
  coalesce(sum(m.quantity_delta), 0)                    as qty_on_hand,
  coalesce(sum(m.quantity_delta) * p.cost_price, 0)     as value_at_cost,
  coalesce(sum(m.quantity_delta) * p.selling_price, 0)  as value_at_sale,
  coalesce(sum(case when m.quantity_delta < 0 then -m.quantity_delta else 0 end), 0) as qty_out,
  coalesce(sum(case when m.quantity_delta > 0 then m.quantity_delta else 0 end), 0)  as qty_in
from public.products p
left join public.stock_movements m on m.product_id = p.id
left join public.categories cat    on cat.id = p.category_id
where p.is_deleted = false
group by p.id, p.sku, p.name, p.unit, p.brand, cat.name, p.rack_location,
         p.reorder_level, p.cost_price, p.selling_price;

-- ----------------------------------------------------------------------------
-- v_held_bills — POS hold/recall, one row per cashier's parked cart
-- ----------------------------------------------------------------------------
create or replace view public.v_held_bills
with (security_invoker = on) as
select
  h.id,
  h.hold_no,
  h.cart,
  h.customer_id,
  coalesce(c.name, 'Walk-in') as customer_name,
  h.note,
  h.held_by,
  coalesce(p.full_name, 'System') as holder_name,
  h.created_at,
  jsonb_array_length(coalesce(h.cart, '[]'::jsonb)) as line_count,
  (select coalesce(sum(((e)->>'line_total')::numeric), 0)
     from jsonb_array_elements(coalesce(h.cart, '[]'::jsonb)) e) as cart_total
from public.held_bills h
left join public.customers c on c.id = h.customer_id
left join public.profiles  p on p.id = h.held_by;

-- ----------------------------------------------------------------------------
-- v_users — profiles for the settings screen (admin only through RLS)
-- ----------------------------------------------------------------------------
create or replace view public.v_users
with (security_invoker = on) as
select
  pr.id,
  pr.email,
  pr.full_name,
  pr.phone,
  pr.role,
  pr.is_active,
  pr.avatar_url,
  pr.created_at,
  pr.updated_at,
  (select count(*)::int from public.sales s
     where s.created_by = pr.id and s.is_deleted = false) as bill_count,
  (select coalesce(sum(s.grand_total), 0) from public.sales s
     where s.created_by = pr.id and s.is_deleted = false) as sales_total
from public.profiles pr;

-- ----------------------------------------------------------------------------
-- v_audit_feed — audit_log with a readable action summary
-- ----------------------------------------------------------------------------
create or replace view public.v_audit_feed
with (security_invoker = on) as
select
  a.id,
  a.table_name,
  a.row_id,
  a.action,
  a.old_data,
  a.new_data,
  a.user_id,
  coalesce(a.user_email, 'system') as user_email,
  coalesce(p.full_name, a.user_email, 'System') as user_name,
  a.created_at
from public.audit_log a
left join public.profiles p on p.id = a.user_id
order by a.created_at desc;

-- ----------------------------------------------------------------------------
-- Grants (idempotent — Supabase already grants these)
-- ----------------------------------------------------------------------------
grant select on
  public.v_sales_list, public.v_sale_items_detail, public.v_returns_list,
  public.v_return_items_detail, public.v_payments_detail, public.v_cheques_detail,
  public.v_expenses_detail, public.v_income_list, public.v_cash_up,
  public.v_sales_returns_daily, public.v_expense_daily, public.v_income_daily,
  public.v_product_sales_summary, public.v_stock_report, public.v_held_bills,
  public.v_users, public.v_audit_feed
to authenticated;

-- held_bills needs its sequence grant for the default hold_no
grant usage, select on sequence public.hold_no_seq to authenticated;
