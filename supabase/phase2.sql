-- ============================================================================
-- Phase 2 addendum — Storage bucket for product images + helpers
-- Run in Supabase SQL Editor AFTER schema.sql.
-- ============================================================================

-- Public-read bucket for product images (created via API so policies apply)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 4194304, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

-- NOTE: no SELECT policy is created on purpose. `product-images` is a PUBLIC bucket,
-- so objects are served directly by URL (getPublicUrl). A broad `for select` policy
-- here only lets clients LIST every object in the bucket, which the Supabase Advisor
-- flags (public_bucket_allows_listing). Object access does not depend on it.
--
-- Staff can upload/replace/delete (is_staff() reads profiles via definer fn)
create policy "staff upload product images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_staff());

create policy "staff manage product images"
  on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.is_staff());

create policy "staff delete product images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.is_staff());

-- service_role needs RPC/function execute too (phase 7 backups, server scripts)
grant execute on all functions in schema public to service_role;

-- Products per category (guards category delete, powers tree counts)
-- Security invoker: only staff read this (Categories is a staff route) and staff
-- already have SELECT on both categories and products, so RLS-of-caller is safe.
create or replace view public.v_category_product_counts with (security_invoker = true) as
select c.id as category_id, count(p.id) as product_count
from public.categories c
left join public.products p on p.category_id = c.id and p.is_deleted = false
group by c.id;
grant select on public.v_category_product_counts to authenticated;
