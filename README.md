# H.K Motors Bike — POS & Inventory Management System

Production-grade POS and inventory platform for a spare parts company.
Next.js 14 (App Router, TypeScript) · Tailwind + shadcn/ui · Supabase (PostgreSQL, Auth, RLS) · LKR.

## Roles

| Role | Access |
|---|---|
| admin | Everything, incl. settings, users, audit log |
| manager | Everything except settings/users |
| cashier | POS, customers, returns, payments — **never sees cost price or profit** (enforced by RLS: cashiers read `v_products_pos`, never `products`/`sale_items`) |

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run, **in this exact order**:
   - `supabase/schema.sql`  — tables, enums, core views, RPCs, triggers, RLS
   - `supabase/seed.sql`  — settings, categories, 20 products w/ opening stock, suppliers, customers
   - `supabase/phase2.sql`  — Storage bucket for product images + policies
   - `supabase/phase3.sql`  — Purchases & inventory (views + RPCs)
   - `supabase/phase4.sql`  — POS, Sales, Money, Reports, Settings (incl. `v_users`, `v_audit_feed`, `v_cash_up`)
   - `supabase/phase5_advisor_fixes.sql`  — Supabase Advisor hardening (security-invoker views)
   - `supabase/phase6_advisor_warnings.sql`  — Supabase Advisor warnings (function search_path, RLS, storage, RPC grants)

   Skipping a phase will break the sections that depend on its views/RPCs.
3. **Authentication → Users → Add user** (autoconfirm on) for your team.
4. Give each user a role via **Authentication → Users → (user) → Metadata**:
   ```json
   { "role": "admin", "full_name": "Nuwan Perera" }
   ```
   Existing accounts can simply be updated in SQL:
   ```sql
   update public.profiles set role='admin',   full_name='Nuwan Perera'   where email='you@yourcompany.lk';
   update public.profiles set role='manager', full_name='Ishara Silva'   where email='manager@yourcompany.lk';
   update public.profiles set role='cashier', full_name='Ruwan Fernando' where email='cashier@yourcompany.lk';
   ```

### 2. App

```bash
cp .env.local.example .env.local   # paste your Supabase URL + anon key
npm install
npm run dev                        # http://localhost:3000
```

Sign in at `/login`. The sidebar shows only what your role allows.

## Project layout

```
supabase/
  schema.sql      # tables, enums, views, RPC functions, triggers, RLS
  seed.sql        # categories, 20 products w/ opening stock, 3 suppliers, 5 customers
  phase2.sql      # product-images storage bucket + RLS policies
  phase3.sql      # purchases & inventory addenda (views/RPCs)
  phase4.sql      # POS / sales / money / reports / settings (v_users, v_audit_feed, v_cash_up)
  phase5_advisor_fixes.sql # security-invoker view hardening for Supabase Advisor
  phase6_advisor_warnings.sql # search_path / RLS / storage / function-grant hardening
src/
  app/
    login/                    # email+password sign-in
    (app)/                    # authenticated shell: dashboard, POS, products, ...
  components/
    ui/                       # shadcn/ui primitives
    layout/                   # sidebar, topbar, nav config (role-filtered)
  lib/
    supabase/                 # browser / server / middleware clients
    auth.ts                   # getProfile / requireStaff / requireAdmin guards
    types.ts                  # shared domain types
    utils.ts                  # cn, LKR money format, stock badge logic
```

## Key DB rules (enforced in schema.sql)

- Stock is **only** changed via `stock_movements` rows (`opening / purchase / sale / sales_return / purchase_return / adjustment`).
- `sale_items.cost_price` is snapshotted at checkout → profit stays accurate.
- Checkout is atomic: `fn_checkout(...)` runs sale + items + movements + payments + credit-limit + stock checks in one Postgres transaction.
- Bounced/returned cheques auto-reverse linked payments via trigger → customer balance restored.
- Weighted-average supplier cost applied in `fn_record_purchase`.
- Customer balance = opening + credit sales − receipts − credit notes (`v_customer_balances`).
- Supplier balance = opening + purchases − payments − returns (`v_supplier_balances`).
- All writes to transactional tables are captured in `audit_log`.

## Supabase Security Advisor (status: resolved)

All Database Linter items are addressed via `phase5_advisor_fixes.sql` and
`phase6_advisor_warnings.sql`:

- **Security-definer views** — 5 of 7 converted to `security_invoker = true`
  (`v_category_product_counts`, `v_stock_levels`, `v_supplier_balances`, `v_sales_daily`, `v_profit_daily`).
- **Two views are intentionally `SECURITY DEFINER`** and must be marked **Resolved** in the
  Advisor (converting them would break the cashier POS or understate balances, or move the
  same warning onto a function):
  - `v_products_pos` — hides `cost_price` from cashiers who have no `SELECT` on `products`.
  - `v_customer_balances` — gives cashiers (who can only read their own bills under RLS)
    correct company-wide receivables; a security-invoker version would understate them.
- **Warnings** — function `search_path`, `WITH CHECK (true)` customer policies, the public
  bucket listing policy, and anon RPC grants are all fixed in `phase6_advisor_warnings.sql`.
- **Leaked-password protection** — enable in Dashboard → Authentication → Password (not SQL).

## Phases

- [x] **Phase 1** — Setup, schema + RLS + seed, auth/roles, layout shell
- [x] Phase 2 — Categories, products, barcode labels, suppliers, customers
- [x] Phase 3 — Purchases (stock in), inventory & stock movements
- [x] Phase 4 — POS screen, checkout, bill printing, hold/recall
- [x] Phase 5 — Payments, credit, cheques, returns
- [x] Phase 6 — Expenses/income, dashboard charts, reports, exports
- [x] Phase 7 — Settings, audit log UI, PWA/offline
