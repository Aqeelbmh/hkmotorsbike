import { getProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { ChequesClient } from './cheques-client'
import type { ChequeRow, Settings } from '@/lib/types'

export const metadata = { title: 'Cheques' }
export const dynamic = 'force-dynamic'

export default async function ChequesPage() {
  const profile = await getProfile()
  const supabase = createClient()

  const [{ data: cheques }, { data: settingsRow }] = await Promise.all([
    supabase.from('v_cheques_detail').select('*').order('cheque_date', { ascending: true }).limit(1000),
    supabase.from('settings').select('currency_symbol').eq('id', 1).maybeSingle(),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cheques"
        description="Received and issued cheque register — bounce auto-reverses the linked payment"
      />
      <ChequesClient
        cheques={(cheques ?? []) as ChequeRow[]}
        symbol={(settingsRow as Pick<Settings, 'currency_symbol'> | null)?.currency_symbol ?? 'Rs.'}
        staff={profile.role !== 'cashier'}
      />
    </div>
  )
}
