import Link from 'next/link'
import { requireStaff } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Boxes, ArrowLeft } from 'lucide-react'
import { MovementsTable } from './movements-table'
import type { StockMovement } from '@/lib/types'

export const metadata = { title: 'Stock movements' }
export const dynamic = 'force-dynamic'

const TYPES = ['opening', 'purchase', 'sale', 'sales_return', 'purchase_return', 'adjustment']

export default async function MovementsPage({
  searchParams,
}: {
  searchParams: { type?: string; from?: string; to?: string }
}) {
  await requireStaff()
  const supabase = createClient()

  let query = supabase
    .from('v_stock_movements_detail')
    .select('id, created_at, product_id, sku, product_name, unit, rack_location, quantity_delta, movement_type, reference_table, reference_id, reference_label, reason, note, recorded_by, recorder_name')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(600)

  if (searchParams.type && TYPES.includes(searchParams.type)) {
    query = query.eq('movement_type', searchParams.type)
  }
  if (searchParams.from) query = query.gte('created_at', `${searchParams.from}T00:00:00`)
  if (searchParams.to) query = query.lte('created_at', `${searchParams.to}T23:59:59`)

  const { data: rows } = await query

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Stock movements"
          description="The immutable ledger behind every stock level — sales, purchases, returns, adjustments and stock-takes"
        />
        <Button asChild variant="outline">
          <Link href="/inventory">
            <ArrowLeft className="h-4 w-4" /> Back to inventory
          </Link>
        </Button>
      </div>

      <MovementsTable
        movements={(rows ?? []) as unknown as StockMovement[]}
        typeFilter={searchParams.type ?? ''}
        from={searchParams.from ?? ''}
        to={searchParams.to ?? ''}
      />

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Boxes className="h-3.5 w-3.5" />
        Quantities can only change through a sale, purchase, return, adjustment or stock-take — never
        by editing a product.
      </p>
    </div>
  )
}
