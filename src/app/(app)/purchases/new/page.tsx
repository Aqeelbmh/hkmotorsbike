import { requireStaff } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { PurchaseForm } from './purchase-form'

export const metadata = { title: 'New purchase' }
export const dynamic = 'force-dynamic'

export default async function NewPurchasePage() {
  await requireStaff()
  const supabase = createClient()

  const [{ data: suppliers }, { data: products }, { data: lastCosts }] = await Promise.all([
    supabase
      .from('suppliers')
      .select('id, name, credit_terms_days, phone')
      .eq('is_deleted', false)
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('v_products_full')
      .select('id, sku, name, unit, brand, barcode, cost_price, selling_price, qty_on_hand, rack_location')
      .eq('is_active', true)
      .order('name'),
    supabase.from('v_last_purchase_costs').select('product_id, last_unit_cost'),
  ])

  const lastCostMap: Record<string, number> = {}
  ;(lastCosts ?? []).forEach((r: any) => (lastCostMap[r.product_id] = Number(r.last_unit_cost)))

  return (
    <div className="space-y-6">
      <PageHeader
        title="New purchase"
        description="Receive goods from a supplier — stock, weighted-average cost and payments post together"
      />
      <PurchaseForm
        suppliers={(suppliers ?? []) as any[]}
        products={(products ?? []) as any[]}
        lastCosts={lastCostMap}
      />
    </div>
  )
}
