import { requireStaff } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { SupplierManager } from './supplier-manager'
import type { Supplier } from '@/lib/types'

export const metadata = { title: 'Suppliers' }
export const dynamic = 'force-dynamic'

export default async function SuppliersPage() {
  await requireStaff()
  const supabase = createClient()

  const [{ data: rows }, { data: bals }] = await Promise.all([
    supabase.from('suppliers').select('*').eq('is_deleted', false).order('name'),
    supabase.from('v_supplier_balances').select('id, balance'),
  ])

  const balanceMap: Record<string, number> = {}
  ;(bals ?? []).forEach((b: any) => (balanceMap[b.id] = Number(b.balance)))

  const suppliers = (rows ?? []) as Supplier[]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suppliers"
        description="Trade accounts, credit terms and outstanding balances"
      />
      <SupplierManager suppliers={suppliers} balances={balanceMap} />
    </div>
  )
}
