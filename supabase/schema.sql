-- ============================================================================
-- PENZO PARTS — POS & Inventory Management System
-- Phase 1 — Complete PostgreSQL schema, functions, views, triggers, RLS
-- Target: Supabase (PostgreSQL 15+). Run via SQL Editor or `supabase db push`.
-- ============================================================================
-- Conventions
--   * Every stock change is a row in stock_movements. Stock is NEVER mutated directly.
--   * cost_price is snapshotted on sale_items at time of sale (profit accuracy).
--   * Soft delete via is_deleted on all transactional tables.
--   * audit_log records who changed what (trigger-based).
--   * Cashiers get no cost/profit access: products & sale_items tables are
--     staff-only; cashiers read v_products_pos and call fn_get_bill / fn_checkout.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- ENUMS
-- ----------------------------------------------------------------------------
create type public.user_role         as enum ('admin', 'manager', 'cashier');
create type public.customer_type     as enum ('retail', 'wholesale', 'garage');
create type public.payment_method    as enum ('cash', 'card', 'bank', 'cheque', 'credit');
create type public.cheque_direction  as enum ('received', 'issued');
create type public.cheque_status     as enum ('pending', 'deposited', 'cleared', 'bounced', 'returned', 'cancelled');
create type public.movement_type     as enum ('opening', 'purchase', 'sale', 'sales_return', 'purchase_return', 'adjustment');
create type public.return_kind       as enum ('sale', 'purchase');
create type public.sale_status       as enum ('completed', 'partially_returned', 'fully_returned', 'void');
create type public.audit_action      as enum ('insert', 'update', 'delete');

-- ----------------------------------------------------------------------------
-- PROFILES (mirrors auth.users; role lives here)
-- ----------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  full_name    text not null default '',
  phone        text,
  role         public.user_role not null default 'cashier',
  is_active    boolean not null default true,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- SETTINGS (single row, id = 1)
