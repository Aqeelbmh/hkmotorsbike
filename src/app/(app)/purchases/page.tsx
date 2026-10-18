import Link from 'next/link'
import { requireStaff } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { PurchasesTable } from './purchases-table'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import type { Purchase } from '@/lib/types'

export const metadata = { title: 'Purchases' }
export const dynamic = 'force-dynamic'

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: { supplier?: string; status?: string }
}) {
  await requireStaff()
  const supabase = createClient()

  let query = supabase
    .from('purchases')
    .select('id, purchase_no, supplier_id, supplier_invoice_no, purchase_date, subtotal, discount, tax_amount, total, paid_amount, notes, created_by, created_at, suppliers(name)')
    .eq('is_deleted', false)
    .order('purchase_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1000)

  if (searchParams.supplier) query = query.eq('supplier_id', searchParams.supplier)

  const [{ data: rows }, { data: suppliers }] = await Promise.all([
    query,
    supabase.from('suppliers').select('id, name').eq('is_deleted', false).order('name'),
  ])

  const purchases = (rows ?? []).map((r: any) => ({
    ...r,
    supplier_name: r.suppliers?.name ?? null,
  })) as Purchase[]

  const paidThrough = (rows ?? []).reduce(
    (a, r: any) => a + Math.max(Number(r.paid_amount) - Number(r.total), 0),
    0
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Purchases"
          description="Goods received from suppliers — cost prices update by weighted average automatically"
        />
        <Button asChild>
          <Link href="/purchases/new">
            <Plus className="h-4 w-4" /> New purchase
          </Link>
        </Button>
      </div>

      <PurchasesTable
        purchases={purchases}
        suppliers={(suppliers ?? []) as { id: string; name: string }[]}
        supplierFilter={searchParams.supplier ?? ''}
        paidThrough={paidThrough}
      />
    </div>
  )
}
