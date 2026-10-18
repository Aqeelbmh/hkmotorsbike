import { getProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { ProductsClient } from './products-client'
import type { Category, ProductFull, ProductPOS } from '@/lib/types'

export const metadata = { title: 'Products' }
export const dynamic = 'force-dynamic'

export default async function ProductsPage() {
  const profile = await getProfile()
  const staff = profile.role !== 'cashier'
  const supabase = createClient()

  const [{ data: cats }, posRes, fullRes, stockRes] = await Promise.all([
    supabase.from('categories').select('*').eq('is_deleted', false).order('sort_order'),
    staff
      ? Promise.resolve({ data: null })
      : supabase.from('v_products_pos').select('*').order('name'),
    staff ? supabase.from('products').select('*').order('name') : Promise.resolve({ data: null }),
    staff
      ? supabase.from('v_stock_levels').select('product_id, qty_on_hand')
      : Promise.resolve({ data: null }),
  ])

  const categories = (cats ?? []) as Category[]
  let products: (ProductFull | ProductPOS)[]

  if (staff) {
    const stockMap = new Map<string, number>()
    ;(stockRes.data ?? []).forEach((s: any) => stockMap.set(s.product_id, Number(s.qty_on_hand)))
    products = ((fullRes.data ?? []) as any[]).map((p) => {
      const qty = stockMap.get(p.id) ?? 0
      return {
        ...p,
        qty_on_hand: qty,
        is_low_stock: qty <= p.reorder_level,
        category_name: categories.find((c) => c.id === p.category_id)?.name ?? null,
      }
    })
  } else {
    products = (posRes.data ?? []) as ProductPOS[]
  }

  return <ProductsClient products={products} categories={categories} staff={staff} />
}
