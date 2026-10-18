import Link from 'next/link'
import { Plus } from 'lucide-react'
import { getProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { SalesTable } from './sales-table'
import type { SaleRow, Settings } from '@/lib/types'

export const metadata = { title: 'Sales' }
export const dynamic = 'force-dynamic'

export default async function SalesPage() {
  const profile = await getProfile()
  const supabase = createClient()

  // RLS scope: cashiers only ever receive their own bills here.
  const [{ data: sales }, { data: settingsRow }] = await Promise.all([
    supabase
      .from('v_sales_list')
      .select('*')
      .order('sold_at', { ascending: false })
      .limit(1000),
    supabase.from('settings').select('currency_symbol').eq('id', 1).maybeSingle(),
  ])

  const symbol = (settingsRow as Pick<Settings, 'currency_symbol'> | null)?.currency_symbol ?? 'Rs.'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Sales"
          description={
            profile.role === 'cashier'
              ? 'Bills you have raised — tap a row to view or reprint'
              : 'Every bill raised at the counter — tap a row to view or reprint'
          }
        />
        <Button asChild>
          <Link href="/pos">
            <Plus className="h-4 w-4" /> New sale
          </Link>
        </Button>
      </div>
      <SalesTable sales={(sales ?? []) as SaleRow[]} symbol={symbol} />
    </div>
  )
}
