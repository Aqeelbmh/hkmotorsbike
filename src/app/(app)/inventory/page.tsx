import { requireStaff } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { InventoryClient } from './inventory-client'
import type { InventoryRow } from '@/lib/types'

export const metadata = { title: 'Inventory' }
export const dynamic = 'force-dynamic'

export default async function InventoryPage() {
  await requireStaff()
  const supabase = createClient()

  const [{ data: rows }, { data: cats }] = await Promise.all([
    supabase
      .from('v_inventory_valuation')
      .select('id, sku, name, unit, brand, rack_location, reorder_level, cost_price, selling_price, is_active, category_id, category_name, qty_on_hand, value_at_cost, value_at_sale, is_out_of_stock, is_low_stock')
      .order('name'),
    supabase.from('categories').select('id, name, parent_id').eq('is_deleted', false).order('name'),
  ])

  const inventory = (rows ?? []) as InventoryRow[]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description="Stock levels come from the movement ledger — nothing here edits quantity directly"
      />
      <InventoryClient inventory={inventory} categories={(cats ?? []) as any[]} />
    </div>
  )
}
