-- ============================================================================
-- H.K MOTORS BIKE POS — Supabase Advisor: WARNINGS remediation (batch 2)
-- Run in the Supabase SQL Editor. Idempotent. Safe to re-run.
--
-- Clears the 28 mechanically-fixable warnings from the Advisor export.
-- The 11 remaining "authenticated can execute SECURITY DEFINER function"
-- warnings are intentional (see section E) and 1 Auth dashboard toggle
-- (leaked-password protection, section F) — those are resolve / enable, not SQL.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A) function_search_path_mutable (2)
--    Pin search_path on the two trigger helpers (also fixed in schema.sql).
-- ---------------------------------------------------------------------------
alter function public.fn_product_defaults()  set search_path = public;
alter function public.fn_touch_updated_at()  set search_path = public;

-- ---------------------------------------------------------------------------
-- B) rls_policy_always_true (2)
--    Replace the blanket WITH CHECK (true) / USING (true) customer policies
--    with real predicates. POS still lets any signed-in user create/edit
--    ACTIVE customers with a non-blank name.
-- ---------------------------------------------------------------------------
drop policy if exists customers_insert on public.customers;
create policy customers_insert on public.customers for insert to authenticated
  with check (name is not null and btrim(name) <> '');

drop policy if exists customers_update on public.customers;
create policy customers_update on public.customers for update to authenticated
  using (is_deleted = false) with check (is_deleted = false and name is not null and btrim(name) <> '');

-- ---------------------------------------------------------------------------
-- C) public_bucket_allows_listing (1)
--    product-images is a PUBLIC bucket; getPublicUrl works without a SELECT
--    policy. Drop the broad policy so clients can't list all objects.
-- ---------------------------------------------------------------------------
drop policy if exists "product images public read" on storage.objects;

-- ---------------------------------------------------------------------------
-- D) anon_security_definer_function_executable (17) + internal-fn revokes
--    Supabase grants functions to PUBLIC, so anon inherits EXECUTE. To remove
--    it for anon we must revoke the PUBLIC grant. Functions that signed-in
--    users legitimately need are re-granted to `authenticated` explicitly.
--
--    D1) Internal / trigger-only functions: revoke from everyone but the owner
--        (triggers run without an EXECUTE grant; service_role keeps its grant).
-- ---------------------------------------------------------------------------
revoke execute on function public.fn_audit()                                                      from public, anon, authenticated;
revoke execute on function public.fn_handle_new_user()                                            from public, anon, authenticated;
revoke execute on function public.fn_cheque_status_changed()                                      from public, anon, authenticated;
revoke execute on function public.fn_sync_purchase_payments()                                     from public, anon, authenticated;
revoke execute on function public.fn_sync_sale_payments()                                         from public, anon, authenticated;
revoke execute on function public.fn_apply_weighted_cost(uuid, numeric, numeric)                  from public, anon, authenticated;

-- D2) Functions called by signed-in users (RPCs + RLS helpers): strip anon,
--     keep authenticated. RLS policies evaluate is_admin()/is_staff()/
--     current_user_role() as the querying user, so `authenticated` MUST retain
--     EXECUTE on those — revoking it would break every policy check.
revoke execute on function public.current_user_role()                                             from public, anon;
revoke execute on function public.is_admin()                                                      from public, anon;
revoke execute on function public.is_staff()                                                      from public, anon;
revoke execute on function public.fn_get_bill(uuid)                                               from public, anon;
revoke execute on function public.fn_adjust_stock(uuid, numeric, text, text)                      from public, anon;
revoke execute on function public.fn_checkout(uuid, jsonb, numeric, text, jsonb, text)            from public, anon;
revoke execute on function public.fn_receive_payment(text, public.payment_method, numeric, uuid, uuid, uuid, uuid, text, text, text, text, date) from public, anon;
revoke execute on function public.fn_record_purchase(uuid, text, date, jsonb, numeric, jsonb, text) from public, anon;
revoke execute on function public.fn_record_purchase_return(uuid, jsonb, public.payment_method, text) from public, anon;
revoke execute on function public.fn_record_sale_return(uuid, jsonb, boolean, public.payment_method, text) from public, anon;
revoke execute on function public.fn_stock_take(jsonb, text)                                      from public, anon;

grant execute on function public.current_user_role()                                              to authenticated;
grant execute on function public.is_admin()                                                       to authenticated;
grant execute on function public.is_staff()                                                       to authenticated;
grant execute on function public.fn_get_bill(uuid)                                                to authenticated;
grant execute on function public.fn_adjust_stock(uuid, numeric, text, text)                       to authenticated;
grant execute on function public.fn_checkout(uuid, jsonb, numeric, text, jsonb, text)             to authenticated;
grant execute on function public.fn_receive_payment(text, public.payment_method, numeric, uuid, uuid, uuid, uuid, text, text, text, text, date) to authenticated;
grant execute on function public.fn_record_purchase(uuid, text, date, jsonb, numeric, jsonb, text) to authenticated;
grant execute on function public.fn_record_purchase_return(uuid, jsonb, public.payment_method, text) to authenticated;
grant execute on function public.fn_record_sale_return(uuid, jsonb, boolean, public.payment_method, text) to authenticated;
grant execute on function public.fn_stock_take(jsonb, text)                                       to authenticated;

-- ---------------------------------------------------------------------------
-- E) Remaining 11 "authenticated can execute SECURITY DEFINER function"
--    warnings are BY DESIGN — do NOT revoke (it breaks the app):
--      • fn_checkout, fn_get_bill, fn_receive_payment, fn_record_purchase,
--        fn_record_purchase_return, fn_record_sale_return, fn_stock_take,
--        fn_adjust_stock  -> the app's own Postgres RPCs (need definer to write
--                            through RLS atomically).
--      • is_staff, is_admin, current_user_role -> executed inside RLS policy
--                            expressions as the querying (authenticated) user.
--    In Supabase Advisor, mark these 11 as "Resolved" with that rationale.
--
-- F) auth_leaked_password_protection (1): cannot be set via SQL. Enable in the
--    dashboard: Authentication -> (Providers / Sign In) -> Password -> turn on
--    "Leaked password protection". Re-scan the Advisor afterwards.
-- ============================================================================
