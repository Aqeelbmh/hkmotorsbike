import { getProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { ReturnsClient } from './returns-client'
import type { ReturnRow, SaleRow, Settings } from '@/lib/types'

export const metadata = { title: 'Returns' }
export const dynamic = 'force-dynamic'

export default async function ReturnsPage() {
  const profile = await getProfile()
  const supabase = createClient()

  const [{ data: returns }, { data: bills }, { data: settingsRow }] = await Promise.all([
    supabase.from('v_returns_list').select('*').order('return_date', { ascending: false }).limit(1000),
    supabase
      .from('v_sales_list')
      .select('id, bill_no, sale_date, customer_name, grand_total, status')
      .neq('status', 'fully_returned')
      .order('sold_at', { ascending: false })
      .limit(200),
    supabase.from('settings').select('currency_symbol').eq('id', 1).maybeSingle(),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Returns"
        description="Sales returns with restock / refund / credit note, plus purchase returns to suppliers"
      />
      <ReturnsClient
        returns={(returns ?? []) as ReturnRow[]}
        bills={(bills ?? []) as Pick<SaleRow, 'id' | 'bill_no' | 'sale_date' | 'customer_name' | 'grand_total' | 'status'>[]}
        symbol={(settingsRow as Pick<Settings, 'currency_symbol'> | null)?.currency_symbol ?? 'Rs.'}
        staff={profile.role !== 'cashier'}
      />
    </div>
  )
}