-- ----------------------------------------------------------------------------
create table public.settings (
  id                   int primary key default 1 check (id = 1),
  shop_name            text not null default 'H.K Motors Bike',
  address              text default '',
  phone                text default '',
  email                text default '',
  tax_number           text default '',
  logo_url             text,
  receipt_footer       text default 'Thank you for your business!',
  currency_code        text not null default 'LKR',
  currency_symbol      text not null default 'Rs.',
  tax_rate             numeric(5,2) not null default 0,
  invoice_prefix       text not null default 'INV',
  allow_negative_stock boolean not null default false,
  low_stock_alert      boolean not null default true,
  updated_by           uuid references public.profiles (id),
  updated_at           timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- CATEGORIES (self-referencing nested tree)
-- ----------------------------------------------------------------------------
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references public.categories (id) on delete set null,
  name        text not null,
  slug        text not null unique,
  description text,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  is_deleted  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index categories_parent_idx on public.categories (parent_id);

-- ----------------------------------------------------------------------------
-- SUPPLIERS
-- ----------------------------------------------------------------------------
create table public.suppliers (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  contact_person    text,
  phone             text,
  email             text,
  address           text,
  tax_number        text,
  credit_terms_days int not null default 0,
  opening_balance   numeric(14,2) not null default 0,
  notes             text,
  is_active         boolean not null default true,
  is_deleted        boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index suppliers_name_idx on public.suppliers (lower(name));

-- ----------------------------------------------------------------------------
-- CUSTOMERS
-- ----------------------------------------------------------------------------
create table public.customers (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  type            public.customer_type not null default 'retail',
  phone           text,
  email           text,
  address         text,
  nic             text,
  credit_limit    numeric(14,2) not null default 0,
  opening_balance numeric(14,2) not null default 0,
  vehicle_notes   text,
  notes           text,
  is_active       boolean not null default true,
  is_deleted      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index customers_name_idx  on public.customers (lower(name));
create index customers_phone_idx on public.customers (phone);

-- ----------------------------------------------------------------------------
-- PRODUCTS
-- ----------------------------------------------------------------------------
create table public.products (
  id                uuid primary key default gen_random_uuid(),
  sku               text not null unique,
  barcode           text unique,
  name              text not null,
  category_id       uuid references public.categories (id) on delete set null,
  brand             text,
  unit              text not null default 'pcs',
  vehicle_make      text,
  vehicle_model     text,
  vehicle_year_from int,
  vehicle_year_to   int,
  rack_location     text,
  cost_price        numeric(12,2) not null default 0,
  selling_price     numeric(12,2) not null default 0,
  wholesale_price   numeric(12,2),
  reorder_level     numeric(12,3) not null default 5,
  image_url         text,
  description       text,
  is_active         boolean not null default true,
  is_deleted        boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index products_name_idx          on public.products (lower(name));
create index products_category_idx      on public.products (category_id);
create index products_brand_idx         on public.products (lower(brand));
create index products_barcode_lower_idx on public.products (lower(barcode));

-- ----------------------------------------------------------------------------
-- STOCK MOVEMENTS (ledger — single source of truth for stock)
-- ----------------------------------------------------------------------------
create table public.stock_movements (
  id              bigint generated always as identity primary key,
  product_id      uuid not null references public.products (id) on delete restrict,
  quantity_delta  numeric(12,3) not null,
  movement_type   public.movement_type not null,
  reference_table text,
  reference_id    uuid,
  reason          text,
  note            text,
  recorded_by     uuid references public.profiles (id),
  created_at      timestamptz not null default now()
);
create index stock_movements_product_idx on public.stock_movements (product_id, created_at desc);
create index stock_movements_type_idx    on public.stock_movements (movement_type);
create index stock_movements_date_idx    on public.stock_movements (created_at);

-- ----------------------------------------------------------------------------
-- PURCHASES
-- ----------------------------------------------------------------------------
create sequence public.purchase_no_seq start 1;

create table public.purchases (
  id                  uuid primary key default gen_random_uuid(),
  purchase_no         text not null unique default ('PO-' || lpad(nextval('public.purchase_no_seq')::text, 6, '0')),
  supplier_id         uuid references public.suppliers (id) on delete restrict,
  supplier_invoice_no text,
  purchase_date       date not null default current_date,
  subtotal            numeric(14,2) not null default 0,
  discount            numeric(14,2) not null default 0,
  tax_amount          numeric(14,2) not null default 0,
  total               numeric(14,2) not null default 0,
  paid_amount         numeric(14,2) not null default 0,
  notes               text,
  created_by          uuid references public.profiles (id),
  is_deleted          boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index purchases_supplier_idx on public.purchases (supplier_id, purchase_date desc);
create index purchases_date_idx     on public.purchases (purchase_date);

create table public.purchase_items (
  id          uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases (id) on delete cascade,
  product_id  uuid not null references public.products (id) on delete restrict,
  quantity    numeric(12,3) not null check (quantity > 0),
  unit_cost   numeric(12,2) not null check (unit_cost >= 0),
  tax_rate    numeric(5,2) not null default 0,
  line_total  numeric(14,2) not null default 0,
  is_deleted  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index purchase_items_purchase_idx on public.purchase_items (purchase_id);
create index purchase_items_product_idx  on public.purchase_items (product_id);

-- ----------------------------------------------------------------------------
-- SALES
-- ----------------------------------------------------------------------------
create sequence public.sale_no_seq start 1;

create table public.sales (
  id             uuid primary key default gen_random_uuid(),
  bill_no        text not null unique default ('SO-' || lpad(nextval('public.sale_no_seq')::text, 6, '0')),
  customer_id    uuid references public.customers (id) on delete set null,
  sold_at        timestamptz not null default now(),
  sale_date      date not null default current_date,
  status         public.sale_status not null default 'completed',
  subtotal       numeric(14,2) not null default 0,
  line_discounts numeric(14,2) not null default 0,
  bill_discount  numeric(14,2) not null default 0,
  tax_amount     numeric(14,2) not null default 0,
  grand_total    numeric(14,2) not null default 0,
  paid_amount    numeric(14,2) not null default 0,
  balance_amount numeric(14,2) not null default 0,
  change_amount  numeric(14,2) not null default 0,
  note           text,
  created_by     uuid references public.profiles (id),
  is_deleted     boolean not null default false,
  void_reason    text,
  created_at     timestamptz not null default now()
);
create index sales_date_idx     on public.sales (sale_date desc);
create index sales_customer_idx on public.sales (customer_id);
create index sales_status_idx   on public.sales (status);
create index sales_cashier_idx  on public.sales (created_by);

create table public.sale_items (
  id          uuid primary key default gen_random_uuid(),
  sale_id     uuid not null references public.sales (id) on delete cascade,
  product_id  uuid not null references public.products (id) on delete restrict,
  quantity    numeric(12,3) not null check (quantity > 0),
  unit_price  numeric(12,2) not null,
  cost_price  numeric(12,2) not null,          -- SNAPSHOT at time of sale
  discount    numeric(14,2) not null default 0,
  line_total  numeric(14,2) not null default 0,
  is_deleted  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index sale_items_sale_idx    on public.sale_items (sale_id);
create index sale_items_product_idx on public.sale_items (product_id);

-- ----------------------------------------------------------------------------
-- HELD BILLS (POS hold / recall)
-- ----------------------------------------------------------------------------
create sequence public.hold_no_seq start 1;

create table public.held_bills (
  id          uuid primary key default gen_random_uuid(),
  hold_no     int not null default nextval('public.hold_no_seq'),
  cart        jsonb not null,
  customer_id uuid references public.customers (id) on delete set null,
  note        text,
  held_by     uuid references public.profiles (id),
  created_at  timestamptz not null default now()
);
create index held_bills_user_idx on public.held_bills (held_by, created_at desc);

-- ----------------------------------------------------------------------------
-- CHEQUES (created before payments due to FK direction)
-- ----------------------------------------------------------------------------
create table public.cheques (
  id             uuid primary key default gen_random_uuid(),
  direction      public.cheque_direction not null,
  status         public.cheque_status not null default 'pending',
  cheque_no      text not null,
  bank           text not null,
  branch         text,
  amount         numeric(14,2) not null check (amount > 0),
  cheque_date    date not null,
  party_name     text not null,
  customer_id    uuid references public.customers (id) on delete restrict,
  supplier_id    uuid references public.suppliers (id) on delete restrict,
  sale_id        uuid references public.sales (id) on delete restrict,
  purchase_id    uuid references public.purchases (id) on delete restrict,
  cleared_date   date,
  bounced_reason text,
  notes          text,
  recorded_by    uuid references public.profiles (id),
  is_deleted     boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index cheques_status_idx on public.cheques (status, cheque_date);
create index cheques_date_idx   on public.cheques (cheque_date);
create index cheques_party_idx  on public.cheques (customer_id, supplier_id);

-- ----------------------------------------------------------------------------
-- PAYMENTS
-- ----------------------------------------------------------------------------
create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  direction    text not null check (direction in ('in', 'out')),
  method       public.payment_method not null,
  amount       numeric(14,2) not null check (amount > 0),
  customer_id  uuid references public.customers (id) on delete restrict,
  supplier_id  uuid references public.suppliers (id) on delete restrict,
  sale_id      uuid references public.sales (id) on delete restrict,
  purchase_id  uuid references public.purchases (id) on delete restrict,
  cheque_id    uuid references public.cheques (id) on delete restrict,
  reference_no text,
  note         text,
  paid_at      timestamptz not null default now(),
  recorded_by  uuid references public.profiles (id),
  is_deleted   boolean not null default false,
  created_at   timestamptz not null default now()
);
create index payments_customer_idx on public.payments (customer_id, paid_at desc);
create index payments_supplier_idx on public.payments (supplier_id, paid_at desc);
create index payments_sale_idx     on public.payments (sale_id);
create index payments_purchase_idx on public.payments (purchase_id);
create index payments_date_idx     on public.payments (paid_at);

-- ----------------------------------------------------------------------------
-- RETURNS
-- ----------------------------------------------------------------------------
create sequence public.return_no_seq start 1;

create table public.returns (
  id            uuid primary key default gen_random_uuid(),
  return_no     text not null unique default ('RT-' || lpad(nextval('public.return_no_seq')::text, 6, '0')),
  kind          public.return_kind not null,
  original_id   uuid not null,                     -- sale_id or purchase_id
  return_date   date not null default current_date,
  subtotal      numeric(14,2) not null default 0,
  tax_amount    numeric(14,2) not null default 0,
  total         numeric(14,2) not null default 0,
  restock       boolean not null default true,
  refund_method public.payment_method,             -- null => credit note
  credit_note   boolean not null default false,
  reason        text,
  notes         text,
  created_by    uuid references public.profiles (id),
  is_deleted    boolean not null default false,
  created_at    timestamptz not null default now()
);
create index returns_kind_idx     on public.returns (kind, return_date desc);
create index returns_original_idx on public.returns (original_id);

create table public.return_items (
  id               uuid primary key default gen_random_uuid(),
  return_id        uuid not null references public.returns (id) on delete cascade,
  product_id       uuid not null references public.products (id) on delete restrict,
  original_item_id uuid references public.sale_items (id) on delete set null,
  quantity         numeric(12,3) not null check (quantity > 0),
  unit_price       numeric(12,2) not null,
  cost_price       numeric(12,2) not null default 0,
  line_total       numeric(14,2) not null default 0,
  restocked        boolean not null default true,
  created_at       timestamptz not null default now()
);
create index return_items_return_idx  on public.return_items (return_id);
create index return_items_product_idx on public.return_items (product_id);

-- ----------------------------------------------------------------------------
-- EXPENSES & INCOME
-- ----------------------------------------------------------------------------
create table public.expense_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  sort_order int not null default 0
);

create table public.expenses (
  id                 uuid primary key default gen_random_uuid(),
  category_id        uuid references public.expense_categories (id) on delete set null,
  title              text not null,
  amount             numeric(14,2) not null check (amount > 0),
  expense_date       date not null default current_date,
  payment_method     public.payment_method not null default 'cash',
  reference_no       text,
  description        text,
  attachment_url     text,
  is_recurring       boolean not null default false,
  recurring_interval text check (recurring_interval in ('daily','weekly','monthly','quarterly','yearly')),
  next_due_date      date,
  created_by         uuid references public.profiles (id),
  is_deleted         boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index expenses_date_idx on public.expenses (expense_date desc);

create table public.income (
  id             uuid primary key default gen_random_uuid(),
  source         text not null,
  amount         numeric(14,2) not null check (amount > 0),
  income_date    date not null default current_date,
  payment_method public.payment_method not null default 'cash',
  description    text,
  created_by     uuid references public.profiles (id),
  is_deleted     boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index income_date_idx on public.income (income_date desc);

-- ----------------------------------------------------------------------------
-- AUDIT LOG
-- ----------------------------------------------------------------------------
create table public.audit_log (
  id         bigint generated always as identity primary key,
  table_name text not null,
  row_id     text,
  action     public.audit_action not null,
  old_data   jsonb,
  new_data   jsonb,
  user_id    uuid,
  user_email text,
  created_at timestamptz not null default now()
);
create index audit_log_table_idx on public.audit_log (table_name, created_at desc);
create index audit_log_user_idx  on public.audit_log (user_id, created_at desc);

-- ============================================================================
-- ROLE HELPERS (SECURITY DEFINER — avoids RLS recursion on profiles)
-- ============================================================================
create or replace function public.current_user_role()
returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and is_active;
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_user_role() = 'admin', false);
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_user_role() in ('admin','manager'), false);
$$;

-- ============================================================================
-- DEFAULT / SYNC TRIGGERS
-- ============================================================================
-- Auto-generate barcode when left empty
create or replace function public.fn_product_defaults()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.barcode is null or new.barcode = '' then
    new.barcode := '2' || lpad((floor(random() * 1e12))::bigint::text, 12, '0');
  end if;
  return new;
end $$;
create trigger trg_product_defaults before insert on public.products
  for each row execute function public.fn_product_defaults();

create or replace function public.fn_touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;

create trigger trg_profiles_touch   before update on public.profiles   for each row execute function public.fn_touch_updated_at();
create trigger trg_categories_touch before update on public.categories for each row execute function public.fn_touch_updated_at();
create trigger trg_products_touch   before update on public.products   for each row execute function public.fn_touch_updated_at();
create trigger trg_suppliers_touch  before update on public.suppliers  for each row execute function public.fn_touch_updated_at();
create trigger trg_customers_touch  before update on public.customers  for each row execute function public.fn_touch_updated_at();
create trigger trg_purchases_touch  before update on public.purchases  for each row execute function public.fn_touch_updated_at();
create trigger trg_returns_touch    before update on public.returns    for each row execute function public.fn_touch_updated_at();
create trigger trg_expenses_touch   before update on public.expenses   for each row execute function public.fn_touch_updated_at();
create trigger trg_income_touch     before update on public.income     for each row execute function public.fn_touch_updated_at();
create trigger trg_settings_touch   before update on public.settings   for each row execute function public.fn_touch_updated_at();

-- Mirror auth.users -> profiles; role/full_name from user metadata
create or replace function public.fn_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'cashier')
  )
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.fn_handle_new_user();

-- ============================================================================
-- AUDIT TRIGGER
-- ============================================================================
create or replace function public.fn_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb; v_new jsonb; v_row text;
begin
  if tg_op = 'DELETE' then
    v_old := to_jsonb(old); v_row := old.id::text;
  elsif tg_op = 'INSERT' then
    v_new := to_jsonb(new); v_row := new.id::text;
  else
    v_old := to_jsonb(old); v_new := to_jsonb(new); v_row := new.id::text;
  end if;
  insert into public.audit_log (table_name, row_id, action, old_data, new_data, user_id, user_email)
  values (
    tg_table_name, v_row,
    case tg_op when 'INSERT' then 'insert' when 'UPDATE' then 'update' else 'delete' end::public.audit_action,
    v_old, v_new, auth.uid(), coalesce(auth.jwt()->>'email', '')
  );
  return coalesce(new, old);
end $$;

create trigger audit_categories  after insert or update or delete on public.categories      for each row execute function public.fn_audit();
create trigger audit_products    after insert or update or delete on public.products        for each row execute function public.fn_audit();
create trigger audit_suppliers   after insert or update or delete on public.suppliers       for each row execute function public.fn_audit();
create trigger audit_customers   after insert or update or delete on public.customers       for each row execute function public.fn_audit();
create trigger audit_purchases   after insert or update or delete on public.purchases       for each row execute function public.fn_audit();
create trigger audit_sales       after insert or update or delete on public.sales           for each row execute function public.fn_audit();
create trigger audit_payments    after insert or update or delete on public.payments        for each row execute function public.fn_audit();
create trigger audit_cheques     after insert or update or delete on public.cheques         for each row execute function public.fn_audit();
create trigger audit_returns     after insert or update or delete on public.returns         for each row execute function public.fn_audit();
create trigger audit_expenses    after insert or update or delete on public.expenses        for each row execute function public.fn_audit();
create trigger audit_income      after insert or update or delete on public.income          for each row execute function public.fn_audit();
create trigger audit_settings    after update on public.settings                            for each row execute function public.fn_audit();
create trigger audit_profiles    after insert or update or delete on public.profiles        for each row execute function public.fn_audit();

-- ============================================================================
-- VIEWS
-- ============================================================================
-- Security invoker: the querying role's RLS applies. Direct readers are staff
-- (products/inventory pages, both staff routes). Cashiers never read this view
-- directly — they reach stock through v_products_pos (definer), which evaluates
-- it as its owner, so the POS keeps working for them.
create or replace view public.v_stock_levels with (security_invoker = true) as
select p.id as product_id,
       coalesce(sum(m.quantity_delta), 0) as qty_on_hand
from public.products p
left join public.stock_movements m on m.product_id = p.id
where p.is_deleted = false
group by p.id;

-- POS-safe product view: NO cost / profit columns. Readable by any role.
-- INTENTIONALLY a SECURITY DEFINER view: cashiers have no SELECT on `products`
-- (its RLS is is_staff()), so this owner-executed view is the controlled way to
-- expose a cost-free projection without granting the base table. Do NOT switch
-- it to security_invoker or the POS/labels/dashboard break for cashiers.
create or replace view public.v_products_pos as
select pr.id, pr.sku, pr.barcode, pr.name, pr.category_id, c.name as category_name,
       pr.brand, pr.unit, pr.vehicle_make, pr.vehicle_model,
       pr.vehicle_year_from, pr.vehicle_year_to,
       pr.rack_location, pr.selling_price, pr.wholesale_price,
       pr.reorder_level, pr.image_url, pr.is_active,
       coalesce(s.qty_on_hand, 0) as qty_on_hand,
       (coalesce(s.qty_on_hand, 0) <= pr.reorder_level) as is_low_stock
from public.products pr
left join public.categories c on c.id = pr.category_id
left join public.v_stock_levels s on s.product_id = pr.id
where pr.is_deleted = false and pr.is_active;

-- Full product + stock (admin/manager screens)
create or replace view public.v_products_full as
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

-- Customer balance = opening + credit sales + this-credit-adjustments - receipts - credit notes
-- INTENTIONALLY a SECURITY DEFINER view: the Customers page and dashboard are open
-- to cashiers, who under RLS can only read their OWN sales/payments. A security-invoker
-- version would silently understate every customer's balance for them. Definer keeps
-- company-wide totals correct; acceptable for this single-tenant, trusted-staff shop.
create or replace view public.v_customer_balances as
select cu.id, cu.name,
       cu.opening_balance
         + coalesce(cr.total_credit, 0)
         - coalesce(rc.total_on_account_in, 0)
         - coalesce(rc.total_refunds_out, 0)
         - coalesce(cn.total_credit_notes, 0) as balance
from public.customers cu
left join (
  select s.customer_id, sum(s.balance_amount) as total_credit
  from public.sales s
  where s.status <> 'void' and s.is_deleted = false and s.customer_id is not null
  group by s.customer_id
) cr on cr.customer_id = cu.id
left join (
  select p.customer_id,
         sum(case when p.direction = 'in' then p.amount else 0 end) as total_on_account_in,
         sum(case when p.direction = 'out' then p.amount else 0 end) as total_refunds_out
  from public.payments p
  where p.is_deleted = false and p.customer_id is not null and p.sale_id is null
    and coalesce(p.method, 'cash') <> 'credit'
  group by p.customer_id
) rc on rc.customer_id = cu.id
left join (
  select s.customer_id, sum(r.total) as total_credit_notes
  from public.returns r
  join public.sales s on s.id = r.original_id
  where r.kind = 'sale' and r.credit_note and r.is_deleted = false
  group by s.customer_id
) cn on cn.customer_id = cu.id
where cu.is_deleted = false;

-- Supplier balance = opening + (purchases - paid on invoices) - on-account payments - returns
-- Security invoker: read only by staff (Suppliers/Purchases are staff routes; the
-- dashboard fetches it under the `staff` guard), and staff can read every base table.
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

-- Sync sales.paid_amount / balance_amount whenever payments change
create or replace function public.fn_sync_sale_payments()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_sale uuid; v_paid numeric;
begin
  v_sale := coalesce(new.sale_id, old.sale_id);
  if v_sale is null then return coalesce(new, old); end if;
  select coalesce(sum(p.amount), 0) into v_paid
  from public.payments p
  left join public.cheques ch on ch.id = p.cheque_id
  where p.sale_id = v_sale and p.is_deleted = false and p.method <> 'credit'
    and (p.cheque_id is null or ch.status not in ('bounced','returned','cancelled'));
  update public.sales
  set paid_amount    = v_paid,
      balance_amount = greatest(grand_total - v_paid, 0)
  where id = v_sale;
  return coalesce(new, old);
end $$;
create trigger trg_sync_sale_payments
  after insert or update or delete on public.payments
  for each row execute function public.fn_sync_sale_payments();

create or replace function public.fn_sync_purchase_payments()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_pur uuid; v_paid numeric;
begin
  v_pur := coalesce(new.purchase_id, old.purchase_id);
  if v_pur is null then return coalesce(new, old); end if;
  select coalesce(sum(p.amount), 0) into v_paid
  from public.payments p
  left join public.cheques ch on ch.id = p.cheque_id
  where p.purchase_id = v_pur and p.is_deleted = false
    and (p.cheque_id is null or ch.status not in ('bounced','returned','cancelled'));
  update public.purchases set paid_amount = v_paid where id = v_pur;
  return coalesce(new, old);
end $$;
create trigger trg_sync_purchase_payments
  after insert or update or delete on public.payments
  for each row execute function public.fn_sync_purchase_payments();

-- Bounced / returned / cancelled cheque reverses its payments → restores balances
create or replace function public.fn_cheque_status_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('bounced','returned','cancelled')
     and old.status not in ('bounced','returned','cancelled') then
    update public.payments
    set is_deleted = true,
        note = coalesce(note || ' | ', '') || 'reversed: cheque ' || new.status
    where cheque_id = new.id and is_deleted = false;
    -- sale/purchase paid_amount recomputed by trg_sync_* triggers above
    update public.cheques set cleared_date = null where id = new.id and status = 'bounced';
  end if;
  return new;
end $$;
create trigger trg_cheque_status
  after update of status on public.cheques
  for each row execute function public.fn_cheque_status_changed();

-- ============================================================================
-- CORE BUSINESS FUNCTIONS (SECURITY DEFINER, called via Supabase RPC)
-- ============================================================================

-- Weighted-average cost update on purchase receipt
create or replace function public.fn_apply_weighted_cost(p_product_id uuid, p_qty numeric, p_new_cost numeric)
returns void language plpgsql security definer set search_path = public as $$
declare v_cur_cost numeric; v_on_hand numeric;
begin
  select cost_price into v_cur_cost from public.products where id = p_product_id for update;
  select coalesce(sum(quantity_delta), 0) into v_on_hand
    from public.stock_movements where product_id = p_product_id;
  -- weight existing stock at old cost against the incoming batch
  if v_on_hand + p_qty > 0 then
    update public.products
    set cost_price = round(((greatest(v_on_hand,0) * coalesce(v_cur_cost,0)) + (p_qty * p_new_cost))
                           / (greatest(v_on_hand,0) + p_qty), 2)
    where id = p_product_id;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- fn_checkout — ATOMIC POS checkout: sale + items + movements + payments
-- p_items:    [{"product_id":uuid,"quantity":num,"unit_price":num,"discount":num}]
--             (cost_price is ignored — the function snapshots it from products)
-- p_payments: [{"method":"cash|card|bank|cheque|credit","amount":num,
--               "cheque_no":?,"bank":?,"branch":?,"cheque_date":?,"party_name":?,"reference_no":?}]
-- ---------------------------------------------------------------------------
create or replace function public.fn_checkout(
  p_customer_id   uuid,
  p_items         jsonb,
  p_bill_discount numeric,
  p_discount_mode text,            -- 'percent' | 'amount'
  p_payments      jsonb,
  p_note          text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_settings   record;
  v_item       record;
  v_prod       record;
  v_pay        record;
  v_qty        numeric;
  v_cost       numeric;
  v_subtotal   numeric := 0;
  v_line_discs numeric := 0;
  v_bill_disc  numeric := 0;
  v_tax        numeric := 0;
  v_net        numeric;
  v_grand      numeric := 0;
  v_paid_sum   numeric := 0;
  v_credit_sum numeric := 0;
  v_sale_id    uuid;
  v_bill_no    text;
  v_cheque_id  uuid;
  v_avail      numeric;
  v_new_bal    numeric;
  v_limit      numeric;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_settings from public.settings where id = 1;

  if coalesce(jsonb_array_length(p_items), 0) = 0 then raise exception 'Cart is empty'; end if;

  -- 1. Validate stock BEFORE writing anything (whole function = one transaction)
  for v_item in
    select (e)->>'product_id' as pid, ((e)->>'quantity')::numeric as qty,
           ((e)->>'unit_price')::numeric as price,
           coalesce(((e)->>'discount')::numeric, 0) as disc
    from jsonb_array_elements(p_items) e
  loop
    if v_item.qty is null or v_item.qty <= 0 then raise exception 'Invalid quantity'; end if;
    if v_item.price is null or v_item.price < 0 then raise exception 'Invalid price'; end if;
    select * into v_prod from public.products
      where id = v_item.pid::uuid and is_deleted = false and is_active;
    if not found then raise exception 'Product not found or inactive: %', v_item.pid; end if;
    if not v_settings.allow_negative_stock then
      select coalesce(sum(m.quantity_delta), 0) into v_avail
        from public.stock_movements m where m.product_id = v_prod.id;
      if v_avail < v_item.qty then
        raise exception 'Insufficient stock for % (%) — available %',
          v_prod.name, v_prod.sku, v_avail;
      end if;
    end if;
  end loop;

  -- 2. Sale header (bill_no auto from sequence default)
  insert into public.sales (customer_id, note, created_by)
  values (p_customer_id, p_note, auth.uid())
  returning id, bill_no into v_sale_id, v_bill_no;

  -- 3. Items + stock movements + cost snapshot
  for v_item in
    select (e)->>'product_id' as pid, ((e)->>'quantity')::numeric as qty,
           ((e)->>'unit_price')::numeric as price,
           coalesce(((e)->>'discount')::numeric, 0) as disc
    from jsonb_array_elements(p_items) e
  loop
    if v_item.disc < 0 or v_item.qty * v_item.price - v_item.disc < 0 then
      raise exception 'Line discount exceeds line total';
    end if;
    -- Cost is read from the product row, never from the payload: a cashier
    -- cannot forge it and a stale on-screen preview cannot distort profit.
    select p.cost_price into v_cost from public.products p where p.id = v_item.pid::uuid;
    v_subtotal   := v_subtotal + v_item.qty * v_item.price;
    v_line_discs := v_line_discs + v_item.disc;

    insert into public.sale_items (sale_id, product_id, quantity, unit_price, cost_price, discount, line_total)
    values (v_sale_id, v_item.pid::uuid, v_item.qty, v_item.price, coalesce(v_cost, 0),
            v_item.disc, round(v_item.qty * v_item.price - v_item.disc, 2));

    insert into public.stock_movements (product_id, quantity_delta, movement_type, reference_table, reference_id, recorded_by)
    values (v_item.pid::uuid, -v_item.qty, 'sale', 'sales', v_sale_id, auth.uid());
  end loop;

  v_bill_disc := case
    when p_discount_mode = 'percent' then round((v_subtotal - v_line_discs) * coalesce(p_bill_discount, 0) / 100, 2)
    else coalesce(p_bill_discount, 0)
  end;
  if v_bill_disc < 0 then raise exception 'Discount cannot be negative'; end if;

  v_net := round(v_subtotal - v_line_discs - v_bill_disc, 2);
  v_tax := round(v_net * coalesce(v_settings.tax_rate, 0) / 100, 2);
  v_grand := v_net + v_tax;

  update public.sales
  set subtotal = v_subtotal, line_discounts = v_line_discs,
      bill_discount = v_bill_disc, tax_amount = v_tax, grand_total = v_grand
  where id = v_sale_id;

  -- 4. Payments (split tender, cheque rows, credit)
  for v_pay in
    select (e)->>'method' as method, ((e)->>'amount')::numeric as amount,
           (e)->>'cheque_no' as cheque_no, (e)->>'bank' as bank, (e)->>'branch' as branch,
           (e)->>'cheque_date' as cheque_date, (e)->>'party_name' as party_name,
           (e)->>'reference_no' as reference_no
    from jsonb_array_elements(p_payments) e
  loop
    v_cheque_id := null;
    if v_pay.amount is null or v_pay.amount <= 0 then raise exception 'Invalid payment amount'; end if;
    if v_pay.method not in ('cash','card','bank','cheque','credit') then
      raise exception 'Unknown payment method %', v_pay.method;
    end if;
    if v_pay.method = 'cheque' then
      insert into public.cheques (direction, status, cheque_no, bank, branch, amount,
                                  cheque_date, party_name, customer_id, sale_id, recorded_by)
      values ('received', 'pending',
              coalesce(v_pay.cheque_no, ''), coalesce(v_pay.bank, ''), v_pay.branch, v_pay.amount,
              coalesce(v_pay.cheque_date::date, current_date),
              coalesce(v_pay.party_name, ''), p_customer_id, v_sale_id, auth.uid())
      returning id into v_cheque_id;
    end if;
    if v_pay.method = 'credit' then
      if p_customer_id is null then raise exception 'Credit sale requires a customer'; end if;
      v_credit_sum := v_credit_sum + v_pay.amount;
    else
      v_paid_sum := v_paid_sum + v_pay.amount;
    end if;
    insert into public.payments (direction, method, amount, customer_id, sale_id, cheque_id, reference_no, recorded_by)
    values ('in', v_pay.method::public.payment_method, v_pay.amount,
            p_customer_id, v_sale_id, v_cheque_id, v_pay.reference_no, auth.uid());
  end loop;

  if v_paid_sum + v_credit_sum < v_grand then
    raise exception 'Payments (%) less than total (%)', v_paid_sum + v_credit_sum, v_grand;
  end if;
  if p_customer_id is not null and v_credit_sum > 0 then
    select credit_limit into v_limit from public.customers where id = p_customer_id;
    select balance into v_new_bal from public.v_customer_balances where id = p_customer_id;
    v_new_bal := coalesce(v_new_bal, 0);   -- view already includes this sale's balance_amount
    if coalesce(v_limit, 0) > 0 and v_new_bal > v_limit then
      raise exception 'Customer credit limit exceeded (limit %, new balance %)', v_limit, v_new_bal;
    end if;
  end if;

  return jsonb_build_object(
    'sale_id',        v_sale_id,
    'bill_no',        v_bill_no,
    'subtotal',       v_subtotal,
    'discount',       v_line_discs + v_bill_disc,
    'tax_amount',     v_tax,
    'grand_total',    v_grand,
    'paid_amount',    v_paid_sum,
    'credit_amount',  v_credit_sum,
    'balance_amount', greatest(v_grand - v_paid_sum - v_credit_sum, 0),
    'change_amount',  greatest(v_paid_sum - v_grand + v_credit_sum, 0)
  );
end $$;

-- ---------------------------------------------------------------------------
-- fn_record_sale_return
-- p_items: [{"sale_item_id":uuid,"quantity":num}]
-- ---------------------------------------------------------------------------
create or replace function public.fn_record_sale_return(
  p_sale_id       uuid,
  p_items         jsonb,
  p_restock       boolean,
  p_refund_method public.payment_method,   -- null => credit note on customer account
  p_reason        text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_sale   record;
  v_item   record;
  v_si     record;
  v_total  numeric := 0;
  v_return_id uuid;
  v_return_no text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if coalesce(jsonb_array_length(p_items), 0) = 0 then raise exception 'No items selected'; end if;

  select * into v_sale from public.sales where id = p_sale_id and is_deleted = false for update;
  if not found then raise exception 'Sale not found'; end if;

  insert into public.returns (kind, original_id, restock, refund_method, credit_note, reason, created_by)
  values ('sale', p_sale_id, p_restock, p_refund_method, p_refund_method is null, p_reason, auth.uid())
  returning id, return_no into v_return_id, v_return_no;

  for v_item in
    select (e)->>'sale_item_id' as sii, ((e)->>'quantity')::numeric as qty
    from jsonb_array_elements(p_items) e
  loop
    select * into v_si from public.sale_items
      where id = v_item.sii::uuid and sale_id = p_sale_id and is_deleted = false for update;
    if not found then raise exception 'Sale item not found'; end if;
    if v_item.qty <= 0 or v_item.qty > v_si.quantity then
      raise exception 'Invalid return quantity for %', v_si.id;
    end if;

    insert into public.return_items (return_id, product_id, original_item_id, quantity,
                                     unit_price, cost_price, line_total, restocked)
    values (v_return_id, v_si.product_id, v_si.id, v_item.qty, v_si.unit_price,
            v_si.cost_price, round(v_item.qty * v_si.unit_price, 2), p_restock);

    if p_restock then
      insert into public.stock_movements (product_id, quantity_delta, movement_type, reference_table, reference_id, recorded_by)
      values (v_si.product_id, v_item.qty, 'sales_return', 'returns', v_return_id, auth.uid());
    end if;

    v_total := v_total + round(v_item.qty * v_si.unit_price, 2);
  end loop;

  update public.returns set subtotal = v_total, total = v_total where id = v_return_id;

  -- cash-type refund = payment out to customer; credit note adjusts balance via view
  if p_refund_method is not null and p_refund_method <> 'credit' then
    insert into public.payments (direction, method, amount, customer_id, note, recorded_by)
    values ('out', p_refund_method, v_total, v_sale.customer_id,
            'Refund for ' || v_return_no, auth.uid());
  end if;

  update public.sales set status = case
    when (select coalesce(sum(quantity), 0) from public.return_items ri
          join public.sale_items si on si.id = ri.original_item_id
          where si.sale_id = p_sale_id and ri.return_id in
            (select id from public.returns where kind = 'sale' and is_deleted = false))
      >= (select sum(quantity) from public.sale_items where sale_id = p_sale_id and is_deleted = false)
    then 'fully_returned' else 'partially_returned' end
  where id = p_sale_id;

  return jsonb_build_object('return_id', v_return_id, 'return_no', v_return_no, 'total', v_total);
end $$;

-- ---------------------------------------------------------------------------
-- fn_record_purchase_return
-- p_items: [{"purchase_item_id":uuid,"quantity":num}]
-- ---------------------------------------------------------------------------
create or replace function public.fn_record_purchase_return(
  p_purchase_id   uuid,
  p_items         jsonb,
  p_refund_method public.payment_method,   -- null => reduce supplier balance (credit)
  p_reason        text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_item record;
  v_pi   record;
  v_total numeric := 0;
  v_return_id uuid;
  v_return_no text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_staff() then raise exception 'Not allowed'; end if;
  if coalesce(jsonb_array_length(p_items), 0) = 0 then raise exception 'No items selected'; end if;
  if not exists (select 1 from public.purchases where id = p_purchase_id and is_deleted = false) then
    raise exception 'Purchase not found';
  end if;

  insert into public.returns (kind, original_id, restock, refund_method, credit_note, reason, created_by)
  values ('purchase', p_purchase_id, true, p_refund_method, p_refund_method is null, p_reason, auth.uid())
  returning id, return_no into v_return_id, v_return_no;

  for v_item in
    select (e)->>'purchase_item_id' as pii, ((e)->>'quantity')::numeric as qty
    from jsonb_array_elements(p_items) e
  loop
    select * into v_pi from public.purchase_items
      where id = v_item.pii::uuid and purchase_id = p_purchase_id and is_deleted = false for update;
    if not found then raise exception 'Purchase item not found'; end if;
    if v_item.qty <= 0 or v_item.qty > v_pi.quantity then raise exception 'Invalid return quantity'; end if;

    insert into public.return_items (return_id, product_id, quantity, unit_price, cost_price, line_total, restocked)
    values (v_return_id, v_pi.product_id, v_item.qty, v_pi.unit_cost, v_pi.unit_cost,
            round(v_item.qty * v_pi.unit_cost, 2), true);

    -- stock leaves the shelf
    insert into public.stock_movements (product_id, quantity_delta, movement_type, reference_table, reference_id, recorded_by)
    values (v_pi.product_id, -v_item.qty, 'purchase_return', 'returns', v_return_id, auth.uid());

    v_total := v_total + round(v_item.qty * v_pi.unit_cost, 2);
  end loop;

  update public.returns set subtotal = v_total, total = v_total where id = v_return_id;

  if p_refund_method is not null and p_refund_method <> 'credit' then
    insert into public.payments (direction, method, amount, supplier_id, purchase_id, note, recorded_by)
    values ('in', p_refund_method, v_total,
            (select supplier_id from public.purchases where id = p_purchase_id),
            p_purchase_id, 'Refund for ' || v_return_no, auth.uid());
  else
    -- credit return: shrink the amount owed to the supplier
    update public.purchases set total = greatest(total - v_total, 0) where id = p_purchase_id;
  end if;

  return jsonb_build_object('return_id', v_return_id, 'return_no', v_return_no, 'total', v_total);
end $$;

-- ---------------------------------------------------------------------------
-- fn_record_purchase — atomic purchase + items + movements + weighted cost
-- p_items:    [{"product_id":uuid,"quantity":num,"unit_cost":num}]
-- p_payments: [{"method":"cash|card|bank|cheque|credit","amount":num,"reference_no":?}]
-- ---------------------------------------------------------------------------
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
    insert into public.purchase_items (purchase_id, product_id, quantity, unit_cost, line_total)
    values (v_purchase_id, v_item.pid::uuid, v_item.qty, v_item.cost, round(v_item.qty * v_item.cost, 2));
    insert into public.stock_movements (product_id, quantity_delta, movement_type, reference_table, reference_id, recorded_by)
    values (v_item.pid::uuid, v_item.qty, 'purchase', 'purchases', v_purchase_id, auth.uid());
    perform public.fn_apply_weighted_cost(v_item.pid::uuid, v_item.qty, v_item.cost);
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
      if v_pay.method = 'cheque' then
        insert into public.cheques (direction, status, cheque_no, bank, amount, cheque_date,
                                    party_name, supplier_id, purchase_id, recorded_by)
        values ('issued', 'pending', coalesce(v_pay.cheque_no, ''), coalesce(v_pay.bank, ''),
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

-- ---------------------------------------------------------------------------
-- fn_receive_payment — standalone customer receipt / supplier payment
-- ---------------------------------------------------------------------------
create or replace function public.fn_receive_payment(
  p_direction   text,
  p_method      public.payment_method,
  p_amount      numeric,
  p_customer_id uuid,
  p_supplier_id uuid,
  p_sale_id     uuid,
  p_purchase_id uuid,
  p_reference_no text,
  p_note        text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  if p_direction = 'in' and p_customer_id is null then raise exception 'Customer required'; end if;
  if p_direction = 'out' and p_supplier_id is null then raise exception 'Supplier required'; end if;
  insert into public.payments (direction, method, amount, customer_id, supplier_id,
                               sale_id, purchase_id, reference_no, note, recorded_by)
  values (p_direction, p_method, p_amount, p_customer_id, p_supplier_id,
          p_sale_id, p_purchase_id, p_reference_no, p_note, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- fn_adjust_stock — the ONLY way to move stock outside sale/purchase/return
-- ---------------------------------------------------------------------------
create or replace function public.fn_adjust_stock(
  p_product_id uuid,
  p_delta      numeric,
  p_reason     text,
  p_note       text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_staff() then raise exception 'Only admin/manager may adjust stock'; end if;
  if coalesce(p_delta, 0) = 0 then raise exception 'Delta must be non-zero'; end if;
  if coalesce(p_reason, '') = '' then raise exception 'Reason is required'; end if;
  if not exists (select 1 from public.products where id = p_product_id) then
    raise exception 'Product not found';
  end if;
  insert into public.stock_movements (product_id, quantity_delta, movement_type, reference_table, reason, note, recorded_by)
  values (p_product_id, p_delta, 'adjustment', 'manual', p_reason, p_note, auth.uid());
end $$;

-- ---------------------------------------------------------------------------
-- fn_stock_take — set exact counted quantities (stock-take/audit screen)
-- p_counts: [{"product_id":uuid,"counted_qty":num}]
-- ---------------------------------------------------------------------------
create or replace function public.fn_stock_take(p_counts jsonb, p_note text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_row record; v_current numeric; v_delta numeric; v_adjusted int := 0;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_staff() then raise exception 'Not allowed'; end if;
  for v_row in
    select (e)->>'product_id' as pid, ((e)->>'counted_qty')::numeric as counted
    from jsonb_array_elements(p_counts) e
  loop
    select coalesce(sum(quantity_delta), 0) into v_current
      from public.stock_movements where product_id = v_row.pid::uuid;
    v_delta := v_row.counted - v_current;
    if v_delta <> 0 then
      insert into public.stock_movements (product_id, quantity_delta, movement_type, reference_table, reason, note, recorded_by)
      values (v_row.pid::uuid, v_delta, 'adjustment', 'stock_take', 'stock-take', p_note, auth.uid());
      v_adjusted := v_adjusted + 1;
    end if;
  end loop;
  return jsonb_build_object('adjusted_count', v_adjusted);
end $$;

-- ---------------------------------------------------------------------------
-- fn_get_bill — reprint data WITHOUT cost columns (cashier-safe)
-- ---------------------------------------------------------------------------
create or replace function public.fn_get_bill(p_sale_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'sale', (select jsonb_build_object(
                'id', sa.id, 'bill_no', sa.bill_no, 'sale_date', sa.sale_date,
                'subtotal', sa.subtotal, 'line_discounts', sa.line_discounts,
                'bill_discount', sa.bill_discount, 'tax_amount', sa.tax_amount,
                'grand_total', sa.grand_total, 'paid_amount', sa.paid_amount,
                'balance_amount', sa.balance_amount, 'status', sa.status, 'note', sa.note,
                'customer_name', c.name, 'customer_phone', c.phone, 'customer_type', c.type,
                'cashier_name', pf.full_name)),
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
                'id', si.id, 'name', p.name, 'sku', p.sku, 'unit', p.unit,
                'quantity', si.quantity, 'unit_price', si.unit_price,
                'discount', si.discount, 'line_total', si.line_total) order by si.created_at), '[]'::jsonb)
              from public.sale_items si
              join public.products p on p.id = si.product_id
              where si.sale_id = p_sale_id and si.is_deleted = false),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object(
                'method', pm.method, 'amount', pm.amount,
                'reference_no', pm.reference_no, 'cheque_status', ch.status) order by pm.created_at), '[]'::jsonb)
                 from public.payments pm
                 left join public.cheques ch on ch.id = pm.cheque_id
                 where pm.sale_id = p_sale_id and pm.is_deleted = false),
    'settings', (select to_jsonb(st) from public.settings st where st.id = 1)
  )
  from public.sales sa
  left join public.customers c on c.id = sa.customer_id
  left join public.profiles pf on pf.id = sa.created_by
  where sa.id = p_sale_id;
$$;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table public.profiles           enable row level security;
alter table public.settings           enable row level security;
alter table public.categories         enable row level security;
alter table public.products           enable row level security;
alter table public.suppliers          enable row level security;
alter table public.customers          enable row level security;
alter table public.stock_movements    enable row level security;
alter table public.purchases          enable row level security;
alter table public.purchase_items     enable row level security;
alter table public.sales              enable row level security;
alter table public.sale_items         enable row level security;
alter table public.payments           enable row level security;
alter table public.cheques            enable row level security;
alter table public.returns            enable row level security;
alter table public.return_items       enable row level security;
alter table public.expense_categories enable row level security;
alter table public.expenses           enable row level security;
alter table public.income             enable row level security;
alter table public.held_bills         enable row level security;
alter table public.audit_log          enable row level security;

-- profiles: self + staff read; admin manages
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_staff());
create policy profiles_insert on public.profiles for insert
  with check (public.is_admin() or id = auth.uid());
create policy profiles_update on public.profiles for update
  using (public.is_admin()) with check (public.is_admin());
create policy profiles_self_update on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid() and role = public.current_user_role());
create policy profiles_delete on public.profiles for delete using (public.is_admin());

-- settings: read all staff+cashier; update admin only
create policy settings_select on public.settings for select to authenticated using (true);
create policy settings_update on public.settings for update
  using (public.is_admin()) with check (public.is_admin());

-- categories: read = any authenticated; write = staff
create policy categories_select on public.categories for select to authenticated using (is_deleted = false);
create policy categories_write  on public.categories for all
  using (public.is_staff()) with check (public.is_staff());

-- products: cashier must use v_products_pos (cost hidden)
create policy products_select on public.products for select using (public.is_staff());
create policy products_write  on public.products for all
  using (public.is_staff()) with check (public.is_staff());

-- suppliers: staff only
create policy suppliers_select on public.suppliers for select using (public.is_staff());
create policy suppliers_write  on public.suppliers for all
  using (public.is_staff()) with check (public.is_staff());

-- customers: POS needs read/create; delete staff only
create policy customers_select on public.customers for select to authenticated
  using (is_deleted = false);
create policy customers_insert on public.customers for insert to authenticated
  with check (name is not null and btrim(name) <> '');
create policy customers_update on public.customers for update to authenticated
  using (is_deleted = false) with check (is_deleted = false and name is not null and btrim(name) <> '');
create policy customers_delete on public.customers for delete using (public.is_staff());

-- stock_movements: staff read; writes only via SECURITY DEFINER functions
create policy stock_movements_select on public.stock_movements for select using (public.is_staff());

-- purchases
create policy purchases_read  on public.purchases for select using (public.is_staff());
create policy purchases_write on public.purchases for all
  using (public.is_staff()) with check (public.is_staff());
create policy purchase_items_read  on public.purchase_items for select using (public.is_staff());
create policy purchase_items_write on public.purchase_items for all
  using (public.is_staff()) with check (public.is_staff());

-- sales: cashier sees own bills; direct insert blocked (use fn_checkout)
create policy sales_select on public.sales for select
  using (public.is_staff() or created_by = auth.uid());
create policy sales_update on public.sales for update
  using (public.is_staff()) with check (public.is_staff());
create policy sales_delete on public.sales for delete using (public.is_admin());

-- sale_items contain cost_price → staff only; cashier uses fn_get_bill
create policy sale_items_select on public.sale_items for select using (public.is_staff());

-- payments
create policy payments_select on public.payments for select
  using (public.is_staff() or recorded_by = auth.uid());
create policy payments_insert on public.payments for insert with check (direction = 'in');
create policy payments_update on public.payments for update
  using (public.is_staff()) with check (public.is_staff());
create policy payments_delete on public.payments for delete using (public.is_staff());

-- cheques
create policy cheques_select on public.cheques for select
  using (public.is_staff() or recorded_by = auth.uid());
create policy cheques_insert_received on public.cheques for insert
  with check (direction = 'received');
create policy cheques_update on public.cheques for update
  using (public.is_staff()) with check (public.is_staff());
create policy cheques_delete on public.cheques for delete using (public.is_staff());

-- returns (writes via RPC; admin may soft-delete)
create policy returns_select on public.returns for select
  using (public.is_staff() or created_by = auth.uid());
create policy returns_delete on public.returns for delete using (public.is_admin());
create policy return_items_select on public.return_items for select
  using (public.is_staff() or exists (
    select 1 from public.returns r where r.id = return_id and r.created_by = auth.uid()));

-- expenses / income: staff only (cashier never sees)
create policy expenses_read  on public.expenses for select using (public.is_staff());
create policy expenses_write on public.expenses for all
  using (public.is_staff()) with check (public.is_staff());
create policy income_read    on public.income for select using (public.is_staff());
create policy income_write   on public.income for all
  using (public.is_staff()) with check (public.is_staff());
create policy expense_cats_rw on public.expense_categories for all
  using (public.is_staff()) with check (public.is_staff());

-- held_bills: own rows + staff oversight
create policy held_select on public.held_bills for select
  using (held_by = auth.uid() or public.is_staff());
create policy held_insert on public.held_bills for insert with check (held_by = auth.uid());
create policy held_update on public.held_bills for update
  using (held_by = auth.uid() or public.is_staff())
  with check (held_by = auth.uid() or public.is_staff());
create policy held_delete on public.held_bills for delete
  using (held_by = auth.uid() or public.is_staff());

-- audit_log: admin read; writes only via audit trigger (definer)
create policy audit_select on public.audit_log for select using (public.is_admin());

-- Ensure default grants for the API roles exist (Supabase default already grants; kept idempotent)
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- ============================================================================
-- REPORTING HELPER VIEWS (used by dashboard/reports in Phase 6)
-- ============================================================================
-- Security invoker: staff see all sales; cashiers (whose `sales` RLS is own-bills-only)
-- safely get their own daily totals instead of a permission error, matching their KPI cards.
create or replace view public.v_sales_daily with (security_invoker = true) as
select s.sale_date,
       sum(s.grand_total)    as total_sales,
       sum(s.paid_amount)    as total_paid,
       sum(s.balance_amount) as total_credit,
       count(*)              as bill_count
from public.sales s
where s.is_deleted = false and s.status <> 'void'
group by s.sale_date;

-- Security invoker: depends on `sale_items` (is_staff-only) and is fetched only under
-- the `staff` guard on the dashboard / reports, so the caller always has base access.
create or replace view public.v_profit_daily with (security_invoker = true) as
select s.sale_date,
       sum(si.line_total)                                        as revenue,
       sum(si.quantity * si.cost_price)                          as cogs,
       sum(si.line_total - si.quantity * si.cost_price)          as gross_profit
from public.sales s
join public.sale_items si on si.sale_id = s.id and si.is_deleted = false
where s.is_deleted = false and s.status <> 'void'
group by s.sale_date;
